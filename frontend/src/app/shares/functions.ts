import { get } from 'fast-levenshtein';
import { DeviceDetectorService } from 'ngx-device-detector';

/**
 * Calcule la distance entre deux points géographiques avec la formule de Haversine.
 * @param {number} lat1 - Latitude du point 1 (en degrés)
 * @param {number} lon1 - Longitude du point 1 (en degrés)
 * @param {number} lat2 - Latitude du point 2 (en degrés)
 * @param {number} lon2 - Longitude du point 2 (en degrés)
 * @param {'km' | 'm' | 'mi'} unit - Unité de sortie : kilomètres (par défaut), mètres ou miles
 * @returns {number} Distance entre les deux points (dans l'unité choisie)
 */
// export function haversineDistance(options: { lat1: number|null, lon1: number|null, lat2: number|null, lon2: number|null }, unit: 'km' | 'metres' | 'miles' = 'km'): number {
//     const { lat1, lon1, lat2, lon2 } = options;


//     if (!lat1 || !lon1 || !lat2 || !lon2) {
//         throw new Error("Les coordonnées ne doivent pas être vide.");
//     }

//     if ([lat1, lon1, lat2, lon2].some(coord => typeof coord !== 'number' || isNaN(coord))) {
//         throw new Error("Les coordonnées doivent être des nombres valides.");
//     }

//     const toRad = (value: number) => (value * Math.PI) / 180;

//     const R_km = 6371; // Rayon de la Terre en kilomètres
//     const dLat = toRad(lat2 - lat1);
//     const dLon = toRad(lon2 - lon1);

//     const a =
//         Math.sin(dLat / 2) ** 2 +
//         Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
//         Math.sin(dLon / 2) ** 2;

//     // const a = 
//     //     Math.sin(dLat/2) * Math.sin(dLat/2) +
//     //     Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
//     //     Math.sin(dLon/2) * Math.sin(dLon/2);

//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//     let distanceKm = R_km * c;

//     switch (unit) {
//         case 'metres':
//             return distanceKm * 1000;
//         case 'miles':
//             return distanceKm * 0.621371;
//         default:
//             return distanceKm;
//     }
// }

export function getDeviceInfo(deviceService: DeviceDetectorService): { isAndroid: boolean, isIOS: boolean, isTablet: boolean, isMobile: boolean, isWindows: boolean, isMac: boolean } {
  const userAgent = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent.toLowerCase() : '';

  const os = deviceService.os.toLowerCase();
  const deviceType = deviceService.deviceType;

  const isAndroid = /android/.test(userAgent) || os === 'android';
  const isIOS = /iphone|ipad|ipod/.test(userAgent) || os === 'ios';
  const isTablet = /tablet|ipad/.test(userAgent) || deviceType === 'tablet';
  const isMobile = /mobile/.test(userAgent) || deviceType === 'mobile';
  const isWindows = /windows/.test(userAgent) || os === 'windows';
  const isMac = /macintosh|mac os/.test(userAgent) || os === 'mac';

  return { isAndroid, isIOS, isTablet, isMobile, isWindows, isMac };
}


export function isMobileUser(deviceService: DeviceDetectorService): boolean {
  const { isAndroid, isIOS, isTablet, isMobile } = getDeviceInfo(deviceService);
  return isAndroid || isIOS || isTablet || isMobile;
}



export function notNull(data: any): boolean {
  return data != '' && data != null && data != undefined && typeof data != undefined && data.length != 0; // && Object.keys(data).length != 0;
}

export function isNumber(n: any): boolean {
  return /^-?[\d.]+(?:e-?\d+)?$/.test(n);
}


