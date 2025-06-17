import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@kossi-services/auth.service';
import { UpdateServiceWorkerService } from '@kossi-services/update-service-worker.service';

@Component({
  standalone:false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  isLoggedIn:boolean = false;

 
  constructor(
    private auth: AuthService, 
    private router: Router,
    private usw: UpdateServiceWorkerService,
  ) {
    this.initializeComponent();
  }
  ngOnInit(): void {
  }

    private async initializeComponent(){
    // window.addEventListener('online', () => this.lSync. initializeSync());
    // window.addEventListener('offline', () => this.lSync.setStatus('offline'));

    this.isLoggedIn = this.auth.isLoggedIn;

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
