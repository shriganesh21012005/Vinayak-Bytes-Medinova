import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import recordsRouter from "./records";
import memoryRouter from "./memory";
import chatRouter from "./chat";
import clinicalSummaryRouter from "./clinicalSummary";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(recordsRouter);
router.use(memoryRouter);
router.use("/chat", chatRouter);
router.use("/clinical-summary", clinicalSummaryRouter);

export default router;
