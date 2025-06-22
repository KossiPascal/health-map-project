import nano, { DatabaseAuthResponse, DocumentScope, ServerScope } from 'nano';
import axios from 'axios';
import { ENV } from '../config/env';
import { getOSRMDistance } from '../functions';
import { ChwMap } from '../interfaces';


// 🧩 Configuration
const { FULL_COUCHDB_URL, COUCHDB_URL, COUCHDB_DB, COUCHDB_USER, COUCHDB_PASS, COUCHDB_MEMBER_USER, COUCHDB_MEMBER_PASS } = ENV;

const DESIGN_ID = '_design/map-client';
const VIEW_NAME = 'by_no_distance';
const AUTH = { username: COUCHDB_USER, password: COUCHDB_PASS } as any;
// 🧠 Connexion CouchDB
const couch: ServerScope = nano(FULL_COUCHDB_URL);
const mainDB: DocumentScope<any> = couch.use(COUCHDB_DB!);
const usersDB: DocumentScope<any> = couch.use('_users');


const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;

async function fetchDocsNeedingUpdate(): Promise<ChwMap[]> {
  const response = await axios.get(`${COUCHDB_URL}/${COUCHDB_DB}/${DESIGN_ID}/_view/${VIEW_NAME}`, {
    params: {
      include_docs: true
    },
    auth: AUTH
  });

  return (response.data.rows as any[]).map(row => row.doc);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


const retryWrapper = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status || err?.statusCode;
      const retryable = [500, 502, 503, 504];
      if (!retryable.includes(status)) {
        console.error(`[retryWrapper] Erreur non-retryable (status: ${status}). Abandon.`);
        break;
      }
      const delay = 500 * (i + 1); // backoff linéaire
      console.warn(`[retryWrapper] Tentative ${i + 1} échouée, nouvelle tentative dans ${delay}ms...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastError;
}

const ensureDatabaseExists = async (dbName: string = COUCHDB_DB!): Promise<boolean> => {

  try {
    return await retryWrapper(async () => {
      try {
        await couch.db.get(dbName);
        // console.log(`✅ La base "${dbName}" existe déjà.`);
        return true;
      } catch (err: any) {
        if (err?.statusCode === 404) {
          await couch.db.create(dbName);
          // console.log(`📁 Base "${dbName}" créée.`);
          return true;
        } else {
          console.error(`❌ Erreur lors de l'accès à "${dbName}":`, err?.message ?? err);
          throw err;
        }
      }
    });
  } catch (finalError) {
    console.error(`🛑 Échec final lors de l'accès ou création de "${dbName}" après plusieurs tentatives :`, finalError);
    return false;
  }
}

const isDatabaseExists = async (dbName: string): Promise<boolean> => {
  try {
    return await retryWrapper(async () => {
      const dbs = await couch.db.list();
      return dbs.includes(dbName);
    });
  } catch (err: any) {
    // log.error({ err }, `[isDatabaseExists] Erreur lors de la vérification de ${dbName}`);
    // Cas où la base n'existe pas (404)
    if (err?.response?.status === 404 || err?.statusCode === 404 || err?.status === 404) {
      console.info(`[isDatabaseExists] (404) La base de donnée '${dbName}' n'existe pas`);
      return false;
    }
    // Cas d'erreur d'authentification (401)
    if (err?.response?.status === 401 || err?.statusCode === 401 || err?.status === 401) {
      throw new Error(`[isDatabaseExists] Accès non autorisé à la base ${dbName} (401 Unauthorized). Vérifiez les identifiants ou les droits.`);
    }
    // Autres erreurs
    throw new Error(
      `[isDatabaseExists] Erreur lors de la vérification de la base ${dbName} (${err?.response?.status ?? err?.statusCode ?? err?.status ?? "inconnue"})`
    );
  }
}

