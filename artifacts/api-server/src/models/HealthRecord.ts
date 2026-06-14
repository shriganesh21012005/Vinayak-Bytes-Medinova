import mongoose, { Schema, type Document } from "mongoose";

export interface IMedicine {
  name: string;
  nameConfidence: "high" | "medium" | "low" | "unverified";
  dosage?: string;
  frequency?: string;
  duration?: string;
}

export interface IOcrResult {
  engine: "pdf-parse" | "tesseract" | "openai-vision";
  rawText: string;
  confidence: number;
  blocked: boolean;
  blockReason?: string;
  wordCount: number;
  processedAt: Date;
}

export interface IExtraction {
  source: "rule-based" | "openai";
  medicines: IMedicine[];
  warnings: string[];
  rawMedicineText: string;
  extractedAt: Date;
}

export interface IMemorySignals {
  allergiesFound: string[];
  conditionsFound: string[];
  medicationsFound: string[];
  criticalEventsFound: string[];
}

export interface IHealthRecord extends Document {
  userId: mongoose.Types.ObjectId;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  fileData: Buffer;
  status: "uploading" | "processing" | "completed" | "failed" | "blocked";
  ocr?: IOcrResult;
  extraction?: IExtraction;
  memorySignals?: IMemorySignals;
  createdAt: Date;
  updatedAt: Date;
}

const MedicineSchema = new Schema<IMedicine>(
  {
    name: { type: String, required: true },
    nameConfidence: {
      type: String,
      enum: ["high", "medium", "low", "unverified"],
      required: true,
    },
    dosage: String,
    frequency: String,
    duration: String,
  },
  { _id: false }
);

const OcrResultSchema = new Schema<IOcrResult>(
  {
    engine: {
      type: String,
      enum: ["pdf-parse", "tesseract", "openai-vision"],
      required: true,
    },
    rawText: { type: String, required: true },
    confidence: { type: Number, required: true },
    blocked: { type: Boolean, required: true },
    blockReason: String,
    wordCount: { type: Number, required: true },
    processedAt: { type: Date, required: true },
  },
  { _id: false }
);

const ExtractionSchema = new Schema<IExtraction>(
  {
    source: { type: String, enum: ["rule-based", "openai"], required: true },
    medicines: [MedicineSchema],
    warnings: [String],
    rawMedicineText: String,
    extractedAt: { type: Date, required: true },
  },
  { _id: false }
);

const MemorySignalsSchema = new Schema<IMemorySignals>(
  {
    allergiesFound: [String],
    conditionsFound: [String],
    medicationsFound: [String],
    criticalEventsFound: [String],
  },
  { _id: false }
);

const HealthRecordSchema = new Schema<IHealthRecord>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    originalFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileData: { type: Buffer, required: true },
    status: {
      type: String,
      enum: ["uploading", "processing", "completed", "failed", "blocked"],
      default: "uploading",
    },
    ocr: OcrResultSchema,
    extraction: ExtractionSchema,
    memorySignals: MemorySignalsSchema,
  },
  { timestamps: true }
);

export const HealthRecord = mongoose.model<IHealthRecord>(
  "HealthRecord",
  HealthRecordSchema
);
