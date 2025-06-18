

import axios from 'axios';
import { Request, Response } from 'express';
import { ENV } from '../config/env';
import { getOSRMDistance } from '../functions';
import { ChwMap, LatLng } from '../interfaces';

const { COUCHDB_URL, COUCHDB_DB, COUCHDB_USER, COUCHDB_PASS } = ENV;

const DESIGN_ID = '_design/map_views';
const VIEW_NAME = 'by_no_distance';
const AUTH = { username: COUCHDB_USER, password: COUCHDB_PASS } as any;

async function fetchDocsNeedingUpdate():Promise<ChwMap[]> {
  const response = await axios.get(`${COUCHDB_URL}/${COUCHDB_DB}/${DESIGN_ID}/_view/${VIEW_NAME}`, {
    params: {
      include_docs: true
    },
    auth: AUTH
  });

  return (response.data.rows as any[]).map(row => row.doc);
}


export async function updateDocDistanceAndSaveDocs() {
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
            const distance = await getOSRMDistance([orgLat,  orgLng], [destLat,  destLng], 'driving');
            const meters = distance?.distance?.meters;

            if (typeof meters === 'number' && meters > 0) {
              return {
                ...doc,
                distanceToFacility: meters,
                updatedByServerAt: new Date().toISOString(),
              };
            }
          } catch (err:any) {
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
  } catch (error:any) {
    console.error('❌ Erreur globale updateDocDistanceAndSaveDocs:', error.message);
  }
}



// const updateChwVillageDistance = async (docs:any[]) => {
//   try {

//     if (!Array.isArray(docs)) {
//       return false;
//     }

//     // 🔁 Pour chaque doc, enrichir avec le dernier élément
//     const enrichedDocs = await Promise.all(docs.map(async (doc) => {
//       if (!doc.type || !doc.createdAt) return doc;

//       // ⚠️ Appel à la vue pour récupérer le dernier doc
//       const response = await axios.get(`${COUCHDB_URL}/${req.params.db}/_design/by_createdAt/_view/last_doc`, {
//         params: {
//           startkey: JSON.stringify([doc.type, {}]),
//           endkey: JSON.stringify([doc.type, null]),
//           descending: true,
//           limit: 1
//         },
//         auth: {
//           username: COUCHDB_USER,
//           password: COUCHDB_PASS
//         }
//       });

//       const last = response.data.rows[0]?.value;

//       // 💡 Exemple de calcul basé sur l'historique
//       const evolution = last && last.valeur != null && doc.valeur != null
//         ? doc.valeur - last.valeur
//         : null;

//       return {
//         ...doc,
//         evolution,
//         calculatedAt: new Date().toISOString()
//       };
//     }));

//     // ✅ Envoi à CouchDB
//     const final = await axios.post(
//       `${COUCHDB_URL}/${req.params.db}/_bulk_docs`,
//       { ...body, docs: enrichedDocs },
//       {
//         auth: {
//           username: COUCHDB_USER,
//           password: COUCHDB_PASS
//         },
//         headers: { 'Content-Type': 'application/json' }
//       }
//     );

//     res.status(200).json(final.data);

//   } catch (err) {
//     console.error("Erreur dans enrichissement _bulk_docs:", err);
//     res.status(500).json({ error: "Erreur serveur enrichissement" });
//   }
// });













































// import express, { Request, Response, NextFunction } from 'express';
// import { createProxyMiddleware } from 'http-proxy-middleware';
// import getRawBody from 'raw-body';
// import http from 'http';
// import { ENV } from '../config/env';

// const router = express.Router();
// const { COUCHDB_URL, COUCHDB_USER, COUCHDB_PASS } = ENV;




// export const customBulkDocsMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
//   try {
//     // const raw = getRawBody(req);
//     // const body = JSON.parse(raw.toString());

//     const body = req.body

//      console.log(req)

//     if (!Array.isArray(body.docs)) {
//       return res.status(400).json({ error: 'Missing docs array' });
//     }

//     // 🧠 Ton calcul serveur ici :
//     const transformed = (body.docs as any[]).map(doc => {
//       const poids = doc.poids || 0;
//       const taille = doc.taille || 1;
//       const imc = poids / ((taille / 100) ** 2);

//       return {
//         ...doc,
//         imc: parseFloat(imc.toFixed(2)),
//         source: 'mobile',
//         serverReceivedAt: new Date().toISOString()
//       };
//     });

//     // 📤 Réenvoi vers CouchDB avec les docs modifiés
//     const proxyReq = http.request(
//       `${COUCHDB_URL}/${req.params.db}/_bulk_docs`,
//       {
//         method: 'POST',
//         headers: {
//           'Authorization': 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64'),
//           'Content-Type': 'application/json',
//           'Content-Length': Buffer.byteLength(JSON.stringify({ ...body, docs: transformed }))
//         }
//       },
//       proxyRes => {
//         proxyRes.pipe(res);
//         res.statusCode = proxyRes.statusCode || 200;
//       }
//     );

