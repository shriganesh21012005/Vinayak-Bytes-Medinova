import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import recordsRouter from "./records";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(recordsRouter);

export default router;