export function haversineDistance(options: { lat1: number | null; lon1: number | null; lat2: number | null; lon2: number | null }, unit: 'km' | 'm' | 'mi' = 'km'): number {
  const { lat1, lon1, lat2, lon2 } = options;

  // Vérifier que les coordonnées ne sont ni null ni undefined
  if ([lat1, lon1, lat2, lon2].some(coord => coord === null || coord === undefined)) {
    throw new Error("Les coordonnées ne doivent pas être vides ou null.");
  }

  // Vérifier que les coordonnées sont des nombres valides
  if ([lat1, lon1, lat2, lon2].some(coord => typeof coord !== 'number' || isNaN(coord))) {
    throw new Error("Les coordonnées doivent être des nombres valides.");
  }

  // Vérification des limites géographiques
  if (
    lat1! < -90 || lat1! > 90 ||
    lat2! < -90 || lat2! > 90 ||
    lon1! < -180 || lon1! > 180 ||
    lon2! < -180 || lon2! > 180
  ) {
    throw new Error("Les coordonnées doivent être comprises dans les limites géographiques (lat: -90..90, lon: -180..180).");
  }

  const toRad = (value: number) => (value * Math.PI) / 180;
  const R_km = 6371; // Rayon de la Terre en km

  const dLat = toRad(lat2! - lat1!);
  const dLon = toRad(lon2! - lon1!);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1!)) * Math.cos(toRad(lat2!)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R_km * c;

  switch (unit) {
    case 'm':
      return distanceKm * 1000;
    case 'mi':
      return distanceKm * 0.621371;
    case 'km':
    default:
      return distanceKm;
  }
}



function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // suppression
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

// function similarity(a: string | string[], b: string | string[]): number {
//   const strA = Array.isArray(a) ? a.join(' ') : a;
//   const strB = Array.isArray(b) ? b.join(' ') : b;

//   const normA = strA.trim().toLowerCase();
//   const normB = strB.trim().toLowerCase();

//   const maxLen = Math.max(normA.length, normB.length);
//   if (maxLen === 0) return 1.0;

//   const distance = levenshtein(normA, normB); // ✅ ta fonction
//   return 1.0 - distance / maxLen;
// }



// let distanceKm = undefined;

// if (lat !== undefined && lng !== undefined && fsLat !== undefined && fsLng !== undefined) {
//   const R = 6371;
//   const dLat = this.deg2rad(fsLat - lat);
//   const dLng = this.deg2rad(fsLng - lng);
//   const a = Math.sin(dLat / 2) ** 2 + Math.cos(this.deg2rad(lat)) * Math.cos(this.deg2rad(fsLat)) * Math.sin(dLng / 2) ** 2;
//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//   distanceKm = R * c;
// }


export function formatDistance(meters: number) {
  const isValid = typeof meters === 'number' && !isNaN(meters) && meters >= 0;
  const safeMeters = isValid ? meters : 0;

  const kilometers = safeMeters / 1000;
  const miles = safeMeters / 1609.344;
  const feet = safeMeters * 3.28084;

  const readable =
    kilometers >= 1
      ? `${kilometers.toFixed(2)} km`
      : `${Math.round(safeMeters)} m`;

  return {
    meters: safeMeters,
    kilometers,
    miles,
    feet,
    readable,
  };
}



function similarity(a: string | string[], b: string | string[]): number {
  const strA = Array.isArray(a) ? a.join(' ') : a;
  const strB = Array.isArray(b) ? b.join(' ') : b;

  const normA = strA.trim().toLowerCase();
  const normB = strB.trim().toLowerCase();

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;

  const distance = get(normA, normB); // ✅ fast-levenshtein
  return 1.0 - distance / maxLen;
}




export function findSimilarRecords<T = any>(records: T[], nameField: string, parentField: string, threshold: number = 0.9): { a: T; b: T; reason: string }[] {

  const results: { a: T; b: T; reason: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a: any = records[i];
      const b: any = records[j];

      const sim = similarity(a[nameField], b[nameField]);

      const sameParent = a[parentField] === b[parentField];

      if (a[nameField] === b[nameField] && sameParent) {
        results.push({ a, b, reason: 'Nom et parent identiques' });
      } else if (a[nameField] === b[nameField]) {
        results.push({ a, b, reason: 'Nom identique' });
      } else if (sim >= threshold && sameParent) {
        results.push({ a, b, reason: `Nom similaire à ${(sim * 100).toFixed(1)}% et même parent` });
      } else if (sim >= threshold) {
        results.push({ a, b, reason: `Nom similaire à ${(sim * 100).toFixed(1)}%` });
      }
    }
  }

  return results;
}

