import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { createRequire } from "module";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalRateLimit } from "./middlewares/rateLimit";
import { errorHandler } from "./middlewares/errorHandler";

const _require = createRequire(import.meta.url);
const __dirname = path.dirname(new URL(import.meta.url).pathname);

const app: Express = express();

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));

const VERCEL_PATTERN = /^https:\/\/vinayak-bytes-medinovarepotrackedbyvercel[a-z0-9-]*\.vercel\.app$/;
const REPLIT_PATTERN = /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.replit\.dev$/;
const REPLIT_APP_PATTERN = /^https:\/\/[a-z0-9-]+\.replit\.app$/;
const LOCAL_ORIGINS = new Set(["http://localhost:5000", "http://localhost:19579"]);

function isAllowedOrigin(origin: string): boolean {
  if (LOCAL_ORIGINS.has(origin)) return true;
  if (VERCEL_PATTERN.test(origin)) return true;
  if (REPLIT_PATTERN.test(origin)) return true;
  if (REPLIT_APP_PATTERN.test(origin)) return true;
  const replitDevDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (replitDevDomain && origin === `https://${replitDevDomain}`) return true;
  if (process.env["ALLOWED_ORIGINS"]) {
    return process.env["ALLOWED_ORIGINS"].split(",").map((o) => o.trim()).includes(origin);
  }
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    credentials: true,
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());
app.use(generalRateLimit);

app.use("/api", router);

if (process.env["NODE_ENV"] === "production") {
  const publicDir = path.resolve(__dirname, "../../health-chat-assistant/dist/public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use(errorHandler);

export default app;
