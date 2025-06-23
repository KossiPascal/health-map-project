import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { AuthService } from "../../services/auth.service";
import { Router } from "@angular/router";
import { NetworkService } from "@kossi-services/network.service";
import { ModalService } from "@kossi-services/modal.service";
import { LogoutConfirmComponent } from "@kossi-modals/logout/logout-confirm.component";
import { DbSyncService } from "@kossi-services/db-sync.service";

@Component({
    standalone: false,
    selector: 'app-navbar',
    templateUrl: './app-navbar.component.html',
    styleUrls: ['./app-navbar.component.css'],
})
export class NavbarComponent implements OnInit, OnDestroy {
    @ViewChild('menuRef') menuRef!: ElementRef;

    syncStatus = 'Offline';
    // online:SyncStatus = 'idle';

    // syncClass: Observable<string>;
    // syncContainerClass: Observable<string>;

    // syncStatusLabel: string = '';
    // isActive:boolean = false;

    activeMenu: boolean = false;
    isOnline = true;

    constructor(public auth: AuthService, private mService: ModalService, public dbSync: DbSyncService, private router: Router, private network: NetworkService) {

        this.network.onlineChanges$.subscribe(status => {
            this.isOnline = status;
            //   console.log('🌐 Connexion Internet :', status ? 'En ligne' : 'Hors ligne');
        });
        //   this.db.status$.subscribe(status => {
        //     this.syncStatus = status;
        //     this.online = status === 'active';
        //   });
        // this.router.events.subscribe(event => {
        //     if (event instanceof NavigationEnd) {
        //       this.currentRoute = event.urlAfterRedirects;
        //     }
        //   });
    }

    ngOnInit() {
    }

    ngOnDestroy(): void {
    // this.dbSync.stopSync();
    }

    toggleMenu() {
        this.activeMenu = !this.activeMenu;
    }


    @HostListener('document:click', ['$event'])
    onClickOutside(event: MouseEvent) {
        const clickedInside = this.menuRef?.nativeElement.contains(event.target);
        if (!clickedInside) {
            this.activeMenu = false;
        }
    }

    /** Ajoute la classe 'active' manuellement si on est sur /map-register ou /map-dashboard */
    isActiveRoute(route: string): boolean {
        return this.router.url === route;
    }

    // logout() {
    //     if (confirm("❌ Confirmer l'action de déconnection")) {
    //         this.auth.logout();
    //     }
    // }

    logout(event: Event) {
        event.preventDefault();
        this.mService.open(LogoutConfirmComponent).subscribe((result) => {
            if (result) {
                console.log("Données reçues depuis la modal :", result);
            }
        });
    }

    triggerManualSync() {
        this.dbSync.manualSync();
    }

    reloadApp(): void {
        window.location.reload();
    }

}
