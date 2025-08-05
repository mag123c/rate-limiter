import express, { Express, RequestHandler } from "express";

export interface AppConfig {
  middlewares?: RequestHandler[];
  setupRoutes?: (app: Express) => void;
}

export function createApp(config: AppConfig = {}): Express {
  const app = express();
  const { middlewares = [], setupRoutes } = config;

  // trust proxy 설정으로 X-Forwarded-For 헤더 처리
  app.set('trust proxy', true);

  middlewares.forEach((middleware) => {
    app.use(middleware);
  });

  // 모든 메서드에 대해 기본 라우트 설정
  const defaultHandler = (_req: express.Request, res: express.Response) => {
    res.json({ message: "OK" });
  };

  app.get("/", defaultHandler);
  app.post("/", defaultHandler);
  app.put("/", defaultHandler);
  app.delete("/", defaultHandler);
  app.patch("/", defaultHandler);

  app.get("/api/test", (_req, res) => {
    res.json({ message: "Test endpoint" });
  });

  if (setupRoutes) {
    setupRoutes(app);
  }

  return app;
}
