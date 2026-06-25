import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalRateLimit } from "./middlewares/rateLimit";
import { errorHandler } from "./middlewares/errorHandler";

const app: Express = express();

app.set("trust proxy", 1);

app.use(helmet());

const VERCEL_FRONTEND = "https://vinayak-bytes-medinovarepotrackedbyvercel-gtq0er7e4.vercel.app";

const allowedOrigins: string[] | true = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [
      VERCEL_FRONTEND,
      "http://localhost:5000",
      "http://localhost:19579",
    ];

app.use(
  cors({
    origin: allowedOrigins,
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

app.use(errorHandler);

export default app;
