import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { HealthMemory } from "../models/HealthMemory";
import { rebuildHealthMemoryForUser } from "../lib/healthMemoryEngine";

const router = Router();

router.get("/memory", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const userOid = new mongoose.Types.ObjectId(req.user.userId);
  const memory = await HealthMemory.findOne({ userId: userOid });

  if (!memory) {
    res.json({
      exists: false,
      allergies: [],
      chronicConditions: [],
      surgeries: [],
      medicationRestrictions: [],
      criticalEvents: [],
      currentMedications: [],
      unverifiedMedications: [],
      condensedProfile: "",
      recordCount: 0,
      lastUpdatedAt: null,
    });
    return;
  }

  res.json({
    exists: true,
    allergies: memory.allergies,
    chronicConditions: memory.chronicConditions,
    surgeries: memory.surgeries,
    medicationRestrictions: memory.medicationRestrictions,
    criticalEvents: memory.criticalEvents,
    currentMedications: memory.currentMedications,
    unverifiedMedications: memory.unverifiedMedications,
    condensedProfile: memory.condensedProfile,
    recordCount: memory.recordCount,
    lastUpdatedAt: memory.updatedAt,
  });
});

router.post("/memory/rebuild", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const result = await rebuildHealthMemoryForUser(req.user.userId);
    res.json({
      success: true,
      recordsProcessed: result.recordsProcessed,
      skipped: result.skipped,
    });
  } catch (err) {
    console.error("[memory/rebuild] failed:", err);
    res.status(500).json({ error: "Rebuild failed. Please try again." });
  }
});

router.get("/memory/doctor-summary", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const userOid = new mongoose.Types.ObjectId(req.user.userId);
  const memory = await HealthMemory.findOne({ userId: userOid });

  if (!memory) {
    res.json({
      exists: false,
      majorAllergies: [],
      chronicConditions: [],
      currentMedications: [],
      unverifiedMedications: [],
      importantEvents: [],
      restrictions: [],
      criticalRisks: [],
      surgeries: [],
      condensedProfile: "",
      recordCount: 0,
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  const majorAllergies = memory.allergies.map(a => ({
    value: a.value,
    sourceCount: a.sourceRecordIds.length,
    firstSeen: a.firstSeenAt,
  }));

  const chronicConditions = memory.chronicConditions.map(c => ({
    value: c.value,
    sourceCount: c.sourceRecordIds.length,
    firstSeen: c.firstSeenAt,
  }));

  const currentMedications = memory.currentMedications.map(m => ({
    name: m.name,
    dosage: m.dosage ?? null,
    frequency: m.frequency ?? null,
    confidence: m.confidence,
    sourceCount: m.sourceRecordIds.length,
    lastSeen: m.lastSeenAt,
  }));

  const unverifiedMedications = memory.unverifiedMedications.map(m => ({
    name: m.name,
    dosage: m.dosage ?? null,
    frequency: m.frequency ?? null,
    confidence: m.confidence,
    sourceCount: m.sourceRecordIds.length,
    lastSeen: m.lastSeenAt,
  }));

  const importantEvents = memory.criticalEvents.map(e => ({
    value: e.value,
    firstSeen: e.firstSeenAt,
  }));

  const restrictions = memory.medicationRestrictions.map(r => ({
    value: r.value,
    firstSeen: r.firstSeenAt,
  }));

  const criticalRisks = [
    ...memory.allergies
      .filter(a => a.sourceRecordIds.length >= 1)
      .map(a => `Allergy: ${a.value}`),
    ...memory.medicationRestrictions.map(r => `Restriction: ${r.value}`),
    ...memory.criticalEvents.map(e => e.value),
  ];

  res.json({
    exists: true,
    majorAllergies,
    chronicConditions,
    currentMedications,
    unverifiedMedications,
    importantEvents,
    restrictions,
    criticalRisks,
    surgeries: memory.surgeries.map(s => ({
      value: s.value,
      firstSeen: s.firstSeenAt,
    })),
    condensedProfile: memory.condensedProfile,
    recordCount: memory.recordCount,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
