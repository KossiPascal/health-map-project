import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { UserContextService } from './user-context.service';
import { Observable, tap } from 'rxjs';
import { DOCUMENT } from '@angular/common';
import { CookieService } from 'ngx-cookie-service';



@Injectable({ providedIn: 'root' })
export class AuthService {

  constructor(
    private http: HttpClient,
    // private router: Router,
    // private readonly db: DbService,
    private userCtx: UserContextService,
    private api: ApiService,
    private readonly cookieService: CookieService,
    @Inject(DOCUMENT) private readonly document: Document,
  ) { }

  // fetchUser() {
  //   this.http.get<User>(this.api.apiUrl('/auth/me'), { withCredentials: true }).subscribe({
  //     next: user => {
  //       this.userSubject.next(user);
  //       localStorage.setItem('user', JSON.stringify(user));
  //     },
  //     error: () => this.logout()
  //   });
  // }

  login(credentials: { username: string; password: string }) {
    return this.http.post<any>(this.api.apiUrl('/auth/login'), credentials, { withCredentials: true }).pipe(
      tap((user: { name: string, orgUnits: any }) => {
        // this.userSubject.next(user);
        // localStorage.setItem('token', user.token); // facultatif si cookie httpOnly
        localStorage.setItem('orgUnits', JSON.stringify(user.orgUnits));
      })
    );
  }

  newToken(updateReload: boolean = false): Observable<any> {
    return this.http.post(this.api.apiUrl('/auth/new-token'), { updateReload }, { withCredentials: true })
  }

  refreshToken(): Observable<any> {
    return new Observable<any>((observer) => {
      this.newToken().subscribe({
        next: (res: any) => {
          if (res.status === 200) {
            observer.next(res);
            observer.complete();
          } else {
            observer.error(new Error('Échec de la mise à jour du token'));
          }
        },
        error: (err: any) => {
          observer.error(err);
        }
      });
    });
  }

  session(credentials: { username: string; password: string }) {
    return this.http.post(this.api.apiUrl('/api/_session'), credentials, { withCredentials: true }).subscribe();
  }

  // --- Navigation et login/logout ---
  navigateToLogin() {
    console.warn('User must reauthenticate');

    const params = new URLSearchParams();
    params.append('redirect', this.document.location.href);

    const username = this.userCtx.user?.username;
    if (username) {
      params.append('username', username);
    }

    // Supprimer le cookie JS (non HttpOnly)
    this.cookieService.delete(this.userCtx.COOKIE_NAME, '/');
    this.userCtx.clearAllCookies();

    const redirectUrl = `/#/login?${params.toString()}`;
    window.location.href = redirectUrl;

    // // this.document.location.href = `/${this.db.dbName}/login?${params.toString()}`;
  }

  async logout() {
    try {
      this.http.post(this.api.apiUrl('/auth/logout'), {}, { withCredentials: true }).toPromise();
    } catch (e: any) {
      console.warn('Erreur de déconnexion :', e);
    }
    this.navigateToLogin();
    // await this.db.localDb.deleteIndex('/_session');
    // await this.db.remoteDb.get().delete('/_session');
    // this.router.navigate(['/login']);
    // location.href = '/login';
  }

}
