import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { ApiService } from './api.service';
import { ChwMap, HealthCenterMap } from '../models/interfaces';
import { UserContextService } from './user-context.service';
import PouchDB from 'pouchdb-browser';
import PouchFind from 'pouchdb-find';
import { DbSyncService } from './db-sync.service';

PouchDB.plugin(PouchFind);

const MAX_BODY_SIZE = 200 * 1024 * 1024; // 200MB
export const BATCH_SIZE = 25;


@Injectable({ providedIn: 'root' })
export class DbService {
  private readonly mapDbName = 'health-map-db';

  public localDb: PouchDB.Database;
  public remoteDb: PouchDB.Database;
  private isOnline = true;

  constructor(
    private api: ApiService,
    private dbSync: DbSyncService,
    private userCtx: UserContextService,
  ) {
    this.localDb = new PouchDB(this.mapDbName);
    this.remoteDb = this.createRemoteDbInstance();
    this.dbSync.initialize(this.localDb, this.remoteDb, this.userCtx.userId, async () => {
      await this.purgeDeletedDocs(this.localDb);
    });
    this.dbSync.startLiveSync();
  }


  private async ensureRemoteDbExists(): Promise<void> {
    const dbUrl = this.api.apiUrl(`/${this.mapDbName}`, false);

    try {
      const headRes = await fetch(dbUrl, { method: 'HEAD' });
      if (headRes.status === 200) {
        return console.log(`✅ La base '${this.mapDbName}' existe déjà`);
      }
      if (headRes.status !== 404) {
        throw new Error(`⚠️ Erreur inattendue lors de la vérification de la base : ${headRes.status}`);
      }
    } catch (err: any) {
      if (err.status === 404 || err.message.includes('404')) {
        console.warn(`ℹ️ Base '${this.mapDbName}' inexistante, tentative de création...`);
        const createRes = await fetch(dbUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!createRes.ok) {
          const msg = await createRes.text();
          throw new Error(`❌ Échec de la création de la base '${this.mapDbName}' : ${msg}`);
        }
        console.log(`✅ Base '${this.mapDbName}' créée avec succès`);
      }
    }
  }


  async purgeDeletedDocs(db: PouchDB.Database): Promise<void> {
    try {
      // 1. Récupérer tous les documents, y compris les tombstones (_deleted)
      const result = await db.allDocs({ include_docs: true });

      // 2. Filtrer ceux qui sont marqués comme supprimés
      const deletedDocs = result.rows
        .filter((r:any) => r.doc && r.doc._deleted)
        .map(r => ({
          _id: r.id,
          _rev: r.value.rev,
          _deleted: true
        }));

      // 3. Supprimer définitivement les documents marqués _deleted
      if (deletedDocs.length > 0) {
        const purgeResult = await db.bulkDocs(deletedDocs, { new_edits: false });
        console.log(`🧹 Purged ${deletedDocs.length} deleted document(s).`);
        console.debug(purgeResult);
      } else {
        console.log("✅ No deleted documents to purge.");
      }
    } catch (error) {
      console.error("❌ Failed to purge deleted documents:", error);
    }
  }


