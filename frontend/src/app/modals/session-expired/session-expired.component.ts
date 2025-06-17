import { Component } from '@angular/core';
import { AuthService } from '@kossi-services/auth.service';

@Component({
  standalone: false,
  selector: 'session-expired',
  templateUrl: './session-expired.component.html'
})
export class SessionExpiredComponent {
  static id = 'session-expired-modal';

  constructor(private auth:AuthService) { }

  close() {
  }
  

  submit() {
    this.auth.logout();
  }
}
