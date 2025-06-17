// Haversine formula pour distance entre 2 points lat/lng en km
export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371; // rayon Terre en km
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Utils
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => x * Math.PI / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// Fonction qui détermine validité ASC selon FS + distance max 5 km
export function 
getValidity(asc: any, fs: any) {
  if (!fs || !fs.location) {
    return { valid: false, reason: "Formation sanitaire non trouvée" };
  }
  const dist = getDistanceKm(asc.location.lat, asc.location.lng, fs.location.lat, fs.location.lng);
  if (dist <= 5) return { valid: true, reason: "OK", distance: dist };
  return { valid: false, reason: "Trop éloigné (> 5 km)", distance: dist };
}
