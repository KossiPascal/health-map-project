import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

const { JWT_SECRET } = ENV;

// auth.middleware.ts
// export function requireAuth(req: Request, res: Response, next: NextFunction) {
//     const session = req.cookies.AuthSession;
//     if (!session) {
//       return res.status(401).json({ ok: false, message: 'Not authenticated' });
//     }
//     next();
//   }
  

// export const isAuthenticated = async (req: any, res: any, next: any) => {
//   try {
//     const session = await couch.session();

//     if (session.userCtx.name) {
//       (req as any).user = session.userCtx; // injecter l'utilisateur
//       return next();
//     }

//     return res.status(401).json({ error: 'Unauthorized' });
//   } catch (err) {
//     console.error('Auth middleware error:', err);
//     return res.status(401).json({ error: 'Unauthorized' });
//   }
// };


export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ message: 'Authorization header missing' });
        }

        const token = authHeader.split(' ')[1]; // Bearer <token>
        if (!token) {
            return res.status(401).json({ message: 'Token missing' });
        }

        // const cookie = req.headers['cookie'];
        // if (!cookie?.includes('AuthSession')) {
        //     return res.status(401).json({ message: 'Not authenticated with CouchDB session' });
        // }

        const decoded = jwt.verify(token, JWT_SECRET!); // Remplace par ta clé
        (req as any).user = decoded; // Tu peux typer mieux si tu veux

        next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};


// export function authMiddleware(req: Request, res: Response, next: NextFunction) {
//   const token = req.cookies['token'];
//   if (!token) {
//     return res.status(401).json({ error: 'Non authentifié' });
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     (req as any).user = decoded;
//     next();
//   } catch (err) {
//     return res.status(403).json({ error: 'Token invalide' });
//   }
// }
