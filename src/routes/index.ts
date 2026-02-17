import merchantRoutes from "./merchant.routes.js";
import { Router } from "express";

const router = Router();

router.use("/merchants", merchantRoutes);

export default router;
