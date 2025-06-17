import { createProxyMiddleware } from 'http-proxy-middleware';
import { ENV } from '../config/env';
import { ClientRequest, IncomingMessage, ServerResponse } from 'http';

const { COUCH_URL, COUCHDB_NAME, COUCH_USER, COUCH_PASS } = ENV;



export const couchProxy = createProxyMiddleware({
    target: COUCH_URL,
    changeOrigin: true,
    selfHandleResponse: false,
    // pathRewrite:{
    //     [`^/api/db/create/${COUCH_CHW_DB}`]: `/${COUCH_CHW_DB}`,
    //     [`^/api/db/create/${COUCH_FS_DB}`]: `/${COUCH_FS_DB}`,
    //     [`^/api/db/${COUCH_CHW_DB}`]: `/${COUCH_CHW_DB}`,
    //     [`^/api/db/${COUCH_FS_DB}`]: `/${COUCH_FS_DB}`,
    // },
    pathRewrite: (path, req) => {
        return path; // fallback
    },
    on: {
        proxyReq: async (proxyReq: ClientRequest, req: IncomingMessage, res: ServerResponse<IncomingMessage>, options) => {
            // Forcer le typage pour accéder à req.body
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Authorization', 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64'));

        }
    }
});



