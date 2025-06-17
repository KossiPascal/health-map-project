// src/typings/leaflet-gpx.d.ts
import * as L from 'leaflet';

declare module 'leaflet' {
  export class GPX extends L.FeatureGroup {
    constructor(gpx: string, options?: any);
  }
}
