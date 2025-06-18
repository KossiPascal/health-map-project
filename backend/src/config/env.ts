import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
// Résolution des dossiers
export const SRC_FOLDER = path.resolve(__dirname, '..');
export const API_FOLDER = path.resolve(SRC_FOLDER, '..');
export const PROJECT_FOLDER = path.resolve(API_FOLDER, '..');
export const PROJECT_FOLDER_PARENT = path.resolve(PROJECT_FOLDER, '..');
export const JSON_DB_PATH = path.join(API_FOLDER, 'jsonDb');


dotenv.config({ override: true });

if (process.env.NODE_ENV !== 'production' || process.env.IS_DOCKER_RUNNING !== 'true') {
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
}

const trimData = (data: any): string[] => {
    const dt: string = (data || '').trim().replaceAll(' ', '').replaceAll(';', ',');
    return dt.split(',').filter(d => d && d != '')
}

export const ENV = {
    NODE_ENV: process.env.NODE_ENV,
    HTTPS_PORT: process.env.HTTPS_PORT,
    HTTP_PORT: process.env.HTTP_PORT,
    JWT_SECRET: process.env.JWT_SECRET,

    COUCHDB_USER: process.env.COUCHDB_USER,
    COUCHDB_PASS: process.env.COUCHDB_PASS,
    COUCHDB_DB: process.env.COUCHDB_DB,
    COUCHDB_PROTOCOL: process.env.COUCHDB_PROTOCOL || 'http',

    get COUCHDB_PORT(): string | undefined {
        return process.env.IS_DOCKER_RUNNING == 'true' ? '5984' : process.env.COUCHDB_PORT;
    },
    get COUCHDB_HOST(): string {
        return process.env.IS_DOCKER_RUNNING == 'true' ? 'couchdb' : (process.env.COUCHDB_HOST || 'localhost');
    },
    get COUCHDB_URL() {
        return `${this.COUCHDB_PROTOCOL}://${this.COUCHDB_HOST}:${this.COUCHDB_PORT}`.replace(/\/$/, '');
        // return `${this.COUCHDB_PROTOCOL}://${this.COUCHDB_USER}:${this.COUCHDB_PASS}@${this.COUCHDB_HOST}:${this.COUCHDB_PORT}`;
    },

    get OSRM_HOST() {
        return process.env.IS_DOCKER_RUNNING == 'true' ? 'osrm-server' : 'localhost';
    },
    get OSRM_PORT(): string | undefined {
        return process.env.IS_DOCKER_RUNNING == 'true' ? '5000' : process.env.OSRM_PORT;
    },

    get OSRM_URL() {
        return `http://${this.OSRM_HOST}:${this.OSRM_PORT}`;
    },

    USE_SECURE_PORTS: process.env.USE_SECURE_PORTS == 'true',
    SHOW_ALL_AVAILABLE_HOST: process.env.SHOW_ALL_AVAILABLE_HOST == 'true',

    DHIS2_API_URL: process.env.DHIS2_API_URL,
    DHIS2_ADMIN_USERNAMES: trimData(process.env.DHIS2_ADMIN_USERNAMES),
    DHIS2_CAN_UPDATE_ORGUNIT_USERNAMES: trimData(process.env.DHIS2_CAN_UPDATE_ORGUNIT_USERNAMES),

    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    ORS_API_KEY: process.env.ORS_API_KEY,
};
