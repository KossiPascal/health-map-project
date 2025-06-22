import { Injectable } from "@angular/core";
import { CanActivate, Router } from "@angular/router";
import { Observable } from "rxjs";
import { UserContextService } from "@kossi-services/user-context.service";

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private ctx: UserContextService, private router: Router) {}

  canActivate(): Observable<boolean> | boolean {
    if (this.ctx.isLoggedIn) return true;
    // this.router.navigate(['/login']);
    location.href = "/#/login";
    return false;
  }
}