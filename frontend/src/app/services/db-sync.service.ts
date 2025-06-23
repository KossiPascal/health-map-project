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

    private replicateFrom: PouchDB.Replication.ReplicationResultComplete<{}> | null = null;
    private replicateTo: PouchDB.Replication.ReplicationResultComplete<{}> | null = null;
    private syncHandler: PouchDB.Replication.Sync<{}> | null = null;

    private syncStatus$ = new BehaviorSubject<SyncStatus>('idle');
    private syncCssClass$ = new BehaviorSubject<string>('fa-circle sync-idle');
    private syncCssContainerClass$ = new BehaviorSubject<string>('sync-idle');
    private syncTimers: any[] = [];
    private isSyncing = false;
    private functions: (() => Promise<void>) | null = null;

    private isOnline: boolean = false;

    private syncIntervalId: any = null;

    status$ = this.syncStatus$.asObservable();
    cssClass$ = this.syncCssClass$.asObservable();
    cssContainerClass$ = this.syncCssContainerClass$.asObservable();


    constructor(private zone: NgZone, private network: NetworkService) {
        
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

    startAutoReplication(intervalMs = 5 * 60 * 1000): void {
        this.network.onlineChanges$.subscribe(isOnline => {
            this.isOnline = isOnline;
            if (isOnline) {
                console.log('[NETWORK] ✅ En ligne : tentative de synchronisation dans 2s');
                // Nettoyage si déjà lancé
                if (this.syncIntervalId) clearInterval(this.syncIntervalId);

                // Démarre immédiatement une réplication
                this.replicateSafely();

                // Puis redémarre toutes les X minutes
                this.syncIntervalId = setInterval(() => {
                    this.replicateSafely();
                }, intervalMs);

                console.log(`[SYNC AUTO] Réplication automatique chaque ${intervalMs / 1000 / 60} min.`);
            } else {
                console.log('[NETWORK] ❎ Hors ligne : arrêt de la synchronisation');
                this.stopAutoReplication();
            }
        });
    }



    async replicateSafely(): Promise<void> {
        if (!this.localDb || !this.remoteDb || !this.isOnline) {
            console.warn('[SYNC] Réplication ignorée (offline ou DB non initialisées)');
            return;
        }

        this.isSyncing = true;
        this.updateStatus('active');

        const filterOptions = {
            filter: 'filters/by_owner',
            query_params: { owner: this.userId }
        };

        try {
            // Étape 1 : Tirer les données récentes du serveur
            console.log('[SYNC] Réplication FROM remote...');
            await this.localDb.replicate.from(this.remoteDb, filterOptions);

            // Étape 2 : Gérer les conflits après réception
            await this.resolveConflicts();

            // Étape 3 : Pousser les données locales vers le serveur
            console.log('[SYNC] Réplication TO remote...');
            await this.localDb.replicate.to(this.remoteDb);

            this.updateStatus('paused');
        } catch (error) {
            console.error('[SYNC] Erreur pendant la réplication :', error);
            this.updateStatus('error');
        } finally {
            this.isSyncing = false;
        }
    }


    async manualSync(): Promise<void> {
        if (!this.localDb || !this.remoteDb || !this.isOnline) {
            this.updateStatus('idle');
            console.warn('[SYNC] ❌ Synchronisation manuelle ignorée (offline ou DB manquante)');
            return;
        }

        this.isSyncing = true;
        this.updateStatus('active');
        console.log('[SYNC] 🔁 Début de la synchronisation manuelle');

        const filterOptions = {
            // filter: '_view',
            // view: 'map-client/by_owner',
            // query_params: { key: this.userId },
            filter: 'filters/by_owner',
            query_params: { owner: this.userId }
        };

        try {
            // Synchronisation locale vers distante
            console.log('[SYNC] ⬆️ Envoi des données locales vers CouchDB distant...');
            this.replicateTo = await this.localDb.replicate.to(this.remoteDb);

            // Synchronisation distante vers locale avec filtre
            console.log('[SYNC] ⬇️ Récupération des données depuis CouchDB distant...');
            this.replicateFrom = await this.localDb.replicate.from(this.remoteDb, filterOptions);

            console.log('[SYNC] ✅ Synchronisation manuelle terminée');
            this.updateStatus('paused');
            this.checkIfSyncNeeded(); // Optionnel selon ta logique métier
        } catch (error: any) {
            console.error('[SYNC] ❌ Erreur pendant la synchronisation manuelle :', error);
            const isKnownIssue = (`${error?.docId}/${error?.message}`.includes('_local/') || (error?.name ?? error?.message) === 'missing_id');
            this.updateStatus(isKnownIssue ? 'paused' : 'error');
        } finally {
            this.isSyncing = false;
        }
    }

    private async resolveConflicts(): Promise<void> {
        if (!this.localDb || !this.remoteDb || !this.isOnline) {
            console.warn('[SYNC] Réplication ignorée (offline ou DB non initialisées)');
            return;
        }

        const result = await this.localDb.allDocs({
            include_docs: true,
            conflicts: true
        });

        for (const row of result.rows) {
            const doc = row.doc;
            if (doc?._conflicts && doc._conflicts.length > 0) {
                console.warn(`[CONFLIT] Document ${doc._id} en conflit :`, doc._conflicts);

                // 🔁 Exemple simple : on garde la version la plus récente (par date)
                const conflictRevs = doc._conflicts;
                const allRevs = [doc._rev, ...conflictRevs];

                const allVersions = await Promise.all(
                    allRevs.map(rev => this.localDb!.get(doc._id, { rev }))
                );

                // Suppose qu'on utilise un champ `updatedAt` ISO pour comparer
                allVersions.sort((a: any, b: any) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );

                const winningDoc = allVersions[0];
                const losingRevs = allVersions.slice(1).map(d => d._rev);

                // Supprimer les versions perdantes
                for (const rev of losingRevs) {
                    await this.localDb.remove(doc._id, rev);
                    console.log(`[CONFLIT] Rev supprimée : ${rev}`);
                }
            }
        }
    }


    stopAutoReplication(): void {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
            console.log('[SYNC AUTO] Réplication automatique stoppée.');
        }
    }

    private async checkIfSyncNeeded(): Promise<void> {
        if (!this.remoteDb || !this.localDb || !this.isOnline || this.isSyncing) return this.updateStatus('error');
        try {
            const pending = await this.localDb.replicate.to(this.remoteDb, { live: false });
            this.updateStatus((pending.docs_written > 0 || pending.docs_read > 0) ? 'needed' : 'paused');
        } catch {
            this.updateStatus('error');
        }
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
        this.stopAutoReplication();
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
