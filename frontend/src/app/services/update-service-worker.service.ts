/*
Handles service worker updates
*/
import { Injectable, NgZone } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ApiService } from './api.service';
import { CacheStorageService } from './cache-storage.service';
import { ReloadingComponent } from '@kossi-components/reloading/reloading.component';
import { AppStorageService } from './local-storage.service';
import { AuthService } from './auth.service';
import { ModalService } from './modal.service';
import { UserContextService } from './user-context.service';
import { NetworkService } from './network.service';


@Injectable({
  providedIn: 'root'
})
export class UpdateServiceWorkerService {
  private readonly retryFailedUpdateAfterSec = 5 * 60;
  private existingUpdateLoop: any;
  private appNewVersion: any;
  private isUpdating: boolean = false;

  public updateServiceWorker: boolean = true;
  public UPDATE_INTERVAL?: number;
  // public readonly TEN_SECOND: number = 10 * 1000;
  public readonly SIXTY_SECOND: number = 60 * 1000;
  public readonly TWO_HOURS: number = 2 * 60 * 60 * 1000;

  constructor(
    private swUpdate: SwUpdate,
    private cache: CacheStorageService,
    private ngZone: NgZone,
    private store: AppStorageService,
    private modalService: ModalService,
    private auth: AuthService,
    private api: ApiService,
    private userCtx: UserContextService,
    private network: NetworkService
  ) {
  }

  update(onSuccess?: () => any) {
    // This avoids multiple updates retrying in parallel
    if (this.existingUpdateLoop) {
      clearTimeout(this.existingUpdateLoop);
      this.existingUpdateLoop = undefined;
    }
    window.navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        const registration = registrations && registrations.length && registrations[0];
        if (!registration) {
          console.warn('Cannot update service worker - no active workers found');
          return;
        }
        registration.onupdatefound = () => {
          console.warn('update found');
          const installingWorker = registration.installing!;
          installingWorker.onstatechange = () => {
            switch (installingWorker.state) {
              case 'activated':
                registration.onupdatefound = null;
                if (onSuccess) {
                  onSuccess();
                }
                break;
              case 'redundant':
                console.warn(
                  'Service worker failed to install or marked as redundant. ' +
                  `Retrying install in ${this.retryFailedUpdateAfterSec}secs.`
                );
                this.existingUpdateLoop = setTimeout(() => this.update(onSuccess), this.retryFailedUpdateAfterSec * 1000);
                registration.onupdatefound = null;
                break;
              default:
                console.debug(`Service worker state changed to ${installingWorker.state}!`);
            }
          };
        };
        registration.update();
      });
  }

  registerServiceWorker(onInstalling?: () => void) {
    navigator.serviceWorker.register('/ngsw-worker.js')
      .then((registration) => {
        if (onInstalling) {
          onInstalling();
        }
        // console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch(error => {
        // console.error('Service Worker registration failed:', error);
      });
  }

  checkForUpdates(): void {
    this.swUpdate.checkForUpdate().then((can_upadte: boolean) => {
      if (can_upadte && this.swUpdate.isEnabled) {
        this.swUpdate.versionUpdates.subscribe((event) => {
          if (event.type === "VERSION_READY") {
            if (confirm('A new version is available. Reload to update?')) {
              window.location.reload();
            }
          }
        });
      }
    }).catch((err: any) => {
      console.log('Service workers are disabled or not supported by this browser');
    })
  }

  async unregisterServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.unregister();
        }
      })
    }
  }

  async cleanToUpdateWebApp(): Promise<void> {
    if (this.isUpdating) return; // Vérifie si une mise à jour est déjà en cours
    this.isUpdating = true; // Marque l'état de la mise à jour comme en cours
    try {
      await this.unregisterServiceWorker();
      if (this.appNewVersion) {
        this.store.set({ db: 'local', name: '_versions', value: JSON.stringify(this.appNewVersion) });
      }
      // Nettoyer le cache du navigateur
      const cacheKeys = await caches.keys();
      for (const cacheKey of cacheKeys) {
        if (!this.cache.excludeOnCacheReload.includes(cacheKey)) {
          await caches.delete(cacheKey);
        }
      }
      window.location.reload();
      // // Reload the page after 3 seconds
      //   setTimeout(() => {
      //     window.location.reload();
      //   }, 2000);
    } catch (error) {
      console.error('Erreur lors de la mise à jour :', error);
    } finally {
      this.isUpdating = false; // Marque l'état de la mise à jour comme terminée
    }
  }

  async watchForChanges() {
    if (this.userCtx.userId) {
      this.network.onlineChanges$.subscribe(online => {
        if (online) {
          // console.log('✅ En ligne');
          this.api.appVersion().subscribe((newVersion: { service_worker_version: number | null, app_version: string | null }) => {
            if (newVersion) {
              const oldVersionsStr = this.store.get({ db: 'local', name: '_versions' });
              if (oldVersionsStr) {
                const oldVersions = JSON.parse(oldVersionsStr) as { service_worker_version: number | null, app_version: string | null };
                if (newVersion.service_worker_version && `${oldVersions.service_worker_version}` != `${newVersion.service_worker_version}`) {
                  this.appNewVersion = newVersion;
                  this.modalService.open(ReloadingComponent).subscribe((result: any) => {
                    if (result) {
                      console.log("Données reçues depuis la modal :", result);
                    }
                  });
                }
              } else {
                return this.store.set({ db: 'local', name: '_versions', value: JSON.stringify(newVersion) });
              }
            }
            setTimeout(() => this.ngZone.run(() => this.watchForChanges()), this.UPDATE_INTERVAL ?? this.SIXTY_SECOND);
          }, (err: any) => {
            console.log(err.toString());
            setTimeout(() => this.ngZone.run(() => this.watchForChanges()), this.UPDATE_INTERVAL ?? this.SIXTY_SECOND);
          });
        } else {
          // console.warn('🚫 Hors ligne');
          // this.watchForChanges();
        }
      });
    }
  }
}
