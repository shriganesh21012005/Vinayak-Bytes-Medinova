import mongoose, { Schema, type Document } from "mongoose";

export interface IClinicalSummary {
  majorAllergies: string[];
  chronicConditions: string[];
  medicalEvents: string[];
  medications: Array<{ name: string; dosage?: string; frequency?: string; confidence: string }>;
  criticalHealthRisks: string[];
  importantRestrictions: string[];
  generatedAt: string;
}

export interface IClinicalSummaryCache extends Document {
  userId: mongoose.Types.ObjectId;
  summary: IClinicalSummary;
  createdAt: Date;
  expiresAt: Date;
}

const ClinicalSummaryCacheSchema = new Schema<IClinicalSummaryCache>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    summary: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const ClinicalSummaryCache = mongoose.model<IClinicalSummaryCache>(
  "ClinicalSummaryCache",
  ClinicalSummaryCacheSchema
);
