import { Injectable } from '@angular/core';
// import { CookieService } from 'ngx-cookie-service';

type LocalDbName = 'local' | 'session';


@Injectable({
  providedIn: "root",
})
export class AppStorageService {

  // constructor(private coo: CookieService) { }
  constructor() { }

  get = ({ db, name }: { db: LocalDbName, name: string }): string => {
    if (db === 'local') {
      return localStorage.getItem(name) ?? '';
    } else if (db === 'session') {
      return sessionStorage.getItem(name) ?? '';
    } 
    return '';
  }

  set = ({ db, name, value }: { db: LocalDbName, name: string, value: string }) => {
    if (db === 'local') {
      sessionStorage.removeItem(name);
      // this.coo.delete(name);
      localStorage.setItem(name, value);
    } else if (db === 'session') {
      localStorage.removeItem(name);
      // this.coo.delete(name);
      sessionStorage.setItem(name, value);
    }
  }

  delete = ({ db, name }: { db: LocalDbName, name: string }) => {
    if (db === 'local') {
      localStorage.removeItem(name);
    } else if (db === 'session') {
      sessionStorage.removeItem(name);
    }
  };

  deleteSelected = ({ db, names }: { db: LocalDbName, names: string[] }) => {
    for (const name of names) {
      this.delete({db, name})
    }
  };

  deleteAll = (db: LocalDbName) => {
    if (db === 'local') {
      localStorage.clear();
    } else if (db === 'session') {
      sessionStorage.clear();
    }
  }

}
