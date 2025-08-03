import express, { Express, RequestHandler } from "express";

export interface AppConfig {
  middlewares?: RequestHandler[];
  setupRoutes?: (app: Express) => void;
}

export function createApp(config: AppConfig = {}): Express {
  const app = express();
  const { middlewares = [], setupRoutes } = config;

  middlewares.forEach((middleware) => {
    app.use(middleware);
  });

  app.get("/", (_req, res) => {
    res.send("Hello");
  });

  app.get("/api/test", (_req, res) => {
    res.json({ message: "Test endpoint" });
  });

  if (setupRoutes) {
    setupRoutes(app);
  }

  return app;
}
