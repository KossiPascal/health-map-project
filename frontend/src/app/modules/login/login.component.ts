import { Component, OnDestroy } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "../../services/auth.service";
import { interval, Subscription } from "rxjs";

@Component({
  standalone: false,
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnDestroy {
  username = '';
  password = '';
  loading = false;

  // Messages dynamiques pendant le chargement
  loadingMessages = [
    "Connexion en cours...",
    "Vérification de vos identifiants...",
    "Chargement des données utilisateur...",
    "Préparation de votre espace sécurisé...",
    "Merci de patienter un instant..."
  ];
  currentMessage = this.loadingMessages[0];
  private messageIndex = 0;
  private messageSub?: Subscription;

  constructor(private auth: AuthService, private router: Router) { }

  login() {
    this.loading = true;
    this.startLoadingMessages();

    this.auth.login({ username: this.username, password: this.password }).subscribe({
      next: (user) => {
        console.log(user)
        this.stopLoadingMessages();
        this.loading = false;
        this.router.navigate(['/map-register']);
      },
      error: err => {
        this.stopLoadingMessages();
        this.loading = false;
        console.error('Erreur de connexion:', err);
        alert('Nom d’utilisateur ou mot de passe incorrect.');
      }
    });
  }

  private startLoadingMessages() {
    this.messageIndex = 0;
    this.currentMessage = this.loadingMessages[this.messageIndex];
    this.messageSub = interval(5000).subscribe(() => {
      this.messageIndex = (this.messageIndex + 1) % this.loadingMessages.length;
      this.currentMessage = this.loadingMessages[this.messageIndex];
    });
  }

  private stopLoadingMessages() {
    this.messageSub?.unsubscribe();
  }

  ngOnDestroy() {
    this.stopLoadingMessages();
  }
}
