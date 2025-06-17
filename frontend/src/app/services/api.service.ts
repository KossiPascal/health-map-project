import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DirectionsResponse } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly googleApiKey = '';

  constructor(private http: HttpClient) { }


  /** Construit l'URL vers le backend Node.js */
  apiUrl(path: string, isProduction: boolean = false): string {
    path = path.trim();

    // Assurer un préfixe /api/
    if (!path.startsWith('/api/')) {
      if (path.startsWith('api/')) {
        path = path.slice(3);
      }
      path = '/api/' + path.replace(/^\/+/, '');
    }
    // path = path.trim().replace(/^\/+/, '');
    // if (!path.startsWith('api/'))  path = 'api/' + path;

    let origin = window.location.origin;

    // Redirection automatique vers backend local si en dev
    if (window.location.port === '4200') {
      origin = `${window.location.protocol}//${window.location.hostname}:${isProduction ? 4047 : 8047}`;
    //   origin = `https://${window.location.hostname}:4047`;
    }

    return new URL(path, origin).toString();
  }

  /** Calcule la distance en mètres entre 2 points (via backend) */
  getDistance(origin: string, destination: string): Observable<{ distance: number }> {
    if (!origin || !destination) {
      return throwError(() => new Error('Origin and destination are required'));
    }

    const params = new HttpParams().set('origin', origin).set('destination', destination);

    return this.http.get<{ distance: number }>(this.apiUrl('/api/distance'), { params }).pipe(
      catchError(err => {
        console.error('[getDistance] API error', err);
        return throwError(() => err);
      })
    );
  }

  /** Appelle directement l’API Google Directions (retourne la route complète) */
  getDirections(options: { lat1: number | null; lon1: number | null; lat2: number | null; lon2: number | null }): Observable<DirectionsResponse> {
    const { lat1, lon1, lat2, lon2 } = options;

    if (![lat1, lon1, lat2, lon2].every(coord => typeof coord === 'number')) {
      return throwError(() => new Error('All coordinates must be valid numbers'));
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json`;
    const params = new HttpParams()
      .set('origin', `${lat1},${lon1}`)
      .set('destination', `${lat2},${lon2}`)
      .set('key', this.googleApiKey);

    return this.http.get<DirectionsResponse>(url, { params }).pipe(
      catchError(err => {
        console.error('[getDirections] Google API error', err);
        return throwError(() => err);
      })
    );
  }

  /** Liste toutes les unités d'organisation */
  getOrgUnits(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl('/orgunits'), { withCredentials: true });
  }

  appVersion(): Observable<any> {
    return this.http.post(this.apiUrl('/configs/version'), { noLogData: true }, { withCredentials: true })
  }

  updateDhis2Geometry(dhis2Geometry: { orgunit: string, latitude: number, longitude: number }): Observable<any> {
    return this.http.post(this.apiUrl('/update-dhis2/geometry'), { ...dhis2Geometry }, { withCredentials: true })
  }




  // getOrgUnitLevels(): Observable<any[]> {
  //   return this.http.get<any[]>(this.apiUrl('/orgunit-levels'), { withCredentials: true });
  // }

  // getASCValidity(): Observable<any[]> {
  //   return this.http.get<any[]>(this.apiUrl('/asc/validity'), { withCredentials: true });
  // }

  // getFormationsSanitaires(): Observable<any[]> {
  //   return this.http.get<any[]>(this.apiUrl('/formation-sanitaire'), { withCredentials: true });
  // }

  // createASC(asc: any): Observable<any> {
  //   return this.http.post(this.apiUrl('/asc'), asc, { withCredentials: true });
  // }

  // createFS(fs: any): Observable<any> {
  //   return this.http.post(this.apiUrl('/formation-sanitaire'), fs, { withCredentials: true });
  // }

}
