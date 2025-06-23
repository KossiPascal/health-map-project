import { Injectable, NgZone } from '@angular/core';
import { NetworkService } from './network.service';
import PouchDB from 'pouchdb-browser';
import PouchFind from 'pouchdb-find';
import { SyncStatus } from '@kossi-models/interfaces';
import { BehaviorSubject } from 'rxjs';

PouchDB.plugin(PouchFind);

@Injectable({
    providedIn: 'root'
})
export class DbSyncService {
    private localDb: PouchDB.Database | null = null;
    private remoteDb: PouchDB.Database | null = null;
    private userId: any = '';

    private replicateFrom: PouchDB.Replication.Replication<{}> | null = null;
    private replicateTo: PouchDB.Replication.Replication<{}> | null = null;
    private syncHandler: PouchDB.Replication.Sync<{}> | null = null;

    private syncStatus$ = new BehaviorSubject<SyncStatus>('idle');
    private syncCssClass$ = new BehaviorSubject<string>('fa-circle sync-idle');
    private syncCssContainerClass$ = new BehaviorSubject<string>('sync-idle');
    private syncTimers: any[] = [];
    private isSyncing = false;
    private functions: (() => Promise<void>) | null = null;

    private isOnline: boolean = false;

    status$ = this.syncStatus$.asObservable();
    cssClass$ = this.syncCssClass$.asObservable();
    cssContainerClass$ = this.syncCssContainerClass$.asObservable();


    constructor(private zone: NgZone, private network: NetworkService) {
        this.setupNetworkListeners();
    }

    /**
     * Initialise les bases et l'utilisateur pour la synchronisation.
     */
    initialize(localDb: PouchDB.Database, remoteDb: PouchDB.Database, userId: string | null, functions: () => Promise<void>) {
        this.localDb = localDb;
        this.remoteDb = remoteDb;
        this.userId = userId;
        this.functions = functions;
    }

    /**
     * Gère les événements de changement de réseau.
     */
    private async setupNetworkListeners() {
        await this.warmUpViews();

        // setTimeout(() => this.startLiveSync(), 2000);

        this.network.onlineChanges$.subscribe(isOnline => {
            this.isOnline = isOnline;
            if (isOnline) {
                this.startLiveSync();
            } else {
                this.stopSync();
            }
        });
    }

    async warmUpViews(): Promise<void> {
        if (!this.remoteDb || !this.isOnline) return;

        const userId = this.userId;

        const viewsToWarm = [
            { view: 'map-client/by_owner', key: userId },
            { view: 'map-client/by_type', key: 'chw-map' },
            { view: 'map-client/by_type', key: 'fs-map' },
            { view: 'map-client/by_type_and_owner', key: ['chw-map', userId] },
            { view: 'map-client/by_type_and_owner', key: ['fs-map', userId] },
            { view: 'map-client/by_type_and_parent', key: ['chw-map', 'dummy-fs-id'] }, // si tu utilises cette vue
            { view: 'map-client/by_type_and_parent_and_owner', key: ['chw-map', 'dummy-fs-id', userId] },
        ];

        for (const { view, key } of viewsToWarm) {
            try {
                await this.remoteDb.query(view, {
                    key,
                    limit: 1,
                    stale: 'update_after'
                });
                console.log(`🔥 Vue "${view}" amorcée`);
            } catch (err: any) {
                if (err.name === 'missing_named_view') {
                    console.warn(`⚠️ Vue absente : ${view}`);
                } else {
                    console.error(`❌ Erreur amorçage vue ${view}`, err);
                }
            }
        }
    }


    async startLiveSync(): Promise<void> {
        if (!this.localDb || !this.remoteDb || !navigator.onLine || this.isSyncing) {
            this.updateStatus('idle');
            return;
        }

        this.isSyncing = true;
        this.updateStatus('active');

        try {
            const syncOptions = {
                live: true,
                retry: true,
                filter: '_view',
                view: 'map-client/by_owner',
                query_params: { key: this.userId },
                // filter: 'filters/by_owner',
                // query_params: { owner: this.userId }
            };

            this.syncHandler = PouchDB.sync(this.localDb, this.remoteDb, syncOptions)
                .on('change', () => this.updateStatus('changed'))
                .on('paused', err => this.updateStatus(err ? 'error' : 'paused'))
                .on('active', () => this.updateStatus('active'))
                .on('denied', () => this.updateStatus('error'))
                .on('error', () => this.updateStatus('error'));
        } catch (error: any) {
            if (`${error?.docId}/${error?.message}`.includes('_local/') || (error?.name ?? error?.message) === 'missing_id') {
                this.updateStatus('paused');
            } else {
                this.updateStatus('error');
            }
        } finally {
            this.isSyncing = false;
        }
    }


