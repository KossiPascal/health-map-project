import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import os from "os";
import https from "https";
import http from "http";
import axios from "axios";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import configsRouter from "./routes/config";
import helmet from 'helmet';
import bearerToken from 'express-bearer-token';
import path from 'path';
import bodyParser from 'body-parser';
import cron from 'node-cron';
import session from 'express-session';
import responseTime from "response-time";
import compression from "compression";

import { ENV } from "./config/env";
import { extractBasicAuthFromToken, getOSRMDistanceAllProfile } from "./functions";
import { Errors } from "./routes/error";
import { PROJECT_FOLDER, SRC_FOLDER } from "./config/env";
import { couchdbProxy, osrmProxy } from "./middlewares/proxy.middleware";
import { COUCH } from "./utils/db-utils";


const { NODE_ENV, DHIS2_API_URL, HTTPS_PORT, HTTP_PORT, USE_SECURE_PORTS, SHOW_ALL_AVAILABLE_HOST } = ENV;


const SECURE_PORT = parseInt(HTTPS_PORT || "4047");
const UNSECURE_PORT = parseInt(HTTP_PORT || "8047");
// 🟢 Création du serveur HTTPS
const HOST = SHOW_ALL_AVAILABLE_HOST ? '0.0.0.0' : 'localhost';
const PORT = USE_SECURE_PORTS ? SECURE_PORT : UNSECURE_PORT;
const PROTOCOL = USE_SECURE_PORTS ? 'https' : 'http';
// 🌐 CORS
const allowedOrigins: string[] = [];


const app = express();

app.enable("trust proxy");
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('json spaces', 2);
app.set('content-type', 'application/json; charset=utf-8');

// 🌐 HTTPS Redirection Middleware
app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (USE_SECURE_PORTS && !req.secure && req.headers.host) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// ✅ Sécurité + Analyse
if (NODE_ENV !== 'production') {
  app.use(cors({
    origin: (origin: any, callback: any) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn("❌ Origin non autorisée par CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  }));

  // 🔄 Middleware CORS simple pour dev
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    next();
  });
} else {
  app.use(cors({ credentials: true }));
}

// 🔐 Middlewares
app.use(session({
  secret: 'session',
  cookie: {
    secure: USE_SECURE_PORTS,
    maxAge: 60000
  },
  saveUninitialized: true,
  resave: true
}))

app.use(helmet({ contentSecurityPolicy: false }));
app.use(responseTime());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(bearerToken());
app.use(bodyParser.json());
app.use(cookieParser());


// ➕ API Routes
app.use("/api/auth", authRoutes);

app.use('/api/configs', configsRouter);

// app.use('/api/db',
//   (req, res, next) => {
//     const token = req.cookies?.TogoMapToken;

//     const rawToken = getCookieValue(req.headers.cookie, 'TogoMapToken');

//     if (!token) return res.status(401).json({ error: 'Token manquant.' });
//     try {
//       const decoded = jwt.verify(token, JWT_SECRET!);
//       (req as any).user = decoded;
//       next();
//     } catch (err) {
//       return res.status(403).json({ error: 'Token invalide ou expiré.' });
//     }
//   },
//   couchdbProxy);



// 🔁 Met à jour la géométrie (latitude/longitude) d'une unité dans DHIS2
app.post('/api/update-dhis2/geometry', async (req, res) => {
  try {
    const { orgunit, latitude, longitude } = req.body;

    // 🔒 Validation stricte des entrées
    if (
      typeof orgunit !== 'string' ||
      !orgunit.trim() ||
      !Number.isFinite(parseFloat(latitude)) ||
      !Number.isFinite(parseFloat(longitude))
    ) {
      return res.status(400).json({
        error: 'Paramètres invalides. Veuillez fournir orgunit, latitude et longitude valides.',
      });
    }

    // 🔐 Extraction et validation du token "Bearer xxxxx"
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'En-tête Authorization manquant ou invalide.' });
    }

    const token = authHeader.split(' ')[1];
    const basicAuth = extractBasicAuthFromToken(token); // ⬅️ à adapter à ta logique métier
    if (!basicAuth) {
      return res.status(401).json({ error: 'Authentification échouée.' });
    }

    // ✅ Appel PATCH à DHIS2
    const response = await axios.patch(
      `${DHIS2_API_URL}/api/organisationUnits/${orgunit}`,
      {
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    // ✅ Réponse OK
    res.status(200).json({
      success: true,
      message: 'Géométrie mise à jour avec succès.',
      data: response.data,
    });

  } catch (err: any) {
    // 🛑 Erreur
    console.error('❌ Erreur DHIS2:', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: 'Échec de la mise à jour de la géométrie.',
      details: err?.response?.data || err.message,
    });
  }
});

