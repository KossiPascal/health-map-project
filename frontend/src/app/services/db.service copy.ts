// import { Injectable, NgZone } from '@angular/core';
// import PouchDB from 'pouchdb-browser';
// import { v4 as uuidv4 } from 'uuid';
// import { BehaviorSubject } from 'rxjs';
// import { ApiService } from './api.service';
// import { AuthService } from './auth.service';
// import { SyncStatus } from '../models/interfaces';

// @Injectable({ providedIn: 'root' })
// export class DbService {
//   private localDb: PouchDB.Database;
//   private remoteDb: PouchDB.Database;
//   private syncHandler?: PouchDB.Replication.Sync<{}>;

//   private syncStatus$ = new BehaviorSubject<SyncStatus>('idle');
//   private syncCssClass$ = new BehaviorSubject<string>('sync-idle');

//   status$ = this.syncStatus$.asObservable();
//   cssClass$ = this.syncCssClass$.asObservable();

//   constructor(private zone: NgZone, private api: ApiService, private auth: AuthService) {
//     this.localDb = new PouchDB('chws-map-db');
//     this.remoteDb = this.createRemoteDbInstance();

//     this.setupAutoSync();
//     this.checkIfSyncNeeded();
//   }

//   private createRemoteDbInstance(): PouchDB.Database {
//     const dbPath = '/db/chws-map-db';
//     const remoteUrl = this.api.apiUrl(dbPath);
//     return new PouchDB(remoteUrl, {
//       skip_setup: true,
//       fetch: (url: string | Request, opts) => {
//         const finalUrl = typeof url === 'string' ? url : url.url;
//         return fetch(finalUrl, {
//           ...opts,
//           credentials: 'include',
//           headers: {
//             ...(opts?.headers ?? {}),
//             Authorization: `Bearer ${this.auth.token}`
//           }
//         });
//       }
//     });
//   }

//   private setupAutoSync(): void {
//     this.syncHandler = this.localDb.sync(this.remoteDb, {
//       live: true,
//       retry: true,
//       // filter: 'filters/by_type_region',
//       // query_params: {
//       //   type: 'chw-record',
//       //   regionId: this.currentRegionId
//       // }
//     })
//       .on('change', info => {
//         console.log('[SYNC] Change:', info);
//         this.updateStatus('changed');
//         this.checkIfSyncNeeded();
//       })
//       .on('paused', err => {
//         console.log('[SYNC] Paused:', err || 'OK');
//         this.updateStatus('paused');
//         this.checkIfSyncNeeded();
//       })
//       .on('active', () => {
//         console.log('[SYNC] Resumed');
//         this.updateStatus('active');
//       })
//       .on('denied', err => {
//         console.warn('[SYNC] Denied:', err);
//         this.updateStatus('error');
//       })
//       .on('error', err => {
//         console.error('[SYNC] Fatal error:', err);
//         this.updateStatus('error');
//       });
//   }

//   updateStatus(status: SyncStatus) {
//     this.zone.run(() => {
//       this.syncStatus$.next(status);
//       const cssClass = this.statusToCssClass(status);
//       this.syncCssClass$.next(cssClass);
//     });
//   }

//   // '' : ''"

//   private statusToCssClass(status: SyncStatus): string {
//     switch (status) {
//       case 'active': return 'fa-sync-alt fa-spin sync-active';
//       case 'paused': return 'fa-circle sync-ok';
//       case 'changed': return 'fa-circle sync-ok';
//       case 'idle': return 'fa-circle sync-idle';
//       case 'error':
//       case 'denied': return 'fa-circle sync-error';
//       default: return 'fa-circle sync-idle';
//     }
//   }

//   get syncStatusClass(): string {
//     return {
//       'active': 'sync-active',
//       'paused': 'sync-ok',
//       'idle': 'sync-idle',
//       'error': 'sync-error',
//       'needed': 'sync-needed'
//     }[this.currentStatus];
//   }
  
