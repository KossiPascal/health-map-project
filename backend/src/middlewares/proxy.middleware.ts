import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ClientRequest } from "http";

const { JWT_SECRET, COUCHDB_URL, COUCHDB_PROTOCOL, COUCHDB_USER, COUCHDB_PASS,OSRM_URL } = ENV;

// Middleware personnalisé : autorise uniquement si cookie JWT présent et valide
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


const proxyApiDbMiddleware = createProxyMiddleware({
  target: COUCHDB_URL,
  changeOrigin: true,
  selfHandleResponse: false,
  secure: COUCHDB_PROTOCOL == 'https',
  // pathRewrite:{ [`^/api/db/create/${COUCHDB_DB}`]: `/${COUCHDB_DB}` },
  pathRewrite: (path, req) => path, // fallback
  on: {
    proxyReq: async (proxyReq: ClientRequest, req: any) => {
      // Forcer le typage pour accéder à req.body
      const authorization = 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Authorization', authorization);
    }
  }
})

const proxyDatabaseMiddleware = createProxyMiddleware({
  target: COUCHDB_URL,
  changeOrigin: true,
  secure: COUCHDB_PROTOCOL === 'https',
  pathRewrite: (path) => path, // garde le chemin
  selfHandleResponse: false,
  on: {
    proxyRes: (proxyRes, req:any, res) => {
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

const databaseMiddlewareCheck = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    if (req.path.match(/^\/_utils$/)) {
      return res.redirect(301, req.originalUrl + '/');
    }
    const isAsset = req.path.match(/\.(js|css|png|ico|json|map)$/);
    const isSessionAPI = req.path.startsWith('/_session') || req.path.startsWith('/_utils');

    if (!isAsset && !isSessionAPI) {
      return fauxtonAccessMiddleware(req, res, next);
    }
  }
  next();
}

const proxyOsrmMiddleware = createProxyMiddleware({
  target: OSRM_URL,
  changeOrigin: true,
  secure: false,
  pathRewrite: (path) => path,
  selfHandleResponse: false,
  // ✅ Réécriture des en-têtes Location (ex: redirection Fauxton)
  on: {
    proxyRes: (proxyRes:any, req:any, res) => {
      const location = proxyRes.headers['location'];
      if (location && typeof location === 'string') {
        try {
          const newURL = new URL(location);
          // Exemple : http://couchdb:5984/_utils → devient /database/_utils
          proxyRes.headers['location'] = `${req.protocol}://${req.headers.host}/database${newURL.pathname}`;
        } catch (err) {
          console.warn('⚠️ Erreur de réécriture de location:', err);
        }
      }
    }
  }
})

export {
    proxyApiDbMiddleware,
    proxyDatabaseMiddleware,
    databaseMiddlewareCheck,
    proxyOsrmMiddleware
}