import { Request, Response } from "express";
import { ENV } from "../config/env";
import { createProxyMiddleware } from "http-proxy-middleware";
import http, { ClientRequest } from 'http';

const { COUCHDB_USER, COUCHDB_PASS, FULL_COUCHDB_URL, COUCHDB_DB, COUCHDB_URL, COUCHDB_PROTOCOL, OSRM_URL } = ENV;

// export const couchdbProxy = createProxyMiddleware({
//   target: FULL_COUCHDB_URL,
//   changeOrigin: true,
//   secure: COUCHDB_PROTOCOL === 'https',
//   selfHandleResponse: false,
//   // pathRewrite: {
//   //   '^/api/db': '', // supprime le prefixe pour qu’on accède bien à /health-map-db
//   // },
//   pathRewrite: (path, req) => path,
//   //   router: (req: Request) => {
//   //     const host = req.headers.host || '';
//   //     return FULL_COUCHDB_URL; // par défaut
//   //   },
//   on: {
//     proxyReq: (proxyReq: ClientRequest, req: Request, res: Response) => {
//       const authorization = 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
//       proxyReq.setHeader('Content-Type', 'application/json');
//       proxyReq.setHeader('Authorization', authorization);

//       if (!req.headers['content-type']?.includes('multipart')) {
//         writeHeaders(req, res);
//         writeParsedBody(proxyReq, req);
//       }

//       // 🔒 Supprimer AuthSession des cookies si présent
//       const cookies = req.headers.cookie?.split(';').filter(c => !c.trim().startsWith('AuthSession='));
//       if (cookies?.length) {
//         proxyReq.setHeader('Cookie', cookies.join(';'));
//       } else {
//         proxyReq.removeHeader('Cookie');
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
//       // console.error('[Proxy Error] CouchDB:', err.message);
//       if (!res.headersSent) {
//         res.status(502).json({
//           error: 'ProxyError',
//           message: 'Impossible de joindre CouchDB via le proxy',
//         });
//       }
//     },
//   }
// });

const FULL_COUCHDB_URL_NT = 'http://couchdb:5984'

export const couchdbProxy = createProxyMiddleware({
  target: FULL_COUCHDB_URL,
  changeOrigin: true,
  secure: COUCHDB_PROTOCOL === 'https',
  selfHandleResponse: false, // Laisse http-proxy-middleware gérer la réponse
  pathRewrite: { '^/': '/' },
  router: (req: Request) => {
    // const host = req.headers.host || '';
    return FULL_COUCHDB_URL; // par défaut
  },
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request, res: Response) => {
      if (!req.headers['content-type']?.includes('multipart')) {
        writeHeaders(req, res);
        writeParsedBody(proxyReq, req);
      }
    },
    proxyRes: (proxyRes, req, res) => {
      // Nettoie les redirections HTTP qui contiendraient l’URL interne CouchDB
      const location = proxyRes.headers['location'];
      if (location && typeof location === 'string') {
        proxyRes.headers['location'] = location.replace(COUCHDB_URL, '');
      }
    },
    error: (err: Error, req: Request, res: any) => {
      // console.error('[Proxy Error] CouchDB:', err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'ProxyError',
          message: 'Impossible de joindre CouchDB via le proxy',
        });
      }
    },
  },
});

export const osrmProxy = createProxyMiddleware({
  target: OSRM_URL,
  changeOrigin: true,
  selfHandleResponse: false, // Laisse http-proxy-middleware gérer la réponse
  secure: false,
  // pathRewrite: { '^/': '/' },
  // router: (req: Request) => {
  //   const host = req.headers.host || '';
  //   return OSRM_URL; // par défaut
  // },
  on: {
    proxyReq: (proxyReq, req, res) => {

      // Personnalisation éventuelle des en-têtes ou du corps de la requête
      if (!req.headers['content-type']?.includes('multipart')) {
        writeHeaders(req, res);
        writeParsedBody(proxyReq, req);
      }
    },
    proxyRes: (proxyRes, req, res) => {
      // Nettoie les redirections HTTP qui contiendraient l’URL interne CouchDB
      const location = proxyRes.headers['location'];
      if (location && typeof location === 'string') {
        proxyRes.headers['location'] = location.replace(OSRM_URL, '');
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
  },
});

const writeHeaders = (req: Request, res: Response, headers?: [string, string][], redirectHumans?: boolean): Response => {
  (res as any).oldWriteHead = res.writeHead;
  res.writeHead = function (statusCode: number, headersObj?: http.OutgoingHttpHeaders) {
    res.setHeader('WWW-Authenticate', 'Cookie');
    if (headers) {
      headers.forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    if (redirectHumans) {
      statusCode = 302;
      const pathPrefix = `/${COUCHDB_DB}/`;
      res.setHeader('Location', pathPrefix + 'login?redirect=' + encodeURIComponent(req.url));
    }
    (res as any).oldWriteHead(statusCode, headersObj);
  } as any;
  return res;
};

const writeParsedBody = (proxyReq: http.ClientRequest, req: Request) => {
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }
};
