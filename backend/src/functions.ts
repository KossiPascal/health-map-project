import axios, { AxiosError } from 'axios';
import { ENV } from './config/env';
import jwt from "jsonwebtoken";
import { LatLng, ORSProfile, DistanceResult, OSRMProfile } from './interfaces';
import path from 'path';

const { OSRM_URL, GOOGLE_API_KEY, ORS_API_KEY, JWT_SECRET, COUCHDB_USER, COUCHDB_PASS, COUCHDB_URL } = ENV;


// // Auth Header
// const authHeader = {
//     Authorization: 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64'),
// };
// export async function ensureDatabaseExists(dbName: string, force = false): Promise<boolean> {
//     // if (!/^[a-z][a-z0-9_$()+/-]*$/.test(dbName)) {
//     //     console.error(`❌ Nom de base invalide: "${dbName}"`);
//     //     return false;
//     // }

//     const dbUrl = `${COUCHDB_URL}/${dbName}`;
//     console.log(dbUrl)

//     try {
//         const response = await axios.head(dbUrl, { headers: authHeader });

//         if (response.status === 200 && !force) {
//             console.log(`✅ La base "${dbName}" existe déjà.`);
//             return true;
//         }

//         if (force) {
//             console.log(`⚠️ Recréation non-destructive de "${dbName}"...`);
//             // CouchDB ne supporte pas une recréation sans suppression, donc on skippe
//             return true;
//         }

//     } catch (error: any) {
//         const axiosErr = error as AxiosError;

//         if (axiosErr.response?.status === 404) {
//             // Base inexistante, création
//             try {
//                 await axios.put(dbUrl, {}, { headers: authHeader });
//                 console.log(`🆕 Base "${dbName}" créée avec succès.`);
//                 return true;
//             } catch (creationError: any) {
//                 console.error(`❌ Erreur création "${dbName}":`, creationError.message);
//                 return false;
//             }
//         }

//         console.error(`❌ Erreur accès "${dbName}":`, axiosErr.message);
//         return false;
//     }

//     return false;
// }

/**
 * Vérifie si la base CouchDB existe, et la crée si elle est absente
 */
export async function ensureDatabaseExists(dbName: string): Promise<boolean> {
    if (!COUCHDB_URL || !COUCHDB_USER || !COUCHDB_PASS) {
        console.error(`❌ You must set ENV varialble: COUCHDB_URL, COUCHDB_USER, COUCHDB_PASS `);
        return false;
    }


    const dbUrl = `${COUCHDB_URL}/${dbName}`;
    console.log(dbUrl)

    try {
        // 🟡 Vérifie si la base existe via HEAD
        await axios.head(dbUrl, {
            auth: {
                username: COUCHDB_USER,
                password: COUCHDB_PASS,
            },
        });
        // console.log(`✅ La base "${dbName}" existe déjà.`);
        return true;
    } catch (error: any) {
        if (error.response?.status === 404) {
            // 🔵 Base inexistante → création
            try {
                await axios.put(dbUrl, {}, {
                    auth: {
                        username: COUCHDB_USER,
                        password: COUCHDB_PASS,
                    },
                });
                // console.log(`🆕 Base "${dbName}" créée avec succès.`);
                return true;
            } catch (creationError: any) {
                console.error(`❌ Erreur création de "${dbName}":`, creationError?.message || creationError);
                return false;
            }
        } else {
            console.error(`❌ Erreur vérification "${dbName}":`, error?.message || error);
            return false;
        }
    }
}


export function appVersion(): { service_worker_version: number | null, app_version: string | null } {
    var service_worker_version = null;
    var app_version = null;
    try {
        service_worker_version = require('../../views/ngsw.json')?.timestamp;
        app_version = require('../package.json')?.version;
    } catch (error) { }

    return {
        service_worker_version,
        app_version: app_version
    };
}


export function extractBasicAuthFromToken(token: string): string | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET!) as { basicAuth?: string };

        if (!decoded || !decoded.basicAuth) {
            console.warn("Token valide mais 'basicAuth' manquant.");
            return null;
        }

        return decoded.basicAuth;
    } catch (err) {

        try {
            const decoded = Buffer.from(token, 'base64').toString('utf-8');
            if (!decoded.includes(':')) return null;
            return Buffer.from(decoded).toString('base64'); // Basic Auth
        } catch {
            console.error('❌ Erreur de vérification du token JWT :', err);
            return null;
        }
    }
}


function formatDistance(meters: number) {
    return {
        meters,
        kilometers: meters / 1000,
        miles: meters / 1609.344,
        feet: meters * 3.28084,
        readable: `${(meters / 1000).toFixed(2)} km`
    };
}

function formatDuration(seconds: number) {
    const minutes = Math.round(seconds / 60); //seconds / 60
    const hours = Math.floor(minutes / 60); //seconds / 3600
    const remainingMinutes = minutes % 60;
    return {
        seconds,
        minutes,
        hours,
        readable: hours > 0 ? `${hours}h ${remainingMinutes}min` : `${minutes} min`
    };
}