//   get syncStatusLabel(): string {
//     return {
//       'active': 'Synchronisation en cours',
//       'paused': 'À jour',
//       'idle': 'Inactif',
//       'error': 'Erreur de synchronisation',
//       'needed': 'Synchronisation requise'
//     }[this.currentStatus];
//   }
  
//   get isActive(): boolean { return this.currentStatus === 'active'; }
//   get isOk(): boolean { return this.currentStatus === 'paused'; }
//   get isError(): boolean { return this.currentStatus === 'error'; }
//   get isNeeded(): boolean { return this.currentStatus === 'needed'; }
//   get isIdle(): boolean { return this.currentStatus === 'idle'; }

//   public async manualSync(): Promise<void> {
//     try {
//       console.log('[SYNC] Manual sync triggered...');
//       this.updateStatus('active');
//       await this.localDb.replicate.to(this.remoteDb);
//       await this.localDb.replicate.from(this.remoteDb);
//       console.log('[SYNC] Manual sync completed');
//       this.updateStatus('paused');
//     } catch (error) {
//       console.error('[SYNC] Manual sync failed:', error);
//       this.updateStatus('error');
//     }
//   }

//   /** Vérifie si des données locales ne sont pas synchronisées */
//   private async checkIfSyncNeeded(): Promise<void> {

//     try {
//       const changes = await this.localDb.changes({
//         since: 'now',
//         limit: 1,
//         include_docs: false
//       });

//       const pendingChanges = changes.results.length > 0;
//       if (pendingChanges) {
//         this.syncCssClass$.next('sync-needed');
//         console.warn('[SYNC] Des changements non synchronisés existent');
//       } else {
//         this.syncCssClass$.next('fa-circle sync-ok');
//       }
//     } catch (e) {
//       console.warn('[SYNC] Erreur checkIfSyncNeeded:', e);
//       this.syncCssClass$.next('sync-error');
//     }
//     // try {
//     //   const info = await this.localDb.info();
//     //   const pending = await this.localDb.replicate.to(this.remoteDb, { doc_ids: [], since: info.update_seq, return_docs: false });
//     //   if ((pending as any)?.docs_written > 0) {
//     //     this.syncCssClass$.next('sync-needed');
//     //     console.warn('[SYNC] Des données locales doivent être synchronisées');
//     //   }
//     // } catch (e) {
//     //   console.warn('[SYNC] checkIfSyncNeeded error:', e);
//     //   this.syncCssClass$.next('sync-error');
//     // }
//   }

//   get docId(): string {
//     return uuidv4();
//   }

//   // CRUD
//   async addDoc(doc: any): Promise<any> {
//     const newDoc = {
//       ...doc,
//       _id: this.docId,
//       type: 'chw-record',
//       createdAt: new Date().toISOString()
//     };
//     return await this.localDb.put(newDoc);
//   }

//   async getAllDocs(): Promise<any[]> {
//     const result = await this.localDb.allDocs({ include_docs: true });
//     return result.rows.map(row => row.doc);
//   }

//   async getDoc(id: string): Promise<any> {
//     return await this.localDb.get(id);
//   }

//   async updateDoc(doc: any): Promise<any> {
//     return await this.localDb.put(doc);
//   }

//   async deleteDoc(doc: any): Promise<any> {
//     return await this.localDb.remove(doc);
//   }