const updateDocDistanceAndSaveDocs = async () => {
  try {
    const docs = await fetchDocsNeedingUpdate();

    if (!docs || docs.length === 0) return;

    const updatedDocs = (
      await Promise.all(
        docs.map(async (doc) => {
          const orgLat = doc.healthCenter?.location?.lat;
          const orgLng = doc.healthCenter?.location?.lng;
          const destLat = doc.location?.lat;
          const destLng = doc.location?.lng;

          if (!orgLat || !orgLng || !destLat || !destLng) {
            return undefined;
          }

          try {
            const distance = await getOSRMDistance([orgLat, orgLng], [destLat, destLng], 'driving');
            const meters = distance?.distance?.meters;

            if (typeof meters === 'number' && meters > 0) {
              return {
                ...doc,
                distanceToFacility: meters,
                updatedByServerAt: new Date().toISOString(),
              };
            }
          } catch (err: any) {
            console.warn(`⚠️ Erreur de calcul de distance pour doc ${doc._id}`, err.message);
          }

          return undefined; // Skip doc if distance invalid
        })
      )
    ).filter((doc) => !!doc); // Filter undefined and type-safe

    if (updatedDocs.length === 0) {
      // console.log('🚫 Aucun document mis à jour');
      return;
    }

    const bulkResponse = await axios.post(`${COUCHDB_URL}/${COUCHDB_DB}/_bulk_docs`, { docs: updatedDocs }, { auth: AUTH });

    // console.log(`✅ ${updatedDocs.length} documents mis à jour`, bulkResponse.data);
    console.log(`✅ ${updatedDocs.length} documents mis à jour`);
  } catch (error: any) {
    console.error('❌ Erreur globale updateDocDistanceAndSaveDocs:', error.message);
  }
}

const filtersDesigns = () => {
  return {
    _id: '_design/filters',
    language: "javascript",
    filters: {
      by_owner: `
        function (doc, req) {
          if (doc._deleted) return true;
          if (!doc.owner || !req.query.owner) return false;
          return doc.owner.toString() === req.query.owner.toString();
        }
      `
    }
  };
}

const viewsDesigns = () => {
  const condition = `doc.type === 'chw-map' || doc.type === 'fs-map'`;

  return {
    _id: '_design/map-client',
    language: "javascript",
    views: {
      by_owner: {
        map: `
          function (doc) {
            if ((${condition}) && doc.owner) {
              emit(doc.owner, doc._id);
            }
          }
        `
      },
      by_type: {
        map: `
          function (doc) {
            if (${condition}) {
              emit(doc.type, doc._id);
            }
          }
        `
      },
      by_type_and_parent: {
        map: `
          function (doc) {
            if (doc.type === 'chw-map' && doc.healthCenterId) {
              emit([doc.type, doc.healthCenterId], doc._id);
            }
          }
        `
      },
      by_type_and_parent_and_owner: {
        map: `
          function (doc) {
            if (doc.type === 'chw-map' && doc.healthCenterId && doc.owner) {
              emit([doc.type, doc.healthCenterId, doc.owner], doc._id);
            }
          }
        `
      },
      by_parent: {
        map: `
          function (doc) {
            if (doc.type === 'chw-map' && doc.healthCenterId) {
              emit(doc.healthCenterId, doc._id);
            }
          }
        `
      },
      by_type_and_owner: {
        map: `
          function (doc) {
            if ((${condition}) && doc.owner) {
              emit([doc.type, doc.owner], doc._id);
            }
          }
        `
      },
      by_parent_and_owner: {
        map: `
          function (doc) {
            if (doc.type === 'chw-map' && doc.healthCenterId && doc.owner) {
              emit([doc.healthCenterId, doc.owner], doc._id);
            }
          }
        `
      },
      by_no_distance: {
        map: `
          function (doc) {
            if (doc.type === 'chw-map' && (!doc.distanceToFacility || doc.distanceToFacility === 0)) {
              emit(doc._id, doc.distanceToFacility);
            }
          }
        `
      },
      last_doc: {
        map: `
          function (doc) {
            if (doc.type && doc.createdAt) {
              emit([doc.type, doc.createdAt], doc);
            }
          }
        `
      }
    }
  };
}

const createOrUpsertDesignDocument = async (retries = 3, delay = 1000) => {
  const filterDesign = filtersDesigns();
  const viewDesign = viewsDesigns();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const updateDesign = async (design: any, type: 'view' | 'filter') => {
        try {
          const existing = await COUCH.db.get(design._id);
          const updated = {
            ...existing,
            language: "javascript",
          };

          if (type === 'view') {
            updated.views = { ...existing.views, ...design.views };
          } else if (type === 'filter') {
            updated.filters = { ...existing.filters, ...design.filters };
          }

          const response = await COUCH.db.insert(updated);
          console.log(`✅ Design document "${design._id}" mis à jour :`, response);
        } catch (e: any) {
          if (e.statusCode === 404 || e.status === 404) {
            const response = await COUCH.db.insert({ ...design, language: "javascript" });
            console.log(`📁 Design document "${design._id}" créé :`, response);
          } else {
            console.error(`❌ Erreur lors de la création/mise à jour du design "${design._id}" :`, e.message || e);
            throw e;
          }
        }
      };

      await updateDesign(filterDesign, 'filter');
      await updateDesign(viewDesign, 'view');

    } catch (err: any) {
      // console.warn(`⚠️ Tentative ${attempt + 1} échouée :`, err.message || err);
      // console.error('❌ Erreur lors du upsert du design document :', err);
      if (err.statusCode === 409) console.warn('⚠️ Conflit lors de la mise à jour du design document.');
      if (attempt === retries) throw new Error(`[FILTER SYNC] Failed after ${retries + 1} attempts: ${err}`);
      await new Promise(resolve => setTimeout(resolve, delay * 2 ** attempt));
    }
  }
}

