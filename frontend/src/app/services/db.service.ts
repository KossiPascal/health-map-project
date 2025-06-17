import { Injectable, NgZone } from '@angular/core';
import PouchDB from 'pouchdb-browser';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ChwMap, HealthCenterMap, SyncStatus } from '../models/interfaces';
// import transform from 'pouchdb-transform';

// PouchDB.plugin(transform);

@Injectable({ providedIn: 'root' })
export class DbService {
  private mapDbName = 'health-map-db';

  private localDb!: PouchDB.Database;
  private remoteDb: PouchDB.Database | null = null;

  // private liveSyncHandler: PouchDB.Replication.Sync<any> | null = null;
  private liveSyncHandler: PouchDB.Replication.SyncResultComplete<any> | void | null = null;
  private syncTimers: any[] = [];

  private syncStatus$ = new BehaviorSubject<SyncStatus>('idle');
  private syncCssClass$ = new BehaviorSubject<string>('fa-circle sync-idle');
  private syncCssContainerClass$ = new BehaviorSubject<string>('sync-idle');


  status$ = this.syncStatus$.asObservable();
  cssClass$ = this.syncCssClass$.asObservable();
  cssContainerClass$ = this.syncCssContainerClass$.asObservable();

  constructor(private zone: NgZone, private api: ApiService, private auth: AuthService) {
    this.initDatabases();
  }

  private async initDatabases(): Promise<void> {

    this.localDb = new PouchDB(this.mapDbName);

    // // Intercepter chaque doc envoyé vers CouchDB
    // this.localDb.transform({
    //   outgoing: (doc: any) => {
    //     // Ne modifie pas les design docs ou doc système
    //     if (doc._id?.startsWith('_design/') || doc._id?.startsWith('_local/')) {
    //       return doc;
    //     }

    //     return {
    //       ...doc,
    //       syncedAt: new Date().toISOString(), // Exemple : ajout d’un champ
    //       updatedBySync: true
    //     };
    //   }
    // });

    await this.ensureRemoteDbExists();
    this.remoteDb = await this.ensureRemoteDbAndFiltersWithRetry();
    // await this.ensureRemoteDbAndFiltersWithRetry(this.localDb);
    this.setupLiveSync();

    await this.checkIfSyncNeeded();
  }

