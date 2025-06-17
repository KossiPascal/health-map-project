import { Component, OnInit } from "@angular/core";
import { DbService } from "../../services/db.service";

@Component({
    selector: 'app-sync-status',
    template: `<span [class.text-green-500]="online" [class.text-red-500]="!online">
        ● {{ online ? 'Synchronisé' : 'Hors ligne' }}
      </span>`
  })
  export class SyncStatusComponent implements OnInit {
    online = true;
    constructor(private db: DbService) {}
  
    ngOnInit() {
      this.db.status$.subscribe(state => this.online = state == 'active');
    }
  }