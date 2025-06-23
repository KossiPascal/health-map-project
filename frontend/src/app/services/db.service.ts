import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { ApiService } from './api.service';
import { ChwMap, HealthCenterMap } from '../models/interfaces';
import { UserContextService } from './user-context.service';
import PouchDB from 'pouchdb-browser';
import PouchFind from 'pouchdb-find';
import { DbSyncService } from './db-sync.service';
import { NetworkService } from './network.service';

PouchDB.plugin(PouchFind);

const MAX_BODY_SIZE = 200 * 1024 * 1024; // 200MB
export const BATCH_SIZE = 25;


@Injectable({ providedIn: 'root' })
export class DbService {
  private readonly mapDbName = 'health-map-db';

  public localDb: PouchDB.Database;
  public remoteDb: PouchDB.Database;
  private isOnline = false;

  constructor(
    private api: ApiService,
    private dbSync: DbSyncService,
    private network: NetworkService,
    private userCtx: UserContextService,
  ) {
    this.network.onlineChanges$.subscribe(online => this.isOnline = online);
    this.localDb = new PouchDB(this.mapDbName);
    this.remoteDb = this.createRemoteDbInstance();
    this.dbSync.initialize(this.localDb, this.remoteDb, this.userCtx.userId, async () => {
      await this.purgeDeletedDocs(this.localDb);
    });
    this.dbSync.startAutoReplication();
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
        .filter((r: any) => r.doc && r.doc._deleted)
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
    let targetDb: PouchDB.Database<{}>;
    let isRemote: boolean = false;

    if (this.remoteDb && this.isOnline) {
      targetDb = this.remoteDb;
      isRemote = true;
    } else {
      targetDb = this.localDb;
      isRemote = false;
    }

    let isSavedSuccess = false;

    try {
      let existingDoc: any = null;

      if (doc._id) {
        try {
          existingDoc = await this.localDb.get(doc._id);
        } catch (err: any) {
          if (err.status !== 404) throw err;
        }
      }

      let result: PouchDB.Core.Response | null = null;

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

        try {
          result = await targetDb.put(updatedDoc);
          // console.log(`['✔'] UPDATE 'local' ${updatedDoc._id}`);
          console.log(`[${isRemote ? '⇅' : '✔'}] UPDATE ${isRemote ? 'remote' : 'local'} ${updatedDoc._id}`);
          isSavedSuccess = true;
        } catch (err) {
          console.warn(`[⚠] update failed for ${updatedDoc._id}:`, err);
          isSavedSuccess = false;
        }

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

        try {
          result = await targetDb.put(newDoc);
          // console.log(`['✔'] CREATE 'local' ${newDoc._id}`);
          console.log(`[${isRemote ? '⇅' : '✔'}] CREATE ${isRemote ? 'remote' : 'local'} ${newDoc._id}`);
          isSavedSuccess = true;
        } catch (err) {
          console.warn(`[⚠] creation failed:`, err);
          isSavedSuccess = false;
        }
      }

      // 🔁 Synchronisation manuelle si réussite et base distante disponible
      if (isSavedSuccess && isRemote && this.dbSync?.manualSync) {
        this.dbSync.manualSync();
      }

      // return !!result && result.ok;
      console.log(`result: `, result)
      return isSavedSuccess == true;;
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

    let filteredOffline: any[] = [];
    let onlineDocs: any[] = [];

    try {
      // 1. Chargement des documents locaux
      const result = await this.localDb.allDocs({ include_docs: true });
      const docs = result.rows.map((r: any) => r.doc!).filter(d => !!d && !d._deleted);

      const localFilteredByType = dataType ? docs.filter(d => d.type === dataType) : docs;
      filteredOffline = isAdmin ? localFilteredByType : localFilteredByType.filter(d => d.owner === userId);
    } catch (err) {
      console.error('getAllDocs error:', err);
      // return [];
    }

    // 2. Chargement des documents distants si en ligne
    if (this.remoteDb && this.isOnline) {
      if (!isAdmin && type === 'all') throw new Error('Type "all" non autorisé pour les utilisateurs non-admin');
      const viewName = isAdmin ? 'map-client/by_type' : 'map-client/by_type_and_owner';
      const viewKey = isAdmin ? dataType : [dataType, userId];
      try {
        // ✅ Forcer CouchDB à indexer la vue (utile si la synchro vient de démarrer)
        // stale: 'update_after', stale: 'ok'
        await this.remoteDb.query(viewName, { key: viewKey, limit: 1 });

        const remoteResult = await this.remoteDb.query(viewName, { include_docs: true, descending: true, key: viewKey })
        onlineDocs = remoteResult.rows.map((r: any) => r.doc!).filter(d => !!d && !d._deleted);
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
  }


  // === GET ONE DOC ===
  async getDoc(id: string): Promise<ChwMap | HealthCenterMap | null> {
    const userId = this.userCtx.userId;
    const isAdmin = this.userCtx.isAdmin;

    try {
      const doc: any = await this.localDb.get(id);
      if (!isAdmin && doc.owner !== userId) {
        console.error('Unauthorized access to document')
        return null;
      };
      return doc;
    } catch (e: any) {
      if (e.status === 404 && this.remoteDb && this.isOnline) {
        try {
          const remoteDoc: any = await this.remoteDb.get(id);
          if (!isAdmin && remoteDoc.owner !== userId) {
            console.error('Unauthorized access to document');
            return null;
          }
          return remoteDoc;
        } catch (e2: any) {
          if (e2.status === 404) console.warn(`Document with id "${id}" not found.`);
          else if (e2.message === 'Unauthorized access to document') console.warn(`Access denied for user ${userId} to document ${id}.`);
          else console.warn('Remote get error:', e2);
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
  async getChwsByFsId(healthCenterId?: string): Promise<ChwMap[]> {
    const userId = this.userCtx.userId;
    const isAdmin = this.userCtx.isAdmin;
    const dataType = 'chw-map';

    if (!healthCenterId) return [];

    let filteredOffline: any[] = [];
    let onlineDocs: any[] = [];

    try {
      const result = await this.localDb.allDocs({ include_docs: true, descending: true });
      const docs = result.rows.map((r: any) => r.doc!).filter(d => !!d && !d._deleted);
      const offlineDocs = docs.filter((d: any) => d.type === dataType && d.healthCenterId === healthCenterId);
      filteredOffline = isAdmin ? offlineDocs : offlineDocs.filter(d => d.owner === userId);
    } catch (err) {
      console.error('getChwsByFsId (LOCAL) error:', err);
    }

    if (this.remoteDb && this.isOnline) {
      try {
        const viewName = `map-client/${isAdmin ? 'by_type_and_parent' : 'by_type_and_parent_and_owner'}`;
        const viewKey = isAdmin ? [dataType, healthCenterId] : [dataType, healthCenterId, userId];

        // ✅ Forcer CouchDB à indexer la vue (utile si la synchro vient de démarrer)
        // stale: 'update_after', stale: 'ok'
        await this.remoteDb.query(viewName, { key: viewKey, limit: 1 });
        
        const remoteResult = await this.remoteDb.query(viewName, { key: viewKey, include_docs: true, descending: true });
        onlineDocs = remoteResult.rows.map((r: any) => r.doc!).filter(d => !!d && !d._deleted);
      } catch (err: any) {
        console.error('getChwsByFsId (REMOTE) error:', err);
        // if (err.name === 'missing_named_view') console.warn('⚠️ View not indexed on remote DB.');
        // else throw err;
      }
    }

    const docMap = new Map<string, any>();
    for (const doc of filteredOffline) docMap.set(doc._id, doc);
    for (const doc of onlineDocs) docMap.set(doc._id, doc);

    return Array.from(docMap.values());
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
        try {
          existingDoc = await this.remoteDb.get(doc._id) as any;
        } catch (error) { }
      }
    }

    if (!existingDoc) {
      console.error(`Doc ${doc._id} not found :`);
      return false;
    }

    if (!isAdmin && existingDoc.owner !== userId) {
      console.error('Unauthorized delete attempt by non-owner');
      return false;
    }

    try {
      const result = await this.localDb.remove(doc);
      console.log(`✔ Local deletion: ${doc._id}`);
      isLocalSuccess = true;
    } catch (e: any) {
      console.warn(`⚠ Local deletion failed: ${doc._id}`, e);
      isLocalSuccess = false;
      // if (e.status === 404) console.warn(`⚠ Not found locally: ${doc._id}`);
      // else if (e.message === 'Unauthorized delete attempt by non-owner') console.warn(`⛔ Unauthorized delete by ${userId} on ${doc._id}`);
      // else console.error(`❌ Delete failed for ${doc._id}:`, e);
    }

    if (this.remoteDb && this.isOnline) {
      // await this.dbSync.manualSync();
      try {
        const result = await this.remoteDb.remove(doc);
        console.log(`✔ Remote deletion: ${doc._id}`);
        isRemoteSuccess = true;
      } catch (e) {
        console.warn(`⚠ Remote deletion failed: ${doc._id}`, e);
        isRemoteSuccess = false;
      }
    }

    return isLocalSuccess || isRemoteSuccess;
  }



}
