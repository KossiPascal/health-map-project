// network.service.ts
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, fromEvent, merge, Observable, of } from 'rxjs';
import { mapTo, startWith } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class NetworkService {
  private isOnline$ = new BehaviorSubject<boolean>(navigator.onLine);

  constructor(private ngZone: NgZone) {
    this.listenToNetworkChanges();
  }

  private listenToNetworkChanges(): void {
    this.ngZone.runOutsideAngular(() => {
      merge(
        fromEvent(window, 'online').pipe(mapTo(true)),
        fromEvent(window, 'offline').pipe(mapTo(false))
      )
        .pipe(startWith(navigator.onLine))
        .subscribe((status) => {
          this.ngZone.run(() => this.isOnline$.next(status));
        });
    });
  }

  /**
   * Observable que tu peux utiliser dans tes composants
   */
  get onlineChanges$(): Observable<boolean> {
    return this.isOnline$.asObservable();
  }

  /**
   * Méthode pour obtenir le statut actuel (synchrone)
   */
  get isOnline(): boolean {
    return this.isOnline$.value;
  }
}
