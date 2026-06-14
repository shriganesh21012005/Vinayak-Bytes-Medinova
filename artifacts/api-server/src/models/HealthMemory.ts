import mongoose, { Schema, type Document } from "mongoose";

export interface IMemoryItem {
  value: string;
  sourceRecordIds: mongoose.Types.ObjectId[];
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface IMedicationItem {
  name: string;
  dosage?: string;
  frequency?: string;
  sourceRecordIds: mongoose.Types.ObjectId[];
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface IHealthMemory extends Document {
  userId: mongoose.Types.ObjectId;
  allergies: IMemoryItem[];
  chronicConditions: IMemoryItem[];
  surgeries: IMemoryItem[];
  medicationRestrictions: IMemoryItem[];
  criticalEvents: IMemoryItem[];
  currentMedications: IMedicationItem[];
  condensedProfile: string;
  lastUpdatedByRecord?: mongoose.Types.ObjectId;
  recordCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const MemoryItemSchema = new Schema<IMemoryItem>(
  {
    value: { type: String, required: true },
    sourceRecordIds: [{ type: Schema.Types.ObjectId }],
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { _id: false }
);

const MedicationItemSchema = new Schema<IMedicationItem>(
  {
    name: { type: String, required: true },
    dosage: String,
    frequency: String,
    sourceRecordIds: [{ type: Schema.Types.ObjectId }],
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { _id: false }
);

const HealthMemorySchema = new Schema<IHealthMemory>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    allergies: { type: [MemoryItemSchema], default: [] },
    chronicConditions: { type: [MemoryItemSchema], default: [] },
    surgeries: { type: [MemoryItemSchema], default: [] },
    medicationRestrictions: { type: [MemoryItemSchema], default: [] },
    criticalEvents: { type: [MemoryItemSchema], default: [] },
    currentMedications: { type: [MedicationItemSchema], default: [] },
    condensedProfile: { type: String, default: "" },
    lastUpdatedByRecord: { type: Schema.Types.ObjectId },
    recordCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const HealthMemory = mongoose.model<IHealthMemory>(
  "HealthMemory",
  HealthMemorySchema
);
