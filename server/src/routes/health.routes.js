import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service: "ContractGuard API",
    },
  });
});

export default router;