  private createRemoteDbInstance(): PouchDB.Database {
    const remoteUrl = this.api.apiUrl(`/${this.mapDbName}`, false);

    // await this.ensureRemoteDbExists(); // 👈 vérifie/crée la base avant toute chose

    return new PouchDB(remoteUrl, {
      skip_setup: true,
      fetch: async (url: RequestInfo, opts: RequestInit = {}) => {

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        opts = opts || {}
        opts.signal = controller.signal;
        opts.credentials = 'include';

        if (opts.body && typeof opts.body === 'string' && opts.body.length > MAX_BODY_SIZE) {
          return Promise.reject(new Error('❌ Payload Too Large (max 5MB)'));
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // Authorization: `Bearer ${this.userCtx.token}`,
        };

        // Corrige les headers
        opts.headers = {
          ...(opts.headers || {}),
          ...headers,
        };

        // Corrige l'URL pour les cas particuliers
        const u = new URL(url.toString());
        if (u.pathname === '/') u.pathname = '/dbinfo';
        // const requestUrl = typeof url === 'string' ? url : url.url;
        const requestUrl = u.toString();

        // Sécurité : bloquer les documents PUT/POST/DELETE sans _id
        if (opts.body && ['POST', 'PUT', 'DELETE'].includes(opts.method || '')) {
          try {
            const body = JSON.parse(opts.body as string);
            if (body && !body._id) {
              throw new Error('❌ Rejeté: document sans _id.');
            }
          } catch {
            // Ignorer JSON invalides
          }
        }

        const pouchFetch = PouchDB.fetch || fetch;

        try {
          const response = await pouchFetch(requestUrl, opts);
          clearTimeout(timeoutId);

          // 🔁 Gérer /_changes avec fallback 404
          if (u.pathname.endsWith('/_changes')) {
            const cloneResponse = () => {
              return new Response(JSON.stringify({ results: [], last_seq: 0 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            if (response.status === 404) {
              console.warn('⚠️ _changes: base inexistante, réponse simulée');
              return cloneResponse();
            }

            return response.clone().json().then((json: { results: any; error: any; }) => {
              if (json.results && !json.error) return response;
              return cloneResponse();
            });
          }

          if (!response.ok) {
            const errorText = await response.text();

            // Cas spécial : 412 avec "file_exists"
            if (response.status === 412 && errorText.includes('file_exists')) return response;

            if (response.status !== 404) {
              console.warn(`⛔ HTTP ${response.status} - ${response.statusText}`);
              if (response.status >= 500 || response.status === 504) {
                throw new Error(`Serveur distant indisponible (${response.status})`);
              }
            }

            throw new Error(`Erreur HTTP ${response.status} ${response.statusText} - ${errorText}`);
          }

          return response;
        } catch (err: any) {
          clearTimeout(timeoutId);
          // console.warn('⏱️ Timeout ou erreur réseau :', err);
          throw new Error(`Erreur réseau ou timeout : ${err.message || err}`);
        }
      }
    });
  }


  // === CREATE OR UPDATE ===
  async createOrUpdateDoc(doc: ChwMap | HealthCenterMap, type: 'chw' | 'fs'): Promise<boolean> {
    const now = new Date().toISOString();
    const userId = this.userCtx.userId;
    const isAdmin = this.userCtx.isAdmin;
    const dataType = type === 'chw' ? 'chw-map' : 'fs-map';

    try {
      let existingDoc: any = null;

      if (doc._id) {
        try {
          existingDoc = await this.localDb.get(doc._id);
        } catch (err: any) {
          if (err.status !== 404) throw err;
        }
      }

      if (existingDoc) {
        // Vérification des droits d’édition
        if (!isAdmin && existingDoc.owner !== userId) {
          throw new Error('Unauthorized update attempt by non-owner');
        }

        const updatedDoc = {
          ...existingDoc,
          ...doc,
          _id: existingDoc._id,
          _rev: existingDoc._rev,
          type: dataType,
          updatedAt: now,
          updatedBy: userId,
          owner: existingDoc.owner,
          createdAt: existingDoc.createdAt,
        };

        const { _id, _rev, type, owner, ...rest } = updatedDoc;
        const result = await this.localDb.put({ _id, _rev, type, owner, ...rest });
        console.log(`[✔] UPDATE local ${_id}`);

        // Propagation vers la base distante
        if (result.ok && this.remoteDb && this.isOnline) {
          this.dbSync.syncLoop();
          // try {
          //   const remoteDoc = await this.remoteDb.get(_id).catch(() => null);
          //   const remoteToUpdate = {
          //     ...(remoteDoc || {}),
          //     ...updatedDoc,
          //     _rev: remoteDoc?._rev,
          //   };
          //   await this.remoteDb.put(remoteToUpdate);
          //   console.log(`[⇅] UPDATE remote ${_id}`);
          // } catch (err) {
          //   console.warn(`[⚠] Remote update failed for ${_id}:`, err);
          // }
        }

        return result.ok;
      } else {
        // Création d’un nouveau document
        const newDoc = {
          ...doc,
          _id: doc._id ?? uuidv4(),
          type: dataType,
          owner: userId,
          createdAt: doc.createdAt ?? now,
          updatedAt: now,
          updatedBy: userId,
        };

        const { _id, type, owner, ...rest } = newDoc;
        const result = await this.localDb.put({ _id, type, owner, ...rest });
        console.log(`[✔] CREATE local ${_id}`);

        // Propagation vers la base distante
        if (result.ok && this.remoteDb && this.isOnline) {
          this.dbSync.syncLoop();
          // try {
          //   await this.remoteDb.put({ _id, type, owner, ...rest });
          //   console.log(`[⇅] CREATE remote ${_id}`);
          // } catch (err) {
          //   console.warn(`[⚠] Remote creation failed for ${_id}:`, err);
          // }
        }

        return result.ok;
      }
    } catch (e: any) {
      if (e.message === 'Unauthorized update attempt by non-owner') {
        console.warn(`⛔ Unauthorized update by ${userId} on ${doc._id}`);
      } else {
        console.warn(`[✖] CREATE or UPDATE error:`, e);
      }
      return false;
    }
  }


  // === GET ALL DOCS ===
  async getAllDocs(type: 'chw' | 'fs' | 'all'): Promise<(ChwMap | HealthCenterMap)[]> {
    const userId = this.userCtx.userId;
    const isAdmin = this.userCtx.isAdmin;
    const dataType = type === 'chw' ? 'chw-map' : type === 'fs' ? 'fs-map' : undefined;

    try {
      const result = await this.localDb.allDocs({ include_docs: true, descending: true });
      const docs: any[] = result.rows.map(r => r.doc!).filter((d: any) => !!d && !d._deleted);

      const offlineDocs = dataType ? docs.filter(d => d.type === dataType) : docs;
      const filteredOffline = isAdmin ? offlineDocs : offlineDocs.filter(d => d.owner === userId);

      let onlineDocs: any[] = [];

      if (this.remoteDb && this.isOnline) {
        try {
          if (!isAdmin && type === 'all') throw new Error('Type "all" non autorisé pour les utilisateurs non-admin');

          const remoteQuery = isAdmin
            ? this.remoteDb.query('map-client/by_type', { include_docs: true, descending: true, key: dataType })
            : this.remoteDb.query('map-client/by_type_and_owner', { include_docs: true, descending: true, key: [dataType, userId] });

          const remoteResult = await remoteQuery;
          onlineDocs = remoteResult.rows.map(r => r.doc!).filter((d: any) => !!d && !d._deleted);
        } catch (err: any) {
          if (err.name === 'missing_named_view') {
            console.warn('⚠️ View not indexed on remote DB.');
          } else {
            throw err;
          }
        }
      }

      const docMap = new Map<string, any>();
      for (const doc of filteredOffline) docMap.set(doc._id, doc);
      for (const doc of onlineDocs) docMap.set(doc._id, doc);

      return Array.from(docMap.values());
    } catch (err) {
      console.error('getAllDocs error:', err);
      return [];
    }
  }

  // === GET ONE DOC ===
  async getDoc(id: string): Promise<ChwMap | HealthCenterMap | null> {
    const userId = this.userCtx.userId;
    const isAdmin = this.userCtx.isAdmin;

    try {
      const doc: any = await this.localDb.get(id);
      if (!isAdmin && doc.owner !== userId) throw new Error('Unauthorized access to document');
      return doc;
    } catch (e: any) {
      if (e.status === 404 && this.remoteDb && this.isOnline) {
        try {
          const remoteDoc: any = await this.remoteDb.get(id);
          if (!isAdmin && remoteDoc.owner !== userId) throw new Error('Unauthorized access to document');
          return remoteDoc;
        } catch (e: any) {
          if (e.status === 404) console.warn(`Document with id "${id}" not found.`);
          else if (e.message === 'Unauthorized access to document') console.warn(`Access denied for user ${userId} to document ${id}.`);
          else console.warn('Remote get error:', e);
        }
      } else if (e.message === 'Unauthorized access to document') {
        console.warn(`Access denied for user ${userId} to document ${id}.`);
      } else {
        console.warn('Local get error:', e);
      }
      return null;
    }
  }

  // === GET CHWs BY FS ID ===
  async getChwsByFsId(healthCenterId: string | undefined): Promise<ChwMap[]> {
    const userId = this.userCtx.userId;
    const isAdmin = this.userCtx.isAdmin;
    const dataType = 'chw-map';

    if (!healthCenterId) return [];

    try {
      const result = await this.localDb.allDocs({ include_docs: true, descending: true });
      const docs: any[] = result.rows.map(r => r.doc!).filter((d: any) => !!d && !d._deleted);
      const offlineDocs = docs.filter(d => d.type === dataType && d.healthCenterId === healthCenterId);
      const filteredOffline = isAdmin ? offlineDocs : offlineDocs.filter(d => d.owner === userId);

      let onlineDocs: any[] = [];

      if (this.remoteDb && this.isOnline) {
        try {
          const remoteResult = isAdmin
            ? await this.remoteDb.query('map-client/by_type_and_parent', {
              key: [dataType, healthCenterId],
              include_docs: true,
              descending: true
            })
            : await this.remoteDb.query('map-client/by_type_and_parent_and_owner', {
              key: [dataType, healthCenterId, userId],
              include_docs: true,
              descending: true
            });
          onlineDocs = remoteResult.rows.map(r => r.doc!).filter((d: any) => !!d && !d._deleted);
        } catch (err: any) {
          if (err.name === 'missing_named_view') {
            console.warn('⚠️ View not indexed on remote DB.');
          } else {
            throw err;
          }
        }
      }

      const docMap = new Map<string, any>();
      for (const doc of onlineDocs) docMap.set(doc._id, doc);
      for (const doc of filteredOffline) docMap.set(doc._id, doc);

      return Array.from(docMap.values());
    } catch (err) {
      console.error('getChwsByFsId error:', err);
      return [];
    }
  }

  // === DELETE DOC ===
  async deleteDoc(doc: { _id: string, _rev: string }): Promise<boolean> {
    const userId = this.userCtx.userId;
    const isAdmin = this.userCtx.isAdmin;
    let existingDoc: any;

    let isRemoteSuccess: boolean = false;
    let isLocalSuccess: boolean = false;

    try {
      existingDoc = await this.localDb.get(doc._id) as any;
    } catch (e: any) {
      if (this.remoteDb && this.isOnline) {
        existingDoc = await this.remoteDb.get(doc._id) as any;
      }
    }

    if (!existingDoc) {
      console.error(`Doc ${doc._id} not found :`);
      return false;
    }

    if (!isAdmin && existingDoc.owner !== userId) {
      throw new Error('Unauthorized delete attempt by non-owner');
    }

    if (this.remoteDb && this.isOnline) {

          this.dbSync.syncLoop();
      // try {
      //   const result = await this.remoteDb.remove(doc);
      //   console.log(`✔ Remote deletion: ${doc._id}`);
      //   isRemoteSuccess = result.ok;
      // } catch (e) {
      //   console.warn(`⚠ Remote deletion failed: ${doc._id}`, e);
      //   isRemoteSuccess = false;
      // }
    }

    try {
      const result = await this.localDb.remove(doc);
      console.log(`✔ Local deletion: ${doc._id}`);
      isLocalSuccess = result.ok;
    } catch (e: any) {
      console.warn(`⚠ Local deletion failed: ${doc._id}`, e);
      isLocalSuccess = false;
      // if (e.status === 404) console.warn(`⚠ Not found locally: ${doc._id}`);
      // else if (e.message === 'Unauthorized delete attempt by non-owner') console.warn(`⛔ Unauthorized delete by ${userId} on ${doc._id}`);
      // else console.error(`❌ Delete failed for ${doc._id}:`, e);
    }

    return isRemoteSuccess || isLocalSuccess;
  }



}
