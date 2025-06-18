import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ClientRequest } from "http";

const { JWT_SECRET, COUCHDB_URL, COUCHDB_PROTOCOL, COUCHDB_USER, COUCHDB_PASS, OSRM_URL } = ENV;


// 🔐 Vérifie la présence et validité du cookie JWT
function fauxtonAccessMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: "Token manquant" });

    try {
        jwt.verify(token, JWT_SECRET!);
        next();
    } catch (err) {
        return res.status(403).json({ message: "Token invalide" });
    }
}

// 🔁 Proxy API DB (protégé par authMiddleware)
const proxyApiDbMiddleware = createProxyMiddleware({
    target: COUCHDB_URL,
    changeOrigin: true,
    secure: COUCHDB_PROTOCOL === 'https',
    selfHandleResponse: false,
    pathRewrite: (path, req) => path,
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            const authorization = 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Authorization', authorization);
        }
    }
});

// 🔁 Proxy public vers Fauxton + DB
const proxyDatabaseMiddleware = createProxyMiddleware({
    target: COUCHDB_URL,
    changeOrigin: true,
    secure: COUCHDB_PROTOCOL === 'https',
    pathRewrite: (path) => path,
    selfHandleResponse: false,
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            proxyReq.setHeader('Content-Type', 'application/json');
        },
        proxyRes: (proxyRes, req: Request, res: Response) => {
            const location = proxyRes.headers['location'];
            if (location && typeof location === 'string') {
                try {
                    const newURL = new URL(location);
                    // Rewrite redirects from CouchDB to include /database prefix
                    proxyRes.headers['location'] = `${req.protocol}://${req.headers.host}/database${newURL.pathname}`;
                } catch (err) {
                    console.warn('⚠️ Erreur de réécriture de location:', err);
                }
            }
        },
        error: (err: Error, req: Request, res: any) => {
            console.error('[Proxy Error] CouchDB:', err.message);
            if (!res.headersSent) {
                res.status(502).json({
                    error: 'ProxyError',
                    message: 'Impossible de joindre CouchDB via le proxy',
                });
            }
        },
    }
});



// const proxyDatabaseMiddleware = createProxyMiddleware({
//   target: COUCHDB_URL,
//   changeOrigin: true,
//   selfHandleResponse: false, // Laisse http-proxy-middleware gérer la réponse
//   pathRewrite: { '^/database': '/database' },
//   router: (req: Request) => {
//     const host = req.headers.host || '';
//     if (host.includes('4200')) {
//       // Si la requête vient du front local (Angular par ex.), utiliser BACKEND_HOST
//       return COUCHDB_URL;
//     }
//     return COUCHDB_URL; // par défaut
//   },
//   on: {
//     proxyReq: (proxyReq, req, res) => {
//       // Personnalisation éventuelle des en-têtes ou du corps de la requête
//       if (!req.headers['content-type']?.includes('multipart')) {
//         // writeHeaders(req, res);
//         proxyReq.setHeader('Content-Type', 'application/json');
//       }
//     },
//     proxyRes: (proxyRes, req, res) => {
//       // Nettoie les redirections HTTP qui contiendraient l’URL interne CouchDB
//       const location = proxyRes.headers['location'];
//       if (location && typeof location === 'string') {
//         proxyRes.headers['location'] = location.replace(COUCHDB_URL, '');
//       }
//     },
//     error: (err: Error, req: Request, res: any) => {
//       console.error('[Proxy Error] CouchDB:', err.message);
//       if (!res.headersSent) {
//         res.status(502).json({
//           error: 'ProxyError',
//           message: 'Impossible de joindre CouchDB via le proxy',
//         });
//       }
//     },
//   },
// });

// 🔐 Middleware de vérification d'accès à Fauxton
const databaseMiddlewareCheck = (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') {
        if (req.path === '/_utils') return res.redirect(301, req.originalUrl + '/');
        const isUi = !req.path.match(/\.(js|css|png|ico|json|map)$/)
            && !req.path.startsWith('/_session')
            && !req.path.startsWith('/_utils/');
        if (isUi) {
            const token = req.cookies.token;
            if (!token) return res.status(401).json({ message: 'Token manquant' });
            try { jwt.verify(token, JWT_SECRET!); }
            catch { return res.status(403).json({ message: 'Token invalide' }); }
        }
    }
    next();
};

// 🧭 Proxy vers OSRM
const proxyOsrmMiddleware = createProxyMiddleware({
    target: OSRM_URL,
    changeOrigin: true,
    secure: false,
    selfHandleResponse: false,
    pathRewrite: (path) => path,
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            proxyReq.setHeader('Content-Type', 'application/json');
        },
        proxyRes: (proxyRes, req: Request, res: Response) => {
            const location = proxyRes.headers['location'];
            if (location && typeof location === 'string') {
                try {
                    const newURL = new URL(location);
                    proxyRes.headers['location'] = `${req.protocol}://${req.headers.host}/database${newURL.pathname}`;
                } catch (err) {
                    console.warn('⚠️ Erreur de réécriture de location:', err);
                }
            }
        }
    }
});

export {
    proxyApiDbMiddleware,
    proxyDatabaseMiddleware,
    databaseMiddlewareCheck,
    proxyOsrmMiddleware,
    fauxtonAccessMiddleware
};