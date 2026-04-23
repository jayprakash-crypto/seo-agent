import { Router, Request, Response } from "express";
import {
  registerUser,
  loginUser,
  getUserById,
} from "../controllers/users.controller.js";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware.js";

const router = Router();

// GET /users/me
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const { sub } = (req as AuthRequest).user!;

  try {
    const user = await getUserById(sub);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error("[users] me error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /users/register
router.post("/register", async (req: Request, res: Response) => {
  const { email, password, name } = req.body as {
    email?: string;
    password?: string;
    name?: string;
  };

  if (!email || !password || !name) {
    res
      .status(400)
      .json({
        success: false,
        error: "email, password, and name are required",
      });
    return;
  }

  try {
    const result = await registerUser({ email, password, name });
    res.status(201).json({ success: true, ...result });
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === "EMAIL_TAKEN") {
      res.status(409).json({ success: false, error: e.message });
      return;
    }
    console.error("[users] register error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /users/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res
      .status(400)
      .json({ success: false, error: "email and password are required" });
    return;
  }

  try {
    const result = await loginUser(email, password);
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === "INVALID_CREDENTIALS") {
      res.status(401).json({ success: false, error: e.message });
      return;
    }
    console.error("[users] login error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export { router as usersRouter };
