import { Component } from '@angular/core';
import { AuthService } from '@kossi-src/app/services/auth.service';

@Component({
  standalone: false,
  selector: 'logout-confirm-modal',
  templateUrl: './logout-confirm.component.html',
  styleUrl: './logout-confirm.component.css'
})
export class LogoutConfirmComponent {

  constructor(private auth: AuthService) { }


  close() {
  }

  logout() {
    this.auth.logout();
  }
}