//     proxyReq.write(JSON.stringify({ ...body, docs: transformed }));
//     proxyReq.end();
//   } catch (err) {
//     console.error('❌ Erreur bulk_docs interception:', err);
//     res.status(500).json({ error: 'Erreur interne _bulk_docs' });
//   }
// };




















            // const typedReq = req as IncomingMessage & { body?: any, query?: any, params?: any };

            // console.log(typedReq.body ?? typedReq.query ?? typedReq.params)
            // // Interception spécifique pour _bulk_docs
            // // Ne gérer que _bulk_docs
            // if (req.method === 'POST' && req.url === '/_bulk_docs' && typedReq.body?.docs) {
            //     const modifiedDocs = (typedReq.body.docs as any[]).map(doc => ({
            //         ...doc,
            //         serverReceivedAt: new Date().toISOString(),
            //         source: 'mobile',
            //     }));

            //     const bodyString = JSON.stringify({ ...typedReq.body, docs: modifiedDocs });

            //     // Remplacer le body


            //     proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyString));

            //     // Très important : écrire manuellement dans le flux
            //     proxyReq.write(bodyString);
            //     proxyReq.end();
            // }

               


            // // Intercepter uniquement _bulk_docs POST
            // if (
            //     req.method === 'POST' &&
            //     req.url?.endsWith('/_bulk_docs') &&
            //     req.headers['content-type']?.includes('application/json')
            // ) {
            //     try {
            //         const rawBody = await getRawBody(req);
            //         const body = JSON.parse(rawBody.toString());

            //         if (body.docs && Array.isArray(body.docs)) {
            //             const modifiedDocs = body.docs.map((doc: any) => ({
            //                 ...doc,
            //                 source: 'mobile',
            //                 serverReceivedAt: new Date().toISOString(),
            //             }));

            //             const newBody = JSON.stringify({ ...body, docs: modifiedDocs });

            //             proxyReq.setHeader('Content-Type', 'application/json');
            //             proxyReq.setHeader('Content-Length', Buffer.byteLength(newBody));
            //             proxyReq.write(newBody);
            //             proxyReq.end();
            //         }
            //     } catch (err) {
            //         console.error('❌ Erreur lecture/modification _bulk_docs:', err);
            //     }
            // }

            // ➕ Transmettre le cookie (si session)
            //   const cookie = req.headers['cookie'];
            //   if (cookie) {
            //     console.log('ZZZZZZZZZZZZZZZZZZZZZ')
            //     console.log(cookie)
            //     proxyReq.setHeader('cookie', cookie);
            //   }

            //   // ➕ Transmettre le header Authorization (si token JWT)
            //   const auth = req.headers['authorization'];
            //   if (auth) {
            //     console.log('AUTHENNNNNNN')
            //     console.log(auth)
            //     proxyReq.setHeader('authorization', auth);
            //   }














        // Rewrite only /api/create-db/:dbName
        // if (path.startsWith('/api/db/create-db/') || path.startsWith('/api/create-db/') || path.startsWith('/create-db/')) {
        //     let dbName = path.replace('/api/db/create-db/', '');
        //     dbName = dbName.replace('/api/create-db/', '');
        //     dbName = dbName.replace('/create-db/', '');
        //     return `/${dbName}`;
        // }

        // if (path.startsWith('/api/db/docs/') || path.startsWith('/api/docs/') || path.startsWith('/docs/')) {
        //     // Strip /api/db/docs prefix
        //     let docPath = path.replace('/api/db/docs/', '');
        //     docPath = docPath.replace('/api/docs/', '');
        //     docPath = docPath.replace('/docs/', '');
        //     return `/${docPath}`;
        // }

        // // Rewrite for accessing existing DBs
        // if (path.startsWith(`/docs/${COUCHDB_DB}`)) {
        //     // return`/${COUCHDB_DB}${path.slice(`/docs/${COUCHDB_DB}`.length)}`;
        //     // // return pathName;
        //     // console.log(path)
        //     return `/${COUCHDB_DB}`;
        // }

        // if (path.startsWith(`/docs/${COUCHDB_DB}`)) {
        //     // return`/${COUCHDB_DB}${path.slice(`/docs/${COUCHDB_DB}`.length)}`;
        //     // // return pathName
        //     return `/${COUCHDB_DB}`;
        // }








// {
//     "_id": "_design/filters",
//     "filters": {
//       "by_owner": "function(doc, req) { return doc.owner === req.query.owner; }"
//     }
//   }