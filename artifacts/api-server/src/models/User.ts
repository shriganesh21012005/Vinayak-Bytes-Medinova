import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = parseInt(process.env["BCRYPT_ROUNDS"] ?? "12", 10);

interface RefreshTokenEntry {
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  dateOfBirth?: Date;
  bloodGroup?: string;
  preferredLanguage: string;
  avatar?: string;
  refreshTokens: RefreshTokenEntry[];
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
  isLocked(): boolean;
}

const RefreshTokenSchema = new Schema<RefreshTokenEntry>(
  {
    tokenHash: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    phone: { type: String, trim: true },
    dateOfBirth: { type: Date },
    bloodGroup: { type: String, trim: true },
    preferredLanguage: { type: String, default: "en", enum: ["en", "bn", "hi"] },
    avatar: { type: String },
    refreshTokens: { type: [RefreshTokenSchema], default: [] },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

UserSchema.methods.isLocked = function (): boolean {
  if (!this.lockedUntil) return false;
  return this.lockedUntil > new Date();
};

UserSchema.pre("save", async function () {
  if (!this.isModified("passwordHash")) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, BCRYPT_ROUNDS);
});

export const User = mongoose.model<IUser>("User", UserSchema);