  private async ensureRemoteDbExists(): Promise<void> {
    //     localDb
    // remoteDb
    const dbPath = `/db/${this.mapDbName}`;
    const remoteUrl = this.api.apiUrl(dbPath);

    const res = await fetch(remoteUrl, {
      method: 'HEAD',
      headers: {
        Authorization: `Bearer ${this.auth.token}`
      },
    });

    if (res.status === 200) {
      // console.log(`✅ La base "${this.mapDbName}" existe déjà.`);
      return;
    }


    if (res.status === 404) {
      const createRes = await fetch(remoteUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.auth.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!createRes.ok) {
        const error = await createRes.text();
        // console.error(`❌ Failed to create database '${this.mapDbName}': ${createRes.status} ${error}`);
        throw new Error(`Could not create DB ${this.mapDbName}`);
      } else {
        // console.log(`✅ Database '${this.mapDbName}' created`);
      }
    } else if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to check database '${this.mapDbName}': ${res.statusText} - ${error}`);
    } else {
      // console.log(`ℹ️ Database '${this.mapDbName}' exists`);
    }
  }

  private createRemoteDbInstance(): PouchDB.Database {
    const dbPath = `/db/${this.mapDbName}`
    const remoteUrl = this.api.apiUrl(dbPath);

    return new PouchDB(remoteUrl, {
      skip_setup: true,
      fetch: async (url: string | Request, opts?: RequestInit): Promise<Response> => {
        const requestUrl = typeof url === 'string' ? url : url.url;

        // console.log('[Fetch interceptor] Method:', opts?.method, 'URL:', requestUrl);

        // 🔒 Sécurité : Intercepter les PUT/POST sans _id pour éviter les erreurs
        if (opts?.method === 'PUT' || opts?.method === 'POST' || opts?.method === 'DELETE') {
          try {
            const body = opts.body ? JSON.parse(opts.body as string) : null;
            if (body && !body._id) {
              // console.error('[FATAL] Document without _id detected during PUT:', body);
              throw new Error('Blocked document with missing _id');
            }
          } catch (e) {
            // console.warn('[FATAL] Invalid JSON body during PUT');
          }
        }

        // if (!opts?.method || opts?.method === 'GET' && requestUrl.includes('/_local/')) {
        //   console.log(opts?.method)
        //   console.log('ZZZZZZZZZZZZZZZZZZZZZZZZZ')
        //   return new Response(JSON.stringify({}), {
        //     status: 200,
        //     headers: { 'Content-Type': 'application/json' },
        //   });
        // }

        try {
          // 🚀 Exécute la requête réelle
          const response = await fetch(requestUrl, {
            ...opts,
            credentials: 'include',
            headers: {
              ...(opts?.headers ?? {}),
              Authorization: `Bearer ${this.auth.token}`
            }
          });
          const isLocalDoc404 = response.status === 404 && requestUrl.includes('/_local/');
          // Si _local/* retourne un 404, log propre sans throw
          if (isLocalDoc404) {
            // console.debug('[PouchDB] _local doc not found (expected):', requestUrl);
            // ✅ Ne pas transformer en 200 → retourne la 404 telle quelle
            return response; // laisser passer le 404
          }

          // 🧠 Traitement d’erreurs intelligents
          if (!response.ok) {
            const errorText = await response.text();

            if (response.status === 412 && errorText.includes('file_exists')) {
              // ✅ Optionnel : tu peux laisser passer aussi ce 412 comme un succès si nécessaire
              return response;
            }

            // 💥 Lancer erreur explicite
            throw new Error(`Fetch failed: ${response.status} ${response.statusText} - ${errorText}`);
          }

          return response;
        } catch (err) {
          // console.error('[SYNC][FETCH] Error:', err);
          throw err;
        }
      }
    });
  }

  private filterDesign(): { id: string; filters: Record<string, string> } {
    const mapFunction = `
      function (doc, req) {
        if (doc._deleted) return true;
        if (!doc.owner || !req.query.owner) return false;
        return doc.owner.toString() === req.query.owner.toString();
      }`.trim()
    return {
      id: '_design/filters',
      filters: {
        by_owner: mapFunction

      }
    };
  }


  // await localDb.query('map_views/by_type', {
  //   key: 'chw-map',
  //   include_docs: true
  // });

  // db.query('map_views/by_type', {
  //   startkey: 'chw-map',
  //   endkey: 'chw-map\ufff0',
  //   include_docs: true
  // });



  private unifiedViewDesignWithTypes(types: string[]): { id: string; views: Record<string, { map: string, reduce?: string }>; language:string } {
    const designId = '_design/map_views';

    // Validation des types
    const safeTypes = types.filter(t => typeof t === 'string' && /^[a-zA-Z0-9_-]+$/.test(t));
    if (safeTypes.length === 0) throw new Error('[View] No valid types provided for map_views.');

    const condition = safeTypes.map(t => `doc.type === '${t}'`).join(' || ');

    const views: Record<string, { map: string, reduce?: string }> = {
      by_owner: {
        map: `
        function (doc) {
          if ((${condition}) && doc.owner) {
            emit(doc.owner, doc._id);
          }
        }
      `.trim()
      },
      by_type: {
        map: `
        function (doc) {
          if (${condition}) {
            emit(doc.type, doc._id);
          }
        }
      `.trim()
      },
      by_type_and_parent: {
        map: `
        function (doc) {
          if (doc.type === 'chw-map' && doc.healthCenterId) {
            emit([doc.type, doc.healthCenterId], doc._id);
          }
        }
      `.trim()
      },
      by_type_and_parent_and_owner: {
        map: `
        function (doc) {
          if (doc.type === 'chw-map' && doc.healthCenterId && doc.owner) {
            emit([doc.type, doc.healthCenterId, doc.owner], doc._id);
          }
        }
      `.trim()
      },
      by_parent: {
        map: `
        function (doc) {
          if (doc.type === 'chw-map' && doc.healthCenterId) {
            emit(doc.healthCenterId, doc._id);
          }
        }
      `.trim()
      },
      by_type_and_owner: {
        map: `
        function (doc) {
          if ((${condition}) && doc.owner) {
            emit([doc.type, doc.owner], doc._id);
          }
        }
      `.trim()
      },
      by_parent_and_owner: {
        map: `
        function (doc) {
          if (doc.type === 'chw-map' && doc.healthCenterId && doc.owner) {
            emit([doc.healthCenterId, doc.owner], doc._id);
          }
        }
      `.trim()
      },
      by_no_distance: {
        map: `
        function (doc) {
          if (doc.type === 'chw-map' && (!doc.distanceToFacility || doc.distanceToFacility == 0)) {
            emit(doc._id, doc.distanceToFacility);
          }
        }
      `.trim()
      },
      last_doc: {
        map: `function (doc) { 
          if (doc.type && doc.createdAt) {
            emit([doc.type, doc.createdAt], doc);
          }
        }`.trim(),
        // reduce: "_stats"
      }

    };

    return {
      id: designId,
      views,
      language: "javascript"
    };
  }





  private validateDesign(): { id: string, validateFunction: string } {
    // For _design/validate
    const designId = '_design/validate';
    const validateFunction = function (newDoc: any, oldDoc: any, userCtx: any) {
      if (!newDoc.owner || newDoc.owner !== userCtx.name) {
        throw ({ forbidden: "You can only write documents with your own owner ID." });
      }
    }.toString();

    return { id: designId, validateFunction };
  }

  async retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (retries <= 0) throw err;
      await new Promise(res => setTimeout(res, delay));
      return this.retry(fn, retries - 1, delay);
    }
  }

  // async ensureLocalDesignDoc() {
  //   const localDesignDoc = this.unifiedViewDesignWithTypes(['chw-map', 'fs-map']);
  //   try {
  //     const existing = await this.localDb.get(localDesignDoc.id);
  //     (localDesignDoc as any)._rev = existing._rev;
  //     await this.localDb.put(localDesignDoc);
  //     await this.localDb.put({
  //       _id: localDesignDoc.id,
  //       _rev: existing._rev,
  //       filters: {
  //         ...(existing as any).filters,
  //         ...localDesignDoc.filters
  //       }
  //     });
  //   } catch (err: any) {
  //     console.log(err)
  //     try {
  //       await this.localDb.post(localDesignDoc);
  //     } catch (error) {
  //       throw error;
  //     }
  //   }
  // }



  async ensureRemoteDbAndFiltersWithRetry(actionDb?: PouchDB.Database<{}>, retries = 3, delay = 1000): Promise<PouchDB.Database> {
    actionDb = actionDb ?? this.createRemoteDbInstance();

    const filterDesign = this.filterDesign();
    const unifiedView = this.unifiedViewDesignWithTypes(['chw-map', 'fs-map']);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // ✅ Ensure filter design doc
        try {
          // const existingFilter = await putRemoteDb.get(design.id) as PouchDB.Core.Document<any> & { filters: Record<string, string> };

          const existing = await actionDb.get(filterDesign.id);
          await actionDb.put({
            _id: filterDesign.id,
            _rev: existing._rev,
            filters: {
              ...(existing as any).filters,
              ...filterDesign.filters
            }
          });
        } catch (e: any) {
          if (e.status !== 404) {
            // console.warn(`⚠️ [FILTERS] Update failed (try ${attempt + 1}):`, err);
          }
          try {
            await actionDb.put({
              _id: filterDesign.id,
              filters: filterDesign.filters
            });
          } catch (error) {
            // console.warn(`⚠️ [FILTERS] Create failed (try ${attempt + 1}):`, putErr);
            throw error;
          }
        }

        // ✅ Ensure CHW view design doc
        try {
          const existing = await actionDb.get(unifiedView.id);

          await actionDb.put({
            _id: unifiedView.id,
            _rev: existing._rev,
            views: {
              ...(existing as any).views,
              ...unifiedView.views
            },
            language: "javascript",
          });
        } catch (e: any) {
          try {
            await actionDb.put({
              _id: unifiedView.id,
              views: unifiedView.views,
              language: "javascript"
            });
          } catch (error) {
            throw error;
          }
        }

        // console.log(`✅ [FILTERS] Updated '${design.id}' in '${this.mapDbName}'`);
        return actionDb;

      } catch (err) {
        if (attempt < retries) {
          const wait = delay * Math.pow(2, attempt);
          // console.log(`⏳ Retry in ${wait}ms...`);
          await new Promise(resolve => setTimeout(resolve, wait));
        } else {
          // console.error(`❌ [FILTERS] Failed after ${retries + 1} attempts`);
          throw new Error(`[FILTER SYNC] Failed after ${retries + 1} attempts: ${err}`);
        }
      }
    }

    return actionDb; // fallback (jamais atteint normalement)
  }
  private async setupLiveSync(): Promise<void> {
    if (!this.remoteDb) {
      // console.error('[SYNC] Manual sync failed: remote DBs are not available.');
      this.updateStatus('error');
      this.liveSyncHandler = null;
      return;
    }
    // console.log('[SYNC] Manual sync triggered...');
    this.updateStatus('active');

    // const isValidData = await this.cleanInvalidDocs(this.localDb);




    this.liveSyncHandler = await this.localDb.sync(this.remoteDb, {
      live: true,
      retry: true,
      filter: 'filters/by_owner',
      query_params: { owner: this.auth.userId }
    })
      .on('change', async (change) => {
        // if (!change.change.) {
        //   const updatedDoc = {
        //     ...change.doc,
        //     processed: true,
        //     serverProcessedAt: new Date().toISOString()
        //   };
        //   await db.put(updatedDoc);
        // }
        // // console.log('[SYNC] Change detected:', info);
        this.updateStatus('changed');
        this.checkIfSyncNeeded();
      })
      .on('paused', (err) => {
        // console.log('[SYNC] Paused:', err || 'OK');
        this.updateStatus('paused');
        this.checkIfSyncNeeded();
      })
      .on('active', () => {
        // console.log('[SYNC] Resumed');
        this.updateStatus('active');
      })
      .on('denied', err => {
        // console.warn('[SYNC] Denied:', err);
        this.updateStatus('error');
      })
      .on('error', err => {
        // console.error('[SYNC] Sync error:', err);
        this.updateStatus('error');
      }).catch(err => {
        // console.error('[SYNC] Failed to validate local docs before sync:', err);
        this.updateStatus('error');
      });
  }

  // public stopLiveSync(): void {
  //   if (this.liveSyncHandler) {
  //     this.liveSyncHandler.cancel();
  //     this.liveSyncHandler = null;
  //   }
  // }

  // private setupAutoSync(): void {
  //   const interval = 2 * 60 * 1000;
  //   // const interval = 5 * 1000;
  //   const query = { owner: this.auth.userId };

  //   // Lancer immédiatement puis répéter
  //   this.syncLoop(query);
  //   const timerId = setInterval(() => this.syncLoop(query), interval);

  //   // Stocker pour annuler plus tard si nécessaire
  //   this.syncTimers.push(timerId);
  // }

  public async syncLoop(query?: { owner: string | null }): Promise<void> {
    if (!this.remoteDb) {
      // console.error('[SYNC] Manual sync failed: remote DBs are not available.');
      this.updateStatus('error');
      return;
    }

    try {
      // console.log('[SYNC] triggered...');
      this.updateStatus('active');
      // const isValid = await this.cleanInvalidDocs(this.localDb);

      // if (!isValid) {
      //   // console.warn('[SYNC] Invalid docs found. Manual sync aborted.');
      //   this.updateStatus('error');
      //   return;
      // }

      await this.localDb.replicate.to(this.remoteDb);

      await this.localDb.replicate.from(this.remoteDb, {
        filter: 'filters/by_owner',
        query_params: query ?? { owner: this.auth.userId }
      });

      // console.log('[SYNC] completed');
      this.updateStatus('paused');
      this.checkIfSyncNeeded();

    } catch (error: any) {
      if (error?.status === 404 && error.message?.includes('_local/')) {
        // console.debug('[AUTO SYNC] Ignored _local 404:', error.message);
        this.updateStatus('paused');
      } else if (error?.name === 'missing_id') {
        // console.warn('[AUTO SYNC] Doc without _id ignored.');
        this.updateStatus('paused');
      } else {
        // console.error('[AUTO SYNC] Failed:', error);
        this.updateStatus('error');
      }
      // this.checkIfSyncNeeded();
    }
  }

  public cancelAutoSync(): void {
    for (const timer of this.syncTimers) {
      clearInterval(timer);
    }
    this.syncTimers = [];
    // console.log('[AUTO SYNC] All sync timers cancelled.');
  }

  private async cleanInvalidDocs(db: PouchDB.Database): Promise<boolean> {
    try {
      const result = await db.allDocs({ include_docs: true });
      let validCount = 0;

      for (const row of result.rows) {
        const doc = row.doc;

        // Supprimer doc sans _id
        if (!doc || !doc._id) {
          // console.warn('[CLEAN] Deleting doc without _id:', row);
          if (row.id && row.value?.rev) {
            await db.remove(row.id, row.value.rev);
          }
          continue;
        }

        // Supprimer _local/* sans _rev (corrompu)
        if (doc._id.startsWith('_local/') && !doc._rev) {
          // console.warn('[CLEAN] Deleting corrupted _local doc:', doc._id);
          await db.remove(doc._id, doc._rev);
          continue;
        }

        validCount++;
      }

      // console.log(`[CLEAN] ${validCount} valid docs retained in ${db.name}`);
      return validCount > 0;
    } catch (err) {
      // console.error('[CLEAN] Error while cleaning db', db.name, err);
      return false;
    }
  }

  private updateStatus(status: SyncStatus): void {
    this.zone.run(() => {
      this.syncStatus$.next(status);

      const cssClass = this.statusToCssClass(status);
      const cssContainerClass = this.statusToCssContainerClass(status);

      this.syncCssClass$.next(cssClass);
      this.syncCssContainerClass$.next(cssContainerClass);
    });
  }

  private statusToCssClass(status: SyncStatus): string {
    switch (status) {
      case 'active': return 'fa-sync-alt fa-spin sync-active';
      case 'empty':
      case 'paused':
      case 'changed': return 'fa-check-circle sync-ok';
      case 'idle': return 'fa-circle sync-idle';
      case 'error':
      case 'denied': return 'fa-times-circle sync-error';
      case 'needed': return 'fa-exclamation-triangle sync-needed';
      default: return 'fa-circle sync-idle';
    }
  }

  private statusToCssContainerClass(status: SyncStatus): string {
    switch (status) {
      case 'active': return 'sync-active';
      case 'empty':
      case 'paused':
      case 'changed': return 'sync-ok';
      case 'idle': return 'sync-idle';
      case 'error':
      case 'denied': return 'sync-error';
      case 'needed': return 'sync-needed';
      default: return 'sync-idle';
    }
  }

  private get currentStatus(): SyncStatus {
    return this.syncStatus$.getValue();
  }

  get syncStatusLabel(): string {
    switch (this.currentStatus) {
      case 'active': return 'Synchronisation en cours';
      case 'paused':
      case 'changed':
      case 'empty': return 'Synchronisation à jour';
      // case 'changed': return 'Modifications synchronisées';
      case 'idle': return 'Inactif';
      case 'error': return 'Erreur de synchronisation';
      case 'denied': return 'Accès refusé';
      case 'needed': return 'Synchronisation requise';
      default: return 'Statut inconnu';
    }
  }
  get isActive(): boolean { return this.currentStatus === 'active'; }
  get isOk(): boolean { return this.currentStatus === 'paused' || this.currentStatus === 'changed'; }
  get isError(): boolean { return this.currentStatus === 'error' || this.currentStatus === 'denied'; }
  get isNeeded(): boolean { return this.currentStatus === 'needed'; }
  get isIdle(): boolean { return this.currentStatus === 'idle'; }

  private async checkIfSyncNeeded(): Promise<void> {
    try {
      const changes = await this.localDb.changes({
        since: 'now',
        limit: 1,
        include_docs: false
      });

      const pendingChanges = changes.results.length > 0;
      if (pendingChanges) {
        // console.warn('[SYNC] Des changements non synchronisés existent');
        this.updateStatus('needed');
      } else {
        this.updateStatus('paused');
      }
    } catch (e) {
      // console.warn('[SYNC] Erreur checkIfSyncNeeded:', e);
      this.updateStatus('error');
    }
  }

  // === CRUD ===
  async createOrUpdateDoc(doc: ChwMap | HealthCenterMap, type: 'chw' | 'fs'): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const userId = this.auth.userId;
      const isAdmin = this.auth.isAdmin;
      const dataType = type === 'chw' ? 'chw-map' : 'fs-map';

      // Recherche doc existant par _id si présent, sinon par un autre critère unique (ex: doc.id_unique)
      let existingDoc: any = null;

      if (doc._id) {
        try {
          existingDoc = await this.localDb.get(doc._id);
        } catch (err: any) {
          if (err.status !== 404) {
            throw err; // autre erreur inattendue
          }
          // 404 = pas trouvé, on continue pour créer
        }
      } else {
        // Optionnel : recherche par un autre champ unique, ex doc.uniqueField
        // existingDoc = await this.queryByUniqueField(doc.uniqueField);
      }

      if (existingDoc) {
        // Si doc existe, on update seulement si owner correspond (sauf admin)
        if (!isAdmin && existingDoc.owner !== userId) {
          throw new Error('Unauthorized update attempt by non-owner');
        }

        const updatedDoc = {
          ...existingDoc,
          ...doc,
          _id: existingDoc._id,
          _rev: existingDoc._rev,
          updatedAt: now,
          updatedBy: userId,
          // garde owner et createdAt d'origine
          owner: existingDoc.owner,
          createdAt: existingDoc.createdAt,
          type: dataType,
        };

        const result = await this.localDb.put(updatedDoc);
        console.log(`[✔] UPDATE ${updatedDoc._id}`);
        return result.ok;
      } else {
        // Création
        const newDoc: any = {
          ...doc,
          _id: doc._id ?? uuidv4(),
          createdAt: doc.createdAt ?? now,
          owner: userId,
          type: dataType,
        };

        const result = await this.localDb.put(newDoc);
        console.log(`[✔] CREATE ${newDoc._id}`);
        return result.ok;
      }
    } catch (e) {
      console.warn(`[✖] CREATE or UPDATE error:`, e);
      return false;
    }
  }

  async getAllDocs(type: 'chw' | 'fs' | 'all'): Promise<(ChwMap | HealthCenterMap)[]> {
    const userId = this.auth.userId;
    const isAdmin = this.auth.isAdmin;
    const isOnline = false; // 🔁 À remplacer par une vraie détection de connectivité si dispo

    // Déterminer la valeur de type pour la requête CouchDB
    const dataType = type === 'chw' ? 'chw-map' : type === 'fs' ? 'fs-map' : undefined;

    if (isAdmin) {
      // 👑 ADMIN : accès global (local ou remote)
      if (this.remoteDb && isOnline) {
        // 🛰️ Accès distant
        // const queryOptions: PouchDB.Query.Options = { include_docs: true };
        const result: PouchDB.Query.Response<{}> = await this.remoteDb.query('map_views/by_type', {
          include_docs: true,
          key: dataType
        }) as any;
        return result.rows.map(r => r.doc!).filter(Boolean) as (ChwMap | HealthCenterMap)[];
      } else {
        // 💾 Local fallback
        const result = await this.localDb.allDocs({ include_docs: true });
        const docs = result.rows.map(r => r.doc!).filter(Boolean) as (ChwMap | HealthCenterMap)[];
        return dataType ? docs.filter(doc => doc.type === dataType) : docs;
      }
    } else {
      // 🙋 Utilisateur non-admin : accès restreint à ses propres données
      if (type === 'all') {
        throw new Error('Type "all" non autorisé pour les utilisateurs non-admin');
      }
      if (this.remoteDb && isOnline) {
        // 🛰️ Accès distant filtré par [type, owner]
        const result = await this.remoteDb.query('map_views/by_type_and_owner', {
          key: [dataType, userId],
          include_docs: true,
        });
        return result.rows.map(r => r.doc!).filter(Boolean) as (ChwMap | HealthCenterMap)[];
      } else {
        // 💾 Local fallback filtré manuellement
        const result = await this.localDb.allDocs({ include_docs: true });
        const docs = result.rows.map(r => r.doc!).filter(Boolean) as (ChwMap | HealthCenterMap)[];
        return docs.filter(doc => doc.type === dataType && doc.owner === (userId ?? undefined));
      }

    }
  }

  async getDoc(id: string): Promise<ChwMap | HealthCenterMap | null> {
    const userId = this.auth.userId;
    const isAdmin = this.auth.isAdmin;

    try {
      const doc: any = await this.localDb.get(id);

      // Vérifie la propriété owner sauf si admin
      if (!isAdmin && doc.owner !== userId) {
        throw new Error('Unauthorized access to document');
      }

      return doc;
    } catch (e: any) {
      if (e.status === 404) {
        console.warn(`Document with id "${id}" not found.`);
      } else if (e.message === 'Unauthorized access to document') {
        console.warn(`Access denied for user ${userId} to document ${id}.`);
      } else {
        console.warn('Get doc error:', e);
      }
      return null;
    }
  }

  async getChwsByFsId(healthCenterId: string | undefined): Promise<ChwMap[]> {
    const userId = this.auth.userId;
    const isAdmin = this.auth.isAdmin;
    const isOnline = false; // 🔁 À remplacer par une vraie détection de connectivité si dispo

    // Déterminer la valeur de type pour la requête CouchDB
    const dataType = 'chw-map';

    if (!healthCenterId) return [];

    if (isAdmin) {
      // 👑 ADMIN : accès global (local ou remote)
      if (this.remoteDb && isOnline) {
        // 🛰️ Accès distant
        const result: { rows: any[] } = await this.remoteDb.query('map_views/by_type_and_parent', {
          key: [dataType, healthCenterId],
          include_docs: true
        }) as any;

        return result.rows.map(r => r.doc!).filter(Boolean) as ChwMap[];
      } else {
        // 💾 Local fallback
        const result: { rows: any[] } = await this.localDb.allDocs({ include_docs: true });
        return result.rows
          .map(r => r.doc!)
          .filter(doc => doc && doc.type === dataType && doc.healthCenterId === healthCenterId) as ChwMap[];
      }
    } else {
      // 🙋 Utilisateur non-admin : accès restreint à ses propres données
      if (this.remoteDb && isOnline) {
        // 🛰️ Accès distant filtré par [type, owner]
        const result = await this.remoteDb.query('map_views/by_type_and_parent_and_owner', {
          key: [dataType, healthCenterId, userId],
          include_docs: true,
        });
        return result.rows.map(r => r.doc!).filter(Boolean) as ChwMap[];
      } else {
        // 💾 Local fallback filtré manuellement
        const result: { rows: any[] } = await this.localDb.allDocs({ include_docs: true });
        return result.rows
          .map(r => r.doc!)
          .filter(doc => doc && doc.type === dataType && doc.healthCenterId === healthCenterId && doc.owner === userId) as ChwMap[];
      }

    }
  }

  async deleteDoc(doc: { _id: string, _rev: string }): Promise<boolean> {
    try {
      const userId = this.auth.userId;
      const isAdmin = this.auth.isAdmin;

      const existingDoc: any = await this.localDb.get(doc._id);

      if (!isAdmin && existingDoc.owner !== userId) {
        throw new Error('Unauthorized delete attempt by non-owner');
      }

      // Suppression locale
      const resultLocal = await this.localDb.remove(existingDoc);

      // Suppression remote explicite (optionnel si pas de sync automatique)
      // const existingRemoteDoc = await this.remoteDb!.get(doc._id);
      // const resultRemote = await this.remoteDb!.remove(existingRemoteDoc);

      // return resultLocal.ok && resultRemote.ok;
      return resultLocal.ok;
    } catch (e: any) {
      if (e.status === 404) {
        console.warn(`Document with id "${doc._id}" not found.`);
      } else if (e.message === 'Unauthorized delete attempt by non-owner') {
        console.warn(`User ${this.auth.userId} tried to delete document ${doc._id} without permission.`);
      } else {
        console.warn('Delete failed:', e);
      }
      return false;
    }
  }


}
