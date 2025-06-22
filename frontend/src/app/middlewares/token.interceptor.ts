import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { catchError, from, Observable, of, switchMap, throwError } from "rxjs";
import { UserContextService } from "@kossi-services/user-context.service";
import { AuthService } from "@kossi-services/auth.service";
import { jwtDecode } from "jwt-decode";


@Injectable({
  providedIn: "root",
})
export class TokenInterceptor implements HttpInterceptor {
  private refreshInProgress = false;

  constructor(private userCtx: UserContextService, private auth: AuthService) { }  // ✅ au lieu d'injecter AuthService directement

intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
  // if (this.isLoginRequest(request)) {
  //   return next.handle(request); // Skip the interceptor for login requests
  // }

  // const token = this.userCtx.token;

  try {
    // if (!token || token === '') {
    //   this.auth.logout(); // Aucun token, déconnexion immédiate
    //   return throwError(() => new Error("Utilisateur non authentifié"));
    // }

    // if (this.isTokenExpired(token)) {
    //   this.auth.logout(); // Token expiré
    //   return throwError(() => new Error("Token expiré"));
    // }

    // if (this.shouldRefreshToken(token)) {
    //   return this.refreshToken().pipe(
    //     switchMap((newToken) => {
    //       const cloned = request.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
    //       return next.handle(cloned);
    //     }),
    //     catchError((error) => this.handleError(error))
    //   );
    // }

    // const clonedRequest = request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    // return next.handle(clonedRequest).pipe(
    //   catchError((error) => this.handleError(error))
    // );

    return next.handle(request);

  } catch (error) {
    return this.handleError(error); // ✅ Ajout du return ici
  }
}

  private isTokenExpired(token: string): boolean {
    try {
      const decoded: any = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      return decoded.exp < now;
    } catch (error) {
      return true; // Considérer expiré si erreur
    }
  }

  private shouldRefreshToken(token: string): boolean {
    try {
      const decoded: any = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      const bufferTime = 60; // Rafraîchir 1 min avant expiration
      return decoded.exp - now < bufferTime;
    } catch (error) {
      return false;
    }
  }

  // private refreshToken(): Observable<string> {
  //   if (this.refreshInProgress) {
  //     return from(this.userCtx.token); // Si déjà en cours, utiliser le token actuel
  //   }
  //   this.refreshInProgress = true;

  //   return this.auth.refreshToken().subscribe({
  //     next:(token: any) => {
  //       this.refreshInProgress = false;
  //       // return from(this.auth.saveToken(res)).pipe(
  //       //   switchMap(() => {
  //       //     this.refreshInProgress = false;
  //       //     return of(res.token);
  //       //   }),
  //       //   catchError((saveError) => {
  //       //     this.refreshInProgress = false;
  //       //     console.error('Erreur lors de la sauvegarde du token :', saveError);
  //       //     this.auth.logout();
  //       //     return throwError(() => new Error("Échec de la sauvegarde du token"));
  //       //   })
  //       // );
  //     }
  //   }),
  //     catchError((error) => {
  //       this.refreshInProgress = false;
  //       console.error('Erreur lors du rafraîchissement du token :', error);
  //       this.auth.logout();
  //       return throwError(() => new Error("Impossible de rafraîchir le token"));
  //     })
  //   );
  // }

  private handleError(error: any): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      if ([401, 403].includes(error.status) || error.error?.action === "logout") {
        this.auth.logout();
      }
    }
    return throwError(() => new Error(error?.message || "Une erreur est survenue"));
  }

  private isLoginRequest(request: HttpRequest<any>): boolean {
    if (request.url.includes('/auth/login') || request.body?.loginModeCredents === true) {
      return true;
    }
    return false;
  }
}
