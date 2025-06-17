import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import os from "os";
import https from "https";
import http from "http";
import axios from "axios";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth";
import { ENV, PROJECT_FOLDER, SRC_FOLDER } from "./config/env";
import { authMiddleware } from "./middlewares/auth.middleware";
import { couchProxy } from "./middlewares/proxy";
import { extractBasicAuthFromToken, getOSRMDistanceAllProfile } from "./functions";
import helmet from 'helmet';
import bearerToken from 'express-bearer-token';
import path from 'path';
import { Errors } from "./routes/error";

import bodyParser from 'body-parser';
import { updateDocDistanceAndSaveDocs } from "./middlewares/bulk-handler";



const { DHIS2_API_URL, HTTPS_PORT, HTTP_PORT, USE_SECURE_PORTS, SHOW_ALL_AVAILABLE_HOST } = ENV;

const SECURE_PORT = parseInt(HTTPS_PORT || "3003");
const UNSECURE_PORT = parseInt(HTTP_PORT || "8088");

// 🟢 Création du serveur HTTPS
const HOST = SHOW_ALL_AVAILABLE_HOST ? '0.0.0.0' : 'localhost';


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
  if (!req.secure && req.headers.host) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// ✅ Sécurité + Analyse
app.use(cors({
  origin: (origin, callback) => {
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

// app.use(cors());

// 🔐 Middlewares
// app.use(session({
//   secret: 'session',
//   cookie: {
//     secure: isSecure,
//     maxAge: 60000
//   },
//   saveUninitialized: true,
//   resave: true
// }))
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(bearerToken());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Intercepter et parser les bulk_docs via /api/db
// app.use(`/api/db/${COUCHDB_NAME}/_bulk_docs`, bodyParser.json({ limit: '10mb' }));

app.use('/api/db/:dbName', bodyParser.json({ limit: '200mb' }));

app.use('/api/db/:dbName/_local/:docId', (req, res, next) => {
  updateDocDistanceAndSaveDocs();
  return res.json({ ok: true });
});

app.use("/api/db", authMiddleware, couchProxy);

// ✅ Static files (avant routes pour éviter catch-all trop tôt)
app.use(express.static(path.join(PROJECT_FOLDER, 'views')));
app.use(express.static(path.join(SRC_FOLDER, 'public')));

// ➕ API Routes
app.use("/api/auth", authRoutes);

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

// ✅ Route principale SPA (si aucune autre route ne matche)
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  const indexPath = path.join(PROJECT_FOLDER, 'views/index.html');
  res.sendFile(indexPath, (err: any) => {
    if (err) {
      err.noStaticFiles = true;
      next(err);
    }
  });
});

// ✅ Gestion centralisée des erreurs
app.use(Errors.getErrors);
app.use(Errors.get404);





if (USE_SECURE_PORTS) {
  const SSL_KEY_PATH = path.resolve(__dirname, './ssl/key.pem');
  const SSL_CERT_PATH = path.resolve(__dirname, './ssl/cert.pem');

  // 🔐 Vérifie que les fichiers existent
  if (!fs.existsSync(SSL_KEY_PATH) || !fs.existsSync(SSL_CERT_PATH)) {
    console.error('❌ Certificats SSL manquants ! Générez-les avec :');
    console.error('   openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes');
    process.exit(1);
  }

  // 🔐 Chargement des certificats SSL
  const sslOptions = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH),
  };

  // ✅ HTTPS Server
  https.createServer(sslOptions, app).listen(SECURE_PORT, HOST, () => {
    const host0 = `https://localhost:4200`;
    const host1 = `https://localhost:${SECURE_PORT}`;
    console.log(`✅ HTTPS server running on ${host1}`);
    if (!allowedOrigins.includes(host0)) allowedOrigins.push(host0);
    if (!allowedOrigins.includes(host1)) allowedOrigins.push(host1);
    if (SHOW_ALL_AVAILABLE_HOST) {
      const interfaces = os.networkInterfaces();
      Object.values(interfaces).flat().forEach((iface) => {
        if (iface?.family === 'IPv4' && !iface.internal) {
          const host1 = `https://${iface.address}:${SECURE_PORT}`;
          console.log(`🌐 Accessible à : ${host1}`);
          if (!allowedOrigins.includes(host1)) allowedOrigins.push(host1)
        }
      });
    }
  });
} else {
  http.createServer(app).listen(UNSECURE_PORT, HOST, () => {
    const host0 = `http://localhost:4200`;
    const host1 = `http://localhost:${UNSECURE_PORT}`;
    console.log(`✅ HTTP server running on ${host1}`);
    if (!allowedOrigins.includes(host0)) allowedOrigins.push(host0);
    if (!allowedOrigins.includes(host1)) allowedOrigins.push(host1);
    if (SHOW_ALL_AVAILABLE_HOST) {
      const interfaces = os.networkInterfaces();
      Object.values(interfaces).flat().forEach((iface) => {
        if (iface?.family === 'IPv4' && !iface.internal) {
          const host1 = `http://${iface.address}:${UNSECURE_PORT}`;
          console.log(`🌐 Accessible à : ${host1}`);
          if (!allowedOrigins.includes(host1)) allowedOrigins.push(host1)
        }
      });
    }
  });
  // 🌐 Redirect HTTP to HTTPS
  // http.createServer((req, res) => {
  //   const host = req.headers['host']?.replace(/:\d+$/, `:${PORT}`) || `localhost:${PORT}`;
  //   res.writeHead(301, { Location: `https://${host}${req.url}` });
  //   res.end();
  // }).listen(8088);

}
