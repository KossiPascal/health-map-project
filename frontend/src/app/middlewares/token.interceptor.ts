import {
    HttpInterceptor, HttpRequest, HttpHandler, HttpEvent
  } from "@angular/common/http";
  import { Injectable, Injector } from "@angular/core";
  import { Observable } from "rxjs";
  import { AuthService } from "../services/auth.service";
  
  @Injectable()
  export class TokenInterceptor implements HttpInterceptor {
  
    constructor(private injector: Injector) {}  // ✅ au lieu d'injecter AuthService directement
  
    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
      const authService = this.injector.get(AuthService); // ✅ injection différée
      const token = authService.token;

      // Ignorer les routes spécifiques comme /auth/login
      if (req.url.includes('/auth/login') || req.url.includes('/auth/register')) {
        return next.handle(req);
      }
  
      if (token && token.trim() !== '') {
        req = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        });
      }
  
      return next.handle(req);
    }
  }
  