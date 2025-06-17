import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
// Résolution des dossiers
export const SRC_FOLDER = path.resolve(__dirname, '..');
export const API_FOLDER = path.resolve(SRC_FOLDER, '..');
export const PROJECT_FOLDER = path.resolve(API_FOLDER, '..');
export const PROJECT_FOLDER_PARENT = path.resolve(PROJECT_FOLDER, '..');
export const JSON_DB_PATH = path.join(API_FOLDER, 'jsonDb');

// Chargement des .env avec priorité (SRC > API > PROJECT)
const envPaths = [
    path.join(SRC_FOLDER, '.env'),
    path.join(API_FOLDER, '.env'),
    path.join(PROJECT_FOLDER, '.env'),
    path.join(PROJECT_FOLDER_PARENT, '.env')
];

for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: true, debug: true });
        // console.log(`✅ .env loaded from ${envPath}`);
    } else {
        // console.warn(`⚠️ .env file not found at ${envPath}`);
    }
}

// Extraction des variables d’environnement
const { HTTPS_PORT, HTTP_PORT, ORS_API_KEY, GOOGLE_API_KEY, JWT_SECRET, DHIS2_API_URL, COUCH_USER, COUCH_PASS, COUCH_PORT, COUCHDB_NAME, DHIS2_ADMIN_USERNAMES, USE_SECURE_PORTS, SHOW_ALL_AVAILABLE_HOST, ...restOfEnv } = process.env;

// Export centralisé
export const ENV = {
    // Autres variables .env non critiques
    ...restOfEnv,
    
    HTTPS_PORT,
    HTTP_PORT,

    USE_SECURE_PORTS: USE_SECURE_PORTS == 'true',
    SHOW_ALL_AVAILABLE_HOST: SHOW_ALL_AVAILABLE_HOST == 'true',
    // Dhis2
    DHIS2_ADMIN_USERNAMES: (DHIS2_ADMIN_USERNAMES||'').split(','),
    DHIS2_API_URL,
    // CouchDB
    COUCH_USER,
    COUCH_PASS,
    COUCH_PORT,
    COUCHDB_NAME, 
    get COUCH_URL():string {
        return `http://${this.COUCH_USER}:${this.COUCH_PASS}@localhost:${this.COUCH_PORT}`;
    },

    // Auth
    JWT_SECRET,
    GOOGLE_API_KEY,
    ORS_API_KEY
};