//   async clearLocalDatabase(): Promise<void> {
//     await this.localDb.destroy();
//     this.localDb = new PouchDB('chws-map-db');
//   }
// }








  // private async setupAutoSync(localDb: PouchDB.Database, remoteDb: PouchDB.Database): Promise<void> {
  //   try {
  //     // Listener pour vérifier changements locaux
  //     // localDb.changes({
  //     //   live: true,
  //     //   since: 'now',
  //     //   include_docs: true,
  //     // }).on('change', change => {
  //     //   console.log('[LOCAL DB] Change detected:', change);
  //     //   this.updateStatus('changed');
  //     //   this.checkIfSyncNeeded(localDb);
  //     // }).on('error', err => {
  //     //   console.error('[LOCAL DB] Changes feed error:', err);
  //     //   this.updateStatus('error');
  //     // });

  //     const handler = localDb.sync(remoteDb, {
  //       live: true,
  //       retry: true,
  //       // since: 'now',
  //       // include_docs: true,
  //       filter: 'filters/by_owner',
  //       query_params: { owner: this.auth.userId }
  //     })
  //       .on('change', info => {
  //         console.log('[SYNC] Change:', info);
  //         this.updateStatus('changed');
  //         this.checkIfSyncNeeded(localDb);
  //       })
  //       .on('paused', (err: any) => {
  //         if (this.currentStatus !== 'paused') {
  //           if (err?.status === 404 && err.message?.includes('_local/')) {
  //             console.debug('[SYNC] Ignored _local 404 during pause:', err.message);
  //             return;
  //           }
  //           console.log('[SYNC] Paused:', err || 'OK');
  //           this.updateStatus('paused');
  //         }
  //       })
  //       .on('active', () => {
  //         if (this.currentStatus !== 'active') {
  //           console.log('[SYNC] Resumed');
  //           this.updateStatus('active');
  //         }
  //       })
  //       .on('denied', err => {
  //         console.warn('[SYNC] Denied:', err);
  //         this.updateStatus('error');
  //       })
  //       .on('error', (err: any) => {
  //         if (err?.status === 404 && err.message?.includes('_local/')) {
  //           console.debug('[SYNC] Ignored _local 404 error:', err.message);
  //           return;
  //         }
  //         console.error('[SYNC] Fatal sync error:', err);
  //         this.updateStatus('error');
  //       });

  //     this.syncHandlers.push(handler);
  //   } catch (err) {
  //     console.error('[SYNC] Failed to setup auto sync:', err);
  //     this.updateStatus('error');
  //   }
  // }


  // private async logLocalDocs(db: PouchDB.Database, name: string) {
  //   const allDocs = await db.allDocs({ include_docs: true });
  //   console.log(`[SYNC][${name}] Documents count: ${allDocs.total_rows}`);
  //   const docsWithoutId = allDocs.rows.filter(r => !r.doc || !r.doc._id);
  //   if (docsWithoutId.length > 0) {
  //     console.warn(`[SYNC][${name}] Docs without _id detected:`, docsWithoutId);
  //   } else {
  //     console.log(`[SYNC][${name}] All docs have _id.`);
  //   }
  // }



  //   private viewDesign(type: 'chw-map' | 'fs-map'): { id: string; views: Record<string, { map: string }> } {
  //     const designId = `_design/${type.replace('-', '_')}`;
  //     return {
  //       id: designId,
  //       views: {
  //         by_type: {
  //           map: 
  // `function (doc) {
  //   if (doc.type === '${type}') {
  //     emit(doc._id, doc);
  //   }
  // }`.trim()
  //         }
  //       }
  //     };
  //   }



  //   private syncIntervalId: any = null;

  // public startPeriodicSync(localDb: PouchDB.Database, remoteDb: PouchDB.Database, ownerId: string) {
  //   if (this.syncIntervalId) {
  //     console.warn('Periodic sync already running');
  //     return;
  //   }

  //   this.startLiveSyncWithTimeout(localDb, remoteDb, ownerId);

  //   // relance toutes les 2 minutes
  //   this.syncIntervalId = setInterval(() => {
  //     this.startLiveSyncWithTimeout(localDb, remoteDb, ownerId);
  //   }, 2 * 60 * 1000);
  // }

  // public stopPeriodicSync() {
  //   if (this.syncIntervalId) {
  //     clearInterval(this.syncIntervalId);
  //     this.syncIntervalId = null;
  //   }
  //   if (this.syncHandler) {
  //     this.syncHandler.cancel();
  //     this.syncHandler = null;
  //   }
  // }





  // async getOrCreateRemoteDb(dbName: string): Promise<PouchDB.Database> {
  //   await this.ensureRemoteDbExists(dbName); // vérifie et crée si besoin

  //   // Ensuite, seulement là, créer l’instance PouchDB
  //   return this.createRemoteDbInstance(dbName);
  // }