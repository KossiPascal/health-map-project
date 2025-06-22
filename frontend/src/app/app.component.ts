import { AfterViewInit, Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { UpdateServiceWorkerService } from '@kossi-services/update-service-worker.service';
import { UserContextService } from '@kossi-services/user-context.service';

@Component({
  standalone: false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit {
  isLoggedIn: boolean = false;


  constructor(
    private userCtx: UserContextService,
    private router: Router,
    private usw: UpdateServiceWorkerService,
  ) {
    this.initializeComponent();
  }
  ngOnInit(): void {
  }
  ngAfterViewInit(): void {
    window.addEventListener('unhandledrejection', event => {
      const err = event.reason;
      if (err && err.message && err.message.includes('Failed to fetch')) {
        console.warn('🌐 Échec fetch silencieux détecté', err);
        event.preventDefault(); // évite l’erreur console
      }
    });

    // let startY = 0;

    // window.addEventListener('touchstart', (e: TouchEvent) => {
    //   if (e.touches.length !== 1) return;
    //   startY = e.touches[0].clientY;
    // });

    // window.addEventListener('touchmove', (e: TouchEvent) => {
    //   const currentY = e.touches[0].clientY;
    //   const scrollTop = window.scrollY;

    //   // Si l’utilisateur est tout en haut et glisse vers le bas => bloquer
    //   if (scrollTop === 0 && currentY > startY) {
    //     e.preventDefault(); // bloque le "pull-to-refresh"
    //   }
    // }, { passive: false }); // passive: false est obligatoire pour pouvoir utiliser preventDefault
  }


  private async initializeComponent() {
    this.isLoggedIn = this.userCtx.isLoggedIn;

    if (![4200, '4200'].includes(location.port)) {
      this.usw.registerServiceWorker();
      this.usw.watchForChanges();
      this.requestPersistentStorage();
      // this.sw.checkForUpdates();
    }

  }



  private requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage
        .persist()
        .then(granted => {
          if (granted) {
            console.info('Persistent storage granted: storage will not be cleared except by explicit user action');
          } else {
            console.info('Persistent storage denied: storage may be cleared by the UA under storage pressure.');
          }
        });
    }
  }

}
