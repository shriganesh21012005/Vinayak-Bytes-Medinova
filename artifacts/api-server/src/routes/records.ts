import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { HealthRecord } from "../models/HealthRecord";
import { processFile } from "../lib/ocr";
import { extractPrescriptionData } from "../lib/extraction";
import { extractMemorySignals } from "../lib/memorySignals";
import { updateHealthMemory } from "../lib/healthMemoryEngine";

const router = Router();

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPEG, and PNG files are allowed."));
    }
  },
});

function safeOcrSummary(ocr: {
  engine: string;
  confidence: number;
  wordCount: number;
  blocked: boolean;
  blockReason?: string;
}) {
  return {
    engine: ocr.engine,
    confidence: ocr.confidence,
    wordCount: ocr.wordCount,
    blocked: ocr.blocked,
    blockReason: ocr.blockReason,
  };
}

router.post(
  "/records/upload",
  requireAuth,
  upload.single("file"),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided." });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    let record;
    try {
      record = await HealthRecord.create({
        userId: new mongoose.Types.ObjectId(req.user.userId),
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        fileData: req.file.buffer,
        status: "processing",
      });
    } catch {
      res.status(500).json({ error: "Failed to save record. Please try again." });
      return;
    }

    try {
      const ocrResult = await processFile(req.file.buffer, req.file.mimetype);

      if (ocrResult.blocked) {
        await HealthRecord.findByIdAndUpdate(record._id, {
          status: "blocked",
          ocr: ocrResult,
        });
        res.status(200).json({
          recordId: record._id,
          status: "blocked",
          safetyMessage:
            "Processing blocked: the document could not be read with sufficient confidence. " +
            "Medicine names will never be guessed. Please upload a clearer scan.",
          ocr: safeOcrSummary(ocrResult),
        });
        return;
      }

      const extraction = extractPrescriptionData(ocrResult.rawText);
      const medicationNames = extraction.medicines.map(m => m.name);
      const memorySignals = extractMemorySignals(ocrResult.rawText, medicationNames);

      await HealthRecord.findByIdAndUpdate(record._id, {
        status: "completed",
        ocr: ocrResult,
        extraction,
        memorySignals,
      });

      updateHealthMemory(
        req.user.userId,
        record._id.toString(),
        memorySignals,
        extraction.medicines
      ).catch((err) => {
        console.error("[health-memory] background update failed:", err);
      });

      res.status(200).json({
        recordId: record._id,
        status: "completed",
        ocr: safeOcrSummary(ocrResult),
        extraction: {
          source: extraction.source,
          medicines: extraction.medicines,
          warnings: extraction.warnings,
        },
        memorySignals,
      });
    } catch {
      if (record) {
        await HealthRecord.findByIdAndUpdate(record._id, { status: "failed" });
      }
      res.status(500).json({ error: "Processing failed. Please try again." });
    }
  }
);

router.get("/records", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Authentication required." }); return; }

  const records = await HealthRecord.find(
    { userId: req.user.userId },
    { fileData: 0 }
  ).sort({ createdAt: -1 });

  res.json({ records });
});

router.get("/records/:id", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Authentication required." }); return; }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: "Invalid record ID." });
    return;
  }

  const record = await HealthRecord.findOne(
    { _id: req.params.id, userId: req.user.userId },
    { fileData: 0 }
  );

  if (!record) { res.status(404).json({ error: "Record not found." }); return; }
  res.json({ record });
});

router.get("/records/:id/file", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Authentication required." }); return; }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: "Invalid record ID." });
    return;
  }

  const record = await HealthRecord.findOne({
    _id: req.params.id,
    userId: req.user.userId,
  });

  if (!record) { res.status(404).json({ error: "Record not found." }); return; }

  res.set("Content-Type", record.mimeType);
  res.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(record.originalFileName)}"`
  );
  res.send(record.fileData);
});

router.delete("/records/:id", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Authentication required." }); return; }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: "Invalid record ID." });
    return;
  }

  const result = await HealthRecord.deleteOne({
    _id: req.params.id,
    userId: req.user.userId,
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Record not found." });
    return;
  }

  res.json({ success: true });
});

export default router;