    async manualSync(): Promise<void> {
        if (!this.localDb || !this.remoteDb || !navigator.onLine) {
            this.updateStatus('idle');
            return;
        }

        this.isSyncing = true;
        this.updateStatus('active');

        try {
            // // 👇 Force CouchDB à indexer la vue avant de l'utiliser en live sync
            // await this.remoteDb.query('map-client/by_owner', {
            //     key: this.userId,
            //     limit: 1,
            //     stale: 'update_after' // pour éviter de bloquer l’appel si l’index est obsolète
            // });
            const filterOptions = {
                filter: '_view',
                view: 'map-client/by_owner',
                query_params: { key: this.userId },
                // filter: 'filters/by_owner',
                // query_params: { owner: this.userId }
            };

            await this.localDb.replicate.to(this.remoteDb);
            await this.localDb.replicate.from(this.remoteDb, filterOptions);

            this.updateStatus('paused');
            this.checkIfSyncNeeded();
        } catch (error: any) {
            if (`${error?.docId}/${error?.message}`.includes('_local/') || (error?.name ?? error?.message) === 'missing_id') {
                this.updateStatus('paused');
            } else {
                this.updateStatus('error');
            }
        } finally {
            this.isSyncing = false;
        }
    }



    // async startLiveSync(): Promise<void> {
    //     if (!this.localDb || !this.remoteDb || !navigator.onLine || this.isSyncing) {
    //         this.updateStatus('idle');
    //         return;
    //     }

    //     this.isSyncing = true;
    //     this.updateStatus('active');

    //     // if (this.functions) await this.functions();

    //     try {
    //         // Sync initial: local → distant
    //         await this.localDb.replicate.to(this.remoteDb);
    //         // Sync live: distant → local
    //         this.replicateFrom = this.localDb.replicate.from(this.remoteDb, {
    //             live: true,
    //             retry: true,
    //             // filter: 'filters/by_owner',
    //             // query_params: { owner: this.userId }
    //         })
    //             .on('change', () => this.updateStatus('changed'))
    //             .on('paused', err => this.updateStatus(err ? 'error' : 'paused'))
    //             .on('active', () => this.updateStatus('active'))
    //             .on('error', () => this.updateStatus('error'));
    //         // Sync live: local → distant
    //         this.replicateTo = this.localDb.replicate.to(this.remoteDb, {
    //             live: true,
    //             retry: true
    //         })
    //             .on('change', () => this.updateStatus('changed'))
    //             .on('paused', err => this.updateStatus(err ? 'error' : 'paused'))
    //             .on('active', () => this.updateStatus('active'))
    //             .on('denied', () => this.updateStatus('error'))
    //             .on('error', () => this.updateStatus('error'));

    //     } catch (error) {
    //         this.isSyncing = false;
    //         this.updateStatus('error');
    //     }
    // }

    // async manualSync(query?: { owner: string | null }): Promise<void> {
    //     if (!this.remoteDb || !this.localDb || !navigator.onLine || this.isSyncing) return this.updateStatus('error');
    //     try {
    //         this.updateStatus('active');

    //         // if (this.functions) await this.functions();

    //         await this.localDb.replicate.to(this.remoteDb, { retry: false })
    //             .on('complete', info => this.updateStatus('paused'))
    //             .on('error', (err: any) => {
    //                 // console.error('❌ Replication error', err)
    //                 if ((`${err?.docId}/${err?.message}`).includes('_local/') || (err?.name ?? err?.message) === 'missing_id') {
    //                     this.updateStatus('paused');
    //                 } else {
    //                     this.updateStatus('error');
    //                 }
    //             });
    //         await this.localDb.replicate.from(this.remoteDb);