export async function getDistanceInMeters(origin: LatLng, destination: LatLng): Promise<number> {

    if (!GOOGLE_API_KEY) {
        throw new Error('Google API Key manquante. Vérifiez votre fichier .env');
    }


    const [origLng, origLat] = origin;
    const [destLng, destLat] = destination;

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
    const params = {
        origins: `${origLat},${origLng}`,
        destinations: `${destLat},${destLng}`,
        key: GOOGLE_API_KEY,
        mode: 'driving', // ou 'walking', 'bicycling'
    };

    try {
        const res = await axios.get(url, { params });
        const data = res.data;

        if (data.rows[0]?.elements[0]?.status === 'OK') {
            const distance = data.rows[0].elements[0].distance.value; // en mètres
            return distance;
        } else {
            throw new Error('Impossible de calculer la distance : ' + data.rows[0].elements[0]?.status);
        }
    } catch (err: any) {
        console.error('[Google Distance API] Error:', err.message || err);
        throw new Error('Erreur lors du calcul de la distance');
    }
}


function toLngLat(coord: LatLng): LatLng {
    return [coord[1], coord[0]];
}

function toLatLngMap(coord: LatLng): { lat: number, lng: number } {
    return { lat: coord[0], lng: coord[1] };
}

// et l’utiliser :



export async function getORSRoute(origin: LatLng, destination: LatLng, profile: ORSProfile = 'driving-car'): Promise<DistanceResult> {
    try {
        const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;

        const headers = {
            Authorization: ORS_API_KEY,
            'Content-Type': 'application/json'
        };

        const body = {
            coordinates: [toLngLat(origin), toLngLat(destination)]
        };

        const response = await axios.post(url, body, { headers });

        const route = response.data.features[0].properties.summary;

        return {
            profile,
            origin: toLatLngMap(origin),
            destination: toLatLngMap(destination),
            distance: formatDistance(route.distance),
            duration: formatDuration(route.duration)
        };

    } catch (error: any) {
        // console.error(`Erreur ORS (${profile})`, error?.response?.status, error?.message);
        return {
            profile,
            origin: toLatLngMap([0, 0]),
            destination: toLatLngMap([0, 0]),
            distance: formatDistance(0),
            duration: formatDuration(0)
        };
        // throw new Error(`Erreur ORS (${profile}) | ${error?.response?.status} | ${error?.message}`)
    }
}


// curl -X POST https://api.openrouteservice.org/v2/directions/driving-car/geojson \
//   -H "Authorization: YOUR_API_KEY" \
//   -H "Content-Type: application/json" \
//   -d '{"coordinates":[[0.7797, 9.2642],[1.25278, 6.13875]]}'

export async function getORSRoutesAllProfiles(origin: LatLng, destination: LatLng): Promise<DistanceResult[]> {
    const profiles: ORSProfile[] = ['driving-car', 'cycling-regular', 'foot-walking'];

    const results = await Promise.all(
        profiles.map(async (profile) => getORSRoute(origin, destination, profile))
    );

    return results;
}





export async function getOSRMDistance(origin: LatLng, destination: LatLng, profile: OSRMProfile = 'driving'): Promise<DistanceResult> {
    try {
        const [lat1, lng1] = origin;
        const [lat2, lng2] = destination;

        const url = `${OSRM_URL}/route/v1/${profile}/${lng1},${lat1};${lng2},${lat2}?overview=false`;

        const response = await axios.get(url);
        const route = response.data?.routes?.[0];

        if (!route) {
            console.warn('Aucune route trouvée.');
            return {
                profile,
                origin: toLatLngMap([0, 0]),
                destination: toLatLngMap([0, 0]),
                distance: formatDistance(0),
                duration: formatDuration(0)
            };
        }

        return {
            profile,
            origin: toLatLngMap(origin),
            destination: toLatLngMap(destination),
            distance: formatDistance(route.distance),
            duration: formatDuration(route.duration)
        };
    } catch (error) {
        // console.error('Erreur OSRM:', error);
        return {
            profile,
            origin: toLatLngMap([0, 0]),
            destination: toLatLngMap([0, 0]),
            distance: formatDistance(0),
            duration: formatDuration(0)
        };
    }
}




export async function getOSRMDistanceAllProfile(origin: LatLng, destination: LatLng): Promise<DistanceResult[]> {
    const profiles: OSRMProfile[] = ['driving', 'cycling', 'walking'];

    const results = await Promise.all(
        profiles.map(async (profile) => getOSRMDistance(origin, destination, profile))
    );

    return results;
}

function calculateDistanceToFacility(doc: any): number {
    // ⚠️ Exemple fictif, à adapter avec vrai calcul (OSRM, Haversine, etc.)
    if (!doc.gps || !doc.facilityGps) return 0;

    const [lat1, lon1] = doc.gps;
    const [lat2, lon2] = doc.facilityGps;

    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 1000); // en mètres
}
