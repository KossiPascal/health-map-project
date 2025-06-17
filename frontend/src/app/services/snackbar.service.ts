import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SnackbarPosition, SnakBarOutPut } from '@kossi-models/interfaces';

@Injectable({
  providedIn: 'root'
})
export class SnackbarService {
  private snackbarQueue: SnakBarOutPut[] = [];
  private snackbarQueueSubject = new BehaviorSubject<SnakBarOutPut[]>([]);
  // private snackbarTimeouts = new Map<string, NodeJS.Timeout>();
  private snackbarTimeouts = new Map<string, any>();

  constructor() {}

  /**
   * Affiche une nouvelle notification Snackbar.
   * @param param - Paramètres du snackbar.
   */
  show(param: SnakBarOutPut): void {
    const fadeOutDuration = 1000; // Durée du fade-out en ms
    const displayDuration = param.duration ?? 2000; // Durée totale d'affichage

    const snackbar: SnakBarOutPut = {
      msg: param.msg,
      color: param.color ?? 'default',
      duration: displayDuration,
      position: param.position ?? 'BOTTOM',
      fadeOutClass: '' // Initialement vide
    };

    this.snackbarQueue.push(snackbar);
    this.snackbarQueueSubject.next([...this.snackbarQueue]);

    const fadeOutDelay = displayDuration - fadeOutDuration;

    // Planifie la suppression automatique après la durée spécifiée
    const timeout = setTimeout(() => {
      if (this.snackbarQueue.includes(snackbar)) {
        snackbar.fadeOutClass = 'fade-out';
        this.removeSnackbar(snackbar);
      }
    }, fadeOutDelay);
    this.snackbarTimeouts.set(snackbar.msg, timeout);
  }

  /**
   * Affiche un message de succès.
   */
  showSuccess(message: string, position: SnackbarPosition = 'TOP'): void {
    this.show({ msg: message, color: 'success', position });
  }

  /**
   * Affiche un message d'erreur.
   */
  showError(message: string, position: SnackbarPosition = 'TOP'): void {
    this.show({ msg: message, color: 'danger', position });
  }

  /**
   * Affiche un avertissement.
   */
  showWarning(message: string, position: SnackbarPosition = 'TOP'): void {
    this.show({ msg: message, color: 'warning', position });
  }

  /**
   * Supprime un snackbar de la file d'attente.
   * @param snackbar - Le snackbar à supprimer.
   */
  removeSnackbar(snackbar: SnakBarOutPut): void {
    this.snackbarQueue = this.snackbarQueue.filter(item => item !== snackbar);
    this.snackbarQueueSubject.next([...this.snackbarQueue]);

    // Nettoie le timeout associé si nécessaire
    if (this.snackbarTimeouts.has(snackbar.msg)) {
      clearTimeout(this.snackbarTimeouts.get(snackbar.msg));
      this.snackbarTimeouts.delete(snackbar.msg);
    }
  }

  /**
   * Retourne un Observable contenant la liste des snackbars actifs.
   */
  getSnackbarQueue() {
    return this.snackbarQueueSubject.asObservable();
  }
}
