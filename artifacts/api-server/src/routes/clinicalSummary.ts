import { Router, type Response } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { generateClinicalSummary } from "../lib/clinicalSummaryEngine";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;

  try {
    const summary = await generateClinicalSummary(userId);
    res.json({ summary });
  } catch {
    res.status(500).json({ error: "Failed to generate clinical summary" });
  }
});

export default router;