    //         // await this.localDb.replicate.from(this.remoteDb, {
    //         //     filter: 'filters/by_owner',
    //         //     query_params: query ?? { owner: this.userId }
    //         // });


    //         this.checkIfSyncNeeded();
    //     } catch (error: any) {
    //         if ((`${error?.docId}/${error?.message}`).includes('_local/') || (error?.name ?? error?.message) === 'missing_id') {
    //             this.updateStatus('paused');
    //         } else {
    //             this.updateStatus('error');
    //         }
    //     }
    // }

    private async checkIfSyncNeeded(): Promise<void> {
        if (!this.remoteDb || !this.localDb || !navigator.onLine || this.isSyncing) return this.updateStatus('error');
        try {
            const pending = await this.localDb.replicate.to(this.remoteDb, { live: false });
            this.updateStatus((pending.docs_written > 0 || pending.docs_read > 0) ? 'needed' : 'paused');
        } catch {
            this.updateStatus('error');
        }
    }

    /**
     * Stoppe la synchronisation live en cours.
     */
    stopSync(): void {
        this.replicateFrom?.cancel();
        this.replicateTo?.cancel();
        this.replicateFrom = null;
        this.replicateTo = null;
        this.syncHandler?.cancel();
        this.syncHandler = null;
        this.isSyncing = false;
        this.updateStatus('idle');
        console.log('[SYNC] Synchronisation arrêtée.');
    }

    /**
     * Redémarre complètement la synchronisation.
     */
    async resetSync(): Promise<void> {
        this.stopSync();
        await this.startLiveSync();
    }

    /**
     * Indique si la synchronisation est active.
     */
    get isSyncActive(): boolean {
        return !!this.syncHandler || !!this.replicateFrom || !!this.replicateTo;
    }

    /**
     * Supprime la base locale et arrête toute synchronisation.
     */
    async destroyDb(): Promise<void> {
        this.stopSync();
        await this.localDb?.destroy();
        this.localDb = null;
        this.remoteDb = null;
        this.userId = '';
    }

    /**
     * Utilitaire : met à jour l’état de la synchronisation.
     */
    private updateStatus(status: SyncStatus): void {
        this.zone.run(() => {
            this.syncStatus$.next(status);
            this.syncCssClass$.next(this.statusToCssClass(status));
            this.syncCssContainerClass$.next(this.statusToCssContainerClass(status));
        });
    }

    private statusToCssClass(status: SyncStatus): string {
        switch (status) {
            case 'active': return 'fa-sync-alt fa-spin sync-active';
            case 'paused':
            case 'changed':
            case 'empty': return 'fa-check-circle sync-ok';
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
            case 'paused':
            case 'changed':
            case 'empty': return 'sync-ok';
            case 'idle': return 'sync-idle';
            case 'error':
            case 'denied': return 'sync-error';
            case 'needed': return 'sync-needed';
            default: return 'sync-idle';
        }
    }

    public cancelAutoSync(): void {
        for (const timer of this.syncTimers) {
            clearInterval(timer);
        }
        this.syncTimers = [];
    }

    private async cleanInvalidDocs(): Promise<void> {
        if (!this.localDb) return;
        const result = await this.localDb.allDocs({ include_docs: true });
        const invalidDocs = result.rows.filter((row: any) => !row.id || !row.doc || !row.doc._id);
        for (const row of invalidDocs) {
            if (row.id) {
                await this.localDb.remove(row.id, row.value?.rev);
            }
        }
    }


    get syncStatusLabel(): string {
        switch (this.syncStatus$.value) {
            case 'paused':
            case 'changed':
            case 'empty': return 'Synchronisation à jour';
            case 'active': return 'Synchronisation en cours';
            case 'error': return 'Erreur de synchronisation';
            case 'denied': return 'Accès refusé';
            default: return 'Synchronisation requise';
        }
    }

    get isActive(): boolean { return this.syncStatus$.value === 'active'; }
    get isOk(): boolean { return ['paused', 'changed', 'empty'].includes(this.syncStatus$.value); }
    get isError(): boolean { return ['error', 'denied'].includes(this.syncStatus$.value); }
    get isNeeded(): boolean { return this.syncStatus$.value === 'needed'; }
    get isIdle(): boolean { return this.syncStatus$.value === 'idle'; }
}
