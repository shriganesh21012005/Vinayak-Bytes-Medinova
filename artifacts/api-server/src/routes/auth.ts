import { Router, Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { User } from "../models/User";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authRateLimit } from "../middlewares/rateLimit";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "strict",
    maxAge: REFRESH_MAX_AGE_MS,
    path: "/api/auth",
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}

function issueTokens(res: Response, userId: string, email: string) {
  const tokenId = randomUUID();
  const accessToken = signAccessToken({ userId, email });
  const refreshToken = signRefreshToken({ userId, tokenId });
  setRefreshCookie(res, refreshToken);
  return { accessToken, tokenId, refreshToken };
}

router.post("/register", authRateLimit, async (req: Request, res: Response) => {
  try {
    const { name, email, password, preferredLanguage } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      preferredLanguage?: string;
    };

    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: password,
      preferredLanguage: preferredLanguage ?? "en",
    });
    await user.save();

    const { accessToken, tokenId, refreshToken } = issueTokens(res, user._id.toString(), user.email);

    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);
    user.refreshTokens.push({
      tokenHash: hashToken(refreshToken),
      issuedAt: new Date(),
      expiresAt,
    });
    user.lastLoginAt = new Date();
    await user.save();

    res.status(201).json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
        avatar: user.avatar ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", authRateLimit, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (user.isLocked()) {
      const remaining = Math.ceil(
        ((user.lockedUntil?.getTime() ?? 0) - Date.now()) / 60000
      );
      res.status(423).json({
        error: `Account temporarily locked. Try again in ${remaining} minute(s).`,
      });
      return;
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();

    const { accessToken, refreshToken } = issueTokens(res, user._id.toString(), user.email);

    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);
    user.refreshTokens.push({
      tokenHash: hashToken(refreshToken),
      issuedAt: new Date(),
      expiresAt,
    });

    const cutoff = new Date();
    user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt > cutoff);

    await user.save();

    res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
        avatar: user.avatar ?? null,
        phone: user.phone ?? null,
        bloodGroup: user.bloodGroup ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    if (!token) {
      res.status(401).json({ error: "No refresh token" });
      return;
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(res);
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    const tokenHash = hashToken(token);
    const user = await User.findById(payload.userId);
    if (!user) {
      clearRefreshCookie(res);
      res.status(401).json({ error: "User not found" });
      return;
    }

    const storedIndex = user.refreshTokens.findIndex(
      (t) => t.tokenHash === tokenHash
    );
    if (storedIndex === -1) {
      user.refreshTokens = [];
      await user.save();
      clearRefreshCookie(res);
      res.status(401).json({ error: "Refresh token reuse detected. All sessions invalidated." });
      return;
    }

    user.refreshTokens.splice(storedIndex, 1);

    const { accessToken, refreshToken: newRefreshToken } = issueTokens(
      res,
      user._id.toString(),
      user.email
    );

    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);
    user.refreshTokens.push({
      tokenHash: hashToken(newRefreshToken),
      issuedAt: new Date(),
      expiresAt,
    });

    const cutoff = new Date();
    user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt > cutoff);

    await user.save();

    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ error: "Token refresh failed" });
  }
});

router.post("/logout", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    if (token && req.user) {
      const tokenHash = hashToken(token);
      await User.updateOne(
        { _id: req.user.userId },
        { $pull: { refreshTokens: { tokenHash } } }
      );
    }
    clearRefreshCookie(res);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.userId).select(
      "name email phone bloodGroup preferredLanguage avatar createdAt"
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      bloodGroup: user.bloodGroup ?? null,
      preferredLanguage: user.preferredLanguage,
      avatar: user.avatar ?? null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.patch("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, bloodGroup, preferredLanguage, avatar } = req.body as {
      name?: string;
      phone?: string;
      bloodGroup?: string;
      preferredLanguage?: string;
      avatar?: string;
    };

    const update: Record<string, string> = {};
    if (name) update["name"] = name.trim();
    if (phone !== undefined) update["phone"] = phone;
    if (bloodGroup !== undefined) update["bloodGroup"] = bloodGroup;
    if (preferredLanguage && ["en", "bn", "hi"].includes(preferredLanguage)) {
      update["preferredLanguage"] = preferredLanguage;
    }
    if (avatar !== undefined) update["avatar"] = avatar;

    const user = await User.findByIdAndUpdate(
      req.user!.userId,
      { $set: update },
      { new: true, select: "name email phone bloodGroup preferredLanguage avatar" }
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      bloodGroup: user.bloodGroup ?? null,
      preferredLanguage: user.preferredLanguage,
      avatar: user.avatar ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
