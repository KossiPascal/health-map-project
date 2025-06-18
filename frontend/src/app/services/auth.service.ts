import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { User } from '../models/interfaces';



@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(this.currentUser);
  public user$ = this.userSubject.asObservable();



  constructor(
    private http: HttpClient,
    private router: Router,
    private api: ApiService
  ) { }

  /**
   * Récupère l'utilisateur courant depuis l'API et met à jour le localStorage.
   */
  fetchUser() {
    this.http.get<User>(this.api.apiUrl('/auth/me'), { withCredentials: true }).subscribe({
      next: user => {
        this.userSubject.next(user);
        localStorage.setItem('user', JSON.stringify(user));
      },
      error: () => this.logout()
    });
  }

  /**
   * Connexion : envoie les identifiants, stocke le user dans le BehaviorSubject + localStorage
   */
  login(credentials: { username: string; password: string }) {
    return this.http.post<User>(this.api.apiUrl('/auth/login'), credentials, { withCredentials: true }).pipe(
      tap((user) => {
        this.userSubject.next(user);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', user.token); // facultatif si cookie httpOnly
      })
    );
  }



  session(credentials: { username: string; password: string }) {
    return this.http.post(this.api.apiUrl('/api/_session'), credentials, { withCredentials: true }).subscribe();
  }

  /**
   * Déconnexion : supprime les données utilisateur et navigue vers /login
   */
  logout() {
    this.http.post(this.api.apiUrl('/auth/logout'), {}, { withCredentials: true }).subscribe(() => {
      this.userSubject.next(null);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      // this.router.navigate(['/login']);
      location.href = "login";
    });
  }

  /**
   * True si un utilisateur est connecté
   */
  get isLoggedIn(): boolean {
    return !!this.userSubject.value;
  }

  /**
   * Récupère le token s'il est stocké (si applicable)
   */
  get token(): string | null {
    return localStorage.getItem('token');
  }

  get userId(): string | null {
    const user = this.currentUser;
    return user?.id ?? null;
  }

  get isAdmin(): boolean {
    const user = this.currentUser;
    return user?.isAdmin == true;
  }

  get canUpdateDhis2Data(): boolean {
    const user = this.currentUser;
    return user?.canUpdateDhis2Data == true;
  }


  get userIdName(): { id: string, name: string } | null {
    const user = this.currentUser;
    return user ? { id: user.id, name: user.username } : null;
  }

  /**
   * Charge le user depuis localStorage (au démarrage)
   */
  get currentUser(): User | null {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  }
}
