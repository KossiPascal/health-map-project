import { NextFunction, Request, Response } from "express";
import { join } from "path";
import { SRC_FOLDER } from "../config/env";

export class Errors {
  static get404 = (req: Request, res: Response) => {
    const path404 = join(SRC_FOLDER, 'public', '404.html');
    res.status(404).sendFile(path404, err => {
      if (err) {
        console.error("❌ Impossible de charger 404.html :", err);
        res.status(404).send('404 Not Found');
      }
    });
  };

  static getErrors = (error: any, req: Request, res: Response, next: NextFunction) => {
    console.error("💥 Erreur interceptée :", error);

    if (error.message === "Not allowed by CORS") {
      return res.status(403).json({ message: "⛔ Origin non autorisée par CORS" });
    }

    if (error.noStaticFiles) {
      const path404 = join(SRC_FOLDER, 'public', '404.html');
      return res.status(404).sendFile(path404, err => {
        if (err) {
          console.error("❌ Erreur de fallback 404.html :", err);
          res.status(404).send("404 Not Found");
        }
      });
    }

    // Autres erreurs
    return res.status(error.statusCode || 500).json({
      error: {
        message: error.message || "Erreur interne du serveur.",
        data: error.data || null,
      },
    });
  };
}
