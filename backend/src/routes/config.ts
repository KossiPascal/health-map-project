import { NextFunction, Request, Response, Router } from 'express';
import { appVersion } from '../functions';

const configRouter = Router();

configRouter.post('/version', async (req: Request, res: Response, next: NextFunction) => {
  return res.status(200).json(appVersion());
});


export = configRouter;
