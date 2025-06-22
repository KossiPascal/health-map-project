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
    private syncStatus$ = new BehaviorSubject<SyncStatus>('idle');
    private syncCssClass$ = new BehaviorSubject<string>('fa-circle sync-idle');
    private syncCssContainerClass$ = new BehaviorSubject<string>('sync-idle');
    private syncTimers: any[] = [];
    private isSyncing = false;


    status$ = this.syncStatus$.asObservable();
    cssClass$ = this.syncCssClass$.asObservable();
    cssContainerClass$ = this.syncCssContainerClass$.asObservable();


    constructor(private zone: NgZone, private network: NetworkService) {
        this.setupNetworkListeners();
    }

    /**
     * Initialise les bases et l'utilisateur pour la synchronisation.
     */
    initialize(localDb: PouchDB.Database, remoteDb: PouchDB.Database, userId: string | null) {
        this.localDb = localDb;
        this.remoteDb = remoteDb;
        this.userId = userId;
    }

    /**
     * Gère les événements de changement de réseau.
     */
    private setupNetworkListeners() {
        this.network.onlineChanges$.subscribe(isOnline => {
            if (isOnline) {
                this.startLiveSync();
            } else {
                this.stopSync();
            }
        });
    }

    /**
     * Lance la synchronisation PouchDB ↔ CouchDB.
     * Priorité aux données locales.
     */
    async startLiveSync(): Promise<void> {
        if (!this.localDb || !this.remoteDb || !navigator.onLine || this.isSyncing) {
            this.updateStatus('idle');
            return;
        }

        try {
            this.isSyncing = true;
            this.updateStatus('active');
            // Sync initial: local → distant
            await this.localDb.replicate.to(this.remoteDb);
            // Sync live: distant → local
            this.replicateFrom = this.localDb.replicate.from(this.remoteDb, {
                live: true,
                retry: true,
                filter: 'filters/by_owner',
                query_params: { owner: this.userId }
            })
                .on('change', () => this.updateStatus('changed'))
                .on('paused', err => this.updateStatus(err ? 'error' : 'paused'))
                .on('active', () => this.updateStatus('active'))
                .on('error', () => this.updateStatus('error'));
            // Sync live: local → distant
            this.replicateTo = this.localDb.replicate.to(this.remoteDb, {
                live: true,
                retry: true
            })
                .on('change', () => this.updateStatus('changed'))
                .on('paused', err => this.updateStatus(err ? 'error' : 'paused'))
                .on('active', () => this.updateStatus('active'))
                .on('denied', () => this.updateStatus('error'))
                .on('error', () => this.updateStatus('error'));

        } catch (error) {
            this.isSyncing = false;
            this.updateStatus('error');
        }
    }

    private async checkIfSyncNeeded(): Promise<void> {
        if (!this.remoteDb || !this.localDb || !navigator.onLine || this.isSyncing) return this.updateStatus('error');
        try {
            const pending = await this.localDb.replicate.to(this.remoteDb, { live: false });
            this.updateStatus((pending.docs_written > 0 || pending.docs_read > 0) ? 'needed' : 'paused');
        } catch {
            this.updateStatus('error');
        }
    }

    async syncLoop(query?: { owner: string | null }): Promise<void> {
        if (!this.remoteDb || !this.localDb || !navigator.onLine || this.isSyncing) return this.updateStatus('error');
        try {
            this.updateStatus('active');

            await this.localDb.replicate.to(this.remoteDb, { retry: false })
                .on('complete', info => console.log('✅ Replication complete', info))
                .on('error', (err: any) => {
                    // console.error('❌ Replication error', err)
                    if ((`${err?.docId}/${err?.message}`).includes('_local/') || (err?.name ?? err?.message) === 'missing_id') {
                        this.updateStatus('paused');
                    } else {
                        this.updateStatus('error');
                    }
                });
            await this.localDb.replicate.from(this.remoteDb, {
                filter: 'filters/by_owner',
                query_params: query ?? { owner: this.userId }
            });

            this.updateStatus('paused');
            this.checkIfSyncNeeded();
        } catch (error: any) {
            if ((`${error?.docId}/${error?.message}`).includes('_local/') || (error?.name ?? error?.message) === 'missing_id') {
                this.updateStatus('paused');
            } else {
                this.updateStatus('error');
            }
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
        return !!this.replicateFrom || !!this.replicateTo;
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
