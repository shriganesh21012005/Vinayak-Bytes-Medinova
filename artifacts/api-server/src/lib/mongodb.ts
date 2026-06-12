import mongoose from "mongoose";
import { logger } from "./logger";

let isConnected = false;

export async function connectMongoDB(): Promise<void> {
  if (isConnected) return;

  const uri = process.env["MONGODB_URI"];
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is required but was not provided.");
  }

  try {
    await mongoose.connect(uri);
    isConnected = true;
    logger.info("Connected to MongoDB Atlas");
  } catch (err) {
    logger.error({ err }, "Failed to connect to MongoDB Atlas");
    throw err;
  }

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
    logger.warn("MongoDB disconnected");
  });

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });
}
