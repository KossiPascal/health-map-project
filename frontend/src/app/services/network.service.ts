import { Injectable, NgZone } from "@angular/core";
import { BehaviorSubject, debounceTime, fromEvent, merge, Observable } from "rxjs";

@Injectable({ providedIn: 'root' })
export class NetworkService {
  private readonly _status$ = new BehaviorSubject<boolean>(navigator.onLine);
  private readonly _checkUrl = 'https://www.gstatic.com/generate_204';

  constructor(private ngZone: NgZone) {
    this.monitorBrowserEvents();
    this.checkOfflineFallback();
    // this.autoPingEvery(1000);  // Toutes les 1 secondes
  }

  private monitorBrowserEvents() {
    this.ngZone.runOutsideAngular(() => {
      merge(fromEvent(window, 'online'), fromEvent(window, 'offline'))
        .pipe(debounceTime(300))
        .subscribe(() => this.ngZone.run(() => this.checkOfflineFallback()));
    });
  }
  private autoPingEvery(intervalMs: number) {
    this.ngZone.runOutsideAngular(() => {
      setInterval(() => {
        this.ngZone.run(() => this.checkOfflineFallback());
      }, intervalMs);
    });
  }


  private async checkOfflineFallback() {
    if (!navigator.onLine) {
      this._status$.next(false);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(this._checkUrl, {
        method: 'GET',
        cache: 'no-cache',
        mode: 'no-cors',
        signal
      });

      clearTimeout(timeout);

      // Analyse en fonction du type de réponse
      if (response.type === 'opaque') {
        // En ligne, mais réponse cross-origin non lisible
        this._status$.next(true);
      } else if (response.status >= 200 && response.status < 400) {
        this._status$.next(true);
      } else {
        // console.warn("Fetch terminé mais avec erreur HTTP:", response.status);
        this._status$.next(false);
      }
    } catch (err) {
      clearTimeout(timeout);
      // console.error("Erreur réseau ou timeout:", err);
      this._status$.next(false);
    }
  }

  get onlineChanges$(): Observable<boolean> {
    return this._status$.asObservable();
  }

  get isOnline(): boolean {
    return this._status$.value;
  }
}
