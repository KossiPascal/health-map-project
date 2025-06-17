import { Injectable } from "@angular/core";
import { CanActivate, Router } from "@angular/router";
import { Observable } from "rxjs";
import { AuthService } from "../services/auth.service";

@Injectable({ providedIn: 'root' })
export class LogOutGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): Observable<boolean> | boolean {
    if (!this.auth.isLoggedIn) return true;
    // this.router.navigate(['/map-viewer']);
    location.href = "/#/map-viewer";
    return false;
  }
}