// 📏 Distance
app.get('/api/distance', async (req, res) => {
  const origin = (req.query.origin as string)?.split(',').map(Number);
  const dest = (req.query.destination as string)?.split(',').map(Number);

  if (!origin || !dest || origin.length !== 2 || dest.length !== 2 || origin.some(isNaN) || dest.some(isNaN)) {
    return res.status(400).json({ error: 'Invalid origin or destination' });
  }

  try {
    const distance = await getOSRMDistanceAllProfile(
      origin as [number, number],
      dest as [number, number]
    );
    res.json({ distance });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// ✅ Static files (avant routes pour éviter catch-all trop tôt)

// // 🌐 Proxy direct vers CouchDB sans auth (ex: accès public ou test)
// app.use('/database', databaseMiddlewareCheck, proxyDatabaseMiddleware);

// 🌐 Fallback vers index.html pour toutes les autres routes (SPA)


app.use(express.static(path.join(PROJECT_FOLDER, 'views')));
app.use(express.static(path.join(SRC_FOLDER, 'public')));


// 🗺️ Proxy vers OSRM (Open Source Routing Machine)
app.use('/mapOsrm', osrmProxy);

// 🔐 Proxy sécurisé vers CouchDB avec auth et path rewriting
// app.use('/:dbName/_bulk_docs', bodyParser.json({ limit: '200mb' }));
app.use('/:dbName/_local/:docId', (req, res, next) => res.json({ ok: true }));
app.use('/dbinfo', couchdbProxy);
app.use('/', couchdbProxy);


app.get('*', (req: Request, res: Response, next: NextFunction) => {
  const indexPath = path.join(PROJECT_FOLDER, 'views/index.html');
  res.sendFile(indexPath, (err: any) => {
    if (err) {
      err.noStaticFiles = true;
      next(err);
    }
  });
});

app.use((req: Request, res: Response) => res.status(200).redirect('/'));

// ✅ Gestion centralisée des erreurs
app.use(Errors.getErrors);
app.use(Errors.get404);

// Planification : toutes les 1 minutes
cron.schedule('*/1 * * * *', async () => {
  try {
    console.log('⏳ Exécution de updateDocDistanceAndSaveDocs...');
    await COUCH.updateDocDistanceAndSaveDocs();
    // console.log('✅ Terminé.');
  } catch (err: any) {
    console.error('❌ Erreur pendant la tâche cron :', err.message);
  }
});

// 🔐 Chargement des certificats SSL
const SSL_KEY_PATH = path.resolve(__dirname, '../ssl/key.pem');
const SSL_CERT_PATH = path.resolve(__dirname, '../ssl/cert.pem');
// openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes
// const sslOptions = {
//   key: fs.readFileSync('./ssl/key.pem'),
//   cert: fs.readFileSync('./ssl/cert.pem'),
// };
// const isSecureHost = USE_SECURE_PORTS && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH);

const sslOptions = {
  key: USE_SECURE_PORTS ? fs.readFileSync(SSL_KEY_PATH) : '',
  cert: USE_SECURE_PORTS ? fs.readFileSync(SSL_CERT_PATH) : '',
};



(USE_SECURE_PORTS ? https.createServer(sslOptions, app) : http.createServer(app)).listen(PORT, HOST, async () => {
  if (USE_SECURE_PORTS) {
    console.log(sslOptions)
  }

  const host0 = `${PROTOCOL}://localhost:4200`;
  const host1 = `${PROTOCOL}://localhost:${PORT}`;

  console.log(`✅ ${PROTOCOL} server running on ${host1}`);
  console.log(`🛑 COUCHDB listening at ${PROTOCOL}://localhost:${PORT}/database`);
  console.log(`🔐 OSRM listening at ${PROTOCOL}://localhost:${PORT}/osrm`);

  if (!allowedOrigins.includes(host0)) allowedOrigins.push(host0);
  if (!allowedOrigins.includes(host1)) allowedOrigins.push(host1);
  // const ok1 = await COUCH.ensureDatabaseExists('_users');
  // if (ok1) {
  //   await COUCH.checkOrCreateCouchDbUserWithSecurity();
  //   console.log('📦 Base _users prête à l\'emploi');
  // }
  // if (COUCHDB_DB && COUCHDB_DB != '') {
  //   const ok2 = await COUCH.ensureDatabaseExists(COUCHDB_DB);
  //   if (ok2) {
  //     await COUCH.createOrUpsertDesignDocument();
  //     console.log(`📦 Base ${COUCHDB_DB} prête à l'emploi`);
  //   }
  // }
  if (SHOW_ALL_AVAILABLE_HOST) {
    const interfaces = os.networkInterfaces();
    Object.values(interfaces).flat().forEach((iface) => {
      if (iface?.family === 'IPv4' && !iface.internal) {
        const host1 = `${PROTOCOL}://${iface.address}:${PORT}`;
        console.log(`🌐 Accessible à : ${host1}`);
        if (!allowedOrigins.includes(host1)) allowedOrigins.push(host1)
      }
    });
  }
});


// app.listen(PORT, HOST, () => {
//   const host0 = `${PROTOCOL}://localhost:4200`;
//   const host1 = `${PROTOCOL}://localhost:${PORT}`;
//   if (!allowedOrigins.includes(host0)) allowedOrigins.push(host0);
//   if (!allowedOrigins.includes(host1)) allowedOrigins.push(host1);
//   ensureDatabaseExists('_users').then(ok => {
//     if (ok) console.log('📦 Base _users prête à l\'emploi');
//   });
//   if (COUCHDB_DB && COUCHDB_DB != '') {
//     ensureDatabaseExists(COUCHDB_DB).then(ok => {
//       if (ok) console.log(`📦 Base ${COUCHDB_DB} prête à l'emploi`);
//     });
//   }
//   console.log(`✅ Backend listening at ${PROTOCOL}://localhost:${PORT}`);
//   console.log(`🔐 COUCHDB listening at http://localhost:${COUCHDB_PORT}`);
// });


// 🌐 Redirect HTTP to HTTPS
// http.createServer((req, res) => {
//   const host = req.headers['host']?.replace(/:\d+$/, `:${PORT}`) || `localhost:${PORT}`;
//   res.writeHead(301, { Location: `https://${host}${req.url}` });
//   res.end();
// }).listen(8088);