const queryView = async () => {
  try {
    const result = await COUCH.db.view('users', 'by_role', { key: 'admin' });
    console.log('📄 Résultats de la vue :', result.rows);
  } catch (err) {
    console.error('❌ Échec de la requête de vue :', err);
  }
}

const checkOrCreateCouchDbUserWithSecurity = async () => {
  if (!COUCHDB_MEMBER_USER || !COUCHDB_MEMBER_PASS) {
    console.log("You must set en Env file: 'COUCHDB_MEMBER_USER' and 'COUCHDB_MEMBER_PASS'")
    return;
  }
  const username = COUCHDB_MEMBER_USER;
  const password = COUCHDB_MEMBER_PASS

  const userId = `org.couchdb.user:${username}`;
  const dbUsers = couch.use('_users');

  const userDoc = {
    _id: userId,
    name: username,
    password: password,
    fullname: 'Utilisateur Map',
    roles: [],
    type: 'user',
  };

  // Vérifie si l'utilisateur existe
  let userExists = false;
  try {
    await dbUsers.get(userId);
    console.log(`👤 Utilisateur déjà existant : ${userId}`);
    userExists = true;
  } catch (err: any) {
    if (err.statusCode === 404) {
      userExists = false;
    } else {
      console.error('❌ Erreur lors de la vérification utilisateur:', err.message);
      throw err;
    }
  }

  // Si l'utilisateur n'existe pas, le créer
  if (!userExists) {
    let created = false;
    for (let attempt = 1; attempt <= MAX_RETRIES && !created; attempt++) {
      try {
        const res = await dbUsers.insert(userDoc);
        console.log(`✅ Utilisateur créé : ${res.id}`);
        created = true;
      } catch (err: any) {
        console.warn(`⏳ Tentative ${attempt}/${MAX_RETRIES} - Échec création utilisateur :`, err.message);
        if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
        else throw new Error(`❌ Impossible de créer l'utilisateur ${username}`);
      }
    }
  }

  // Appliquer le _security sur la base cible
  const securityDoc = {
    admins: { names: [username], roles: [] },
    members: { names: [username], roles: [] },
  };

  let secured = false;
  for (let attempt = 1; attempt <= MAX_RETRIES && !secured; attempt++) {
    try {
      await couch.request({
        method: 'PUT',
        db: COUCHDB_DB,
        path: '_security',
        body: securityDoc,
      });
      console.log(`🔐 Sécurité appliquée sur la base '${COUCHDB_DB}' pour ${username}`);
      secured = true;
    } catch (err: any) {
      console.warn(`⚠️ Tentative ${attempt}/${MAX_RETRIES} - Erreur sécurité : ${err.message}`);
      if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
      else throw new Error(`❌ Impossible d’appliquer la sécurité pour ${username} sur ${COUCHDB_DB}`);
    }
  }
};

async function couchdbUserSession(username: string, password: string): Promise<any> {
  try {
    const session = await couch.auth(username, password);
    return session; // { ok: true, name: 'john', roles: [...] }
  } catch (err: any) {
    // throw new Error(err.reason || 'Login failed');
    return null;
  }
}

async function memberUsersSession(): Promise<DatabaseAuthResponse|null> {
  if (!COUCHDB_MEMBER_USER || !COUCHDB_MEMBER_PASS) {
    return null;
  }
  try {
    const session = await couch.auth(COUCHDB_MEMBER_USER, COUCHDB_MEMBER_PASS);
    return session; // { ok: true, name: 'john', roles: [...] }
  } catch (err: any) {
    console.log(err)
    // throw new Error(err.reason || 'Login failed');
    return null;
  }
}


// 🔗 Exports unifiés
export const COUCH = {
  nano: couch,
  db: mainDB,
  usersDB,
  memberUsersSession,
  couchdbUserSession,
  ensureDatabaseExists,
  retryWrapper,
  isDatabaseExists,
  updateDocDistanceAndSaveDocs,
  createOrUpsertDesignDocument,
  checkOrCreateCouchDbUserWithSecurity,
  queryView
};
