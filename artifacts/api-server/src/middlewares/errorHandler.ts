import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProduction = process.env["NODE_ENV"] === "production";

  if (err instanceof Error) {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({
      error: isProduction ? "Internal server error" : err.message,
    });
  } else {
    logger.error({ err }, "Unknown error");
    res.status(500).json({ error: "Internal server error" });
  }
}
