import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: { sub: string; email: string };
}

const JWT_SECRET = process.env.JWT_SECRET ?? "somesecret";

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      logout: true,
      error: "Authentication required. Please log in.",
    });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      email: string;
    };
    req.user = { sub: payload.sub, email: payload.email };
    next();
  } catch (err) {
    const isExpired = err instanceof jwt.TokenExpiredError;
    res.status(401).json({
      success: false,
      logout: true,
      error: isExpired
        ? "Session expired. Please log in again."
        : "Invalid token. Please log in.",
    });
  }
}
