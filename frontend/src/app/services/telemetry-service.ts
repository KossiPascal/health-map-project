import { Injectable } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  getTelemetry(): Record<string, string> {
    return {
      deviceId: this.getDeviceId(),
      userAgent: navigator.userAgent,
      language: navigator.language,
      syncInitiatedAt: new Date().toISOString(),
      appVersion: '1.0.0' // injecte dynamiquement si besoin
    };
  }

  private getDeviceId(): string {
    // Exemple : fingerprint ou localStorage
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('deviceId', id);
    }
    return id;
  }

  async enrichLocalDocsBeforeSync(db: PouchDB.Database, telemetry: Record<string, any>) {
  const all = await db.allDocs({ include_docs: true });
  const updated = all.rows
    .filter(row => row.doc && !(row.doc as any)._deleted)
    .map(row => {
      const doc = row.doc!;
      return {
        ...doc,
        telemetry,
        lastModifiedLocally: new Date().toISOString()
      };
    });

  // Bulk update
  await db.bulkDocs(updated);
}

async startSync(localDB: PouchDB.Database, telemetryService: TelemetryService) {
  const telemetry = telemetryService.getTelemetry();

  await this.enrichLocalDocsBeforeSync(localDB, telemetry);

  return PouchDB.sync(localDB, 'http://localhost:3003/mydb', {
    live: true,
    retry: true
  });
}


}
