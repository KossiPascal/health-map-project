import { Component } from '@angular/core';
import { AuthService } from '@kossi-services/auth.service';
import { UpdateServiceWorkerService } from '@kossi-services/update-service-worker.service';
@Component({
  standalone: false,
  selector: 'reloading-modal',
  templateUrl: './reloading.component.html'
})
export class ReloadingComponent {

  constructor(
    private usw: UpdateServiceWorkerService, private auth: AuthService) { }

  close() {
    this.usw.UPDATE_INTERVAL = this.usw.TWO_HOURS;
  }


  submit() {
    this.usw.cleanToUpdateWebApp().then(e=>this.auth.logout());
  }
}
