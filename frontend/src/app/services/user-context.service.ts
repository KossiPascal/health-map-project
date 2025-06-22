import { Inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common'; // ✅ CORRECT
import { CookieService } from 'ngx-cookie-service';
import { User } from '@kossi-models/interfaces';



@Injectable({
  providedIn: 'root'
})
export class UserContextService {

  readonly COOKIE_NAME = 'TogoMapUserCtx';

  constructor(
    private cookieService: CookieService,
    @Inject(DOCUMENT) private document: Document
  ) { }


  get user(): User | null {
    if (!this.cookieService.check(this.COOKIE_NAME)) return null;
    try {
      const raw = this.cookieService.get(this.COOKIE_NAME);
      const orgUnits = localStorage.getItem('orgUnits');
      return { ...JSON.parse(decodeURIComponent(raw)), orgUnits: JSON.parse(decodeURIComponent(orgUnits!)) };
    } catch (e) {
      console.warn('[UserCtxService] Erreur de parsing userCtx:', e);
      return null;
    }
  }

  get token(): string | null {
    return this.user?.token ?? null;
  }

  get userId(): string | null {
    return this.user?.id ?? null;
  }

  get username(): string | null {
    return this.user?.username ?? null;
  }

  get isAdmin(): boolean {
    return !!this.user?.isAdmin;
  }

  get canUpdateDhis2Data(): boolean {
    return !!this.user?.canUpdateDhis2Data;
  }

  // private isTokenValid(token: string): boolean {
  //   try {
  //     const payloadBase64 = token.split('.')[1];
  //     if (!payloadBase64) return false;
  //     const payload = JSON.parse(atob(payloadBase64));
  //     const now = Math.floor(Date.now() / 1000);
  //     return payload.exp && payload.exp > now;
  //   } catch (e) {
  //     console.warn('[UserCtxService] JWT parsing failed:', e);
  //     return false;
  //   }
  // }

  /** Est-ce que l’utilisateur est connecté ? */
  get isLoggedIn(): boolean {
    // const token = this.token;
    // return !!token && this.isTokenValid(token);
    return !!this.user;
  }

  clearAllCookies(): void {
    const allCookies = this.cookieService.getAll();
    for (const cookieName of Object.keys(allCookies)) {
      this.cookieService.delete(cookieName, '/');
      this.cookieService.delete(cookieName); // fallback pour path vide
    }
  }


  hasRole(role: string, user?: User | null): boolean {
    const currentUser = user || this.user;
    return !!(currentUser && currentUser.roles?.includes(role));
  }

  setUser(user: User): void {
    const encoded = encodeURIComponent(JSON.stringify(user));
    this.cookieService.set(this.COOKIE_NAME, encoded, undefined, '/');
  }
}
