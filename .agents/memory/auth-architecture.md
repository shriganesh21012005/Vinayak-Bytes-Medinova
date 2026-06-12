---
name: MediNova auth architecture
description: JWT access + rotating refresh token design for MediNova
---

**Access token:** 15-minute JWT, kept in React AuthContext state (never localStorage). Sent as `Authorization: Bearer <token>`.

**Refresh token:** 7-day JWT, sent as `httpOnly; SameSite=strict` cookie at path `/api/auth`. SHA-256 hash stored in `user.refreshTokens[]` in MongoDB. Rotated on every use (old hash removed, new hash stored). Reuse detection: if hash not found, all tokens wiped.

**Brute-force protection:** 5 failed logins → 15-minute account lock (`lockedUntil` field).

**Auto-refresh:** AuthContext sets a 13-minute setTimeout after every token issue to silently refresh before expiry.

**Vite proxy:** Frontend calls `/api/*` → Vite dev server proxies to `http://localhost:5000` (API server port). Cookies work correctly because browser sees same origin.

**API server port:** The API server binds to `PORT` env var (currently 8080 in dev). Frontend proxy target is hardcoded to `localhost:5000` in vite.config.ts — if the port changes, update the proxy target too.

**Why:** Keeps access tokens short-lived (limits blast radius of leak) while keeping UX seamless via silent refresh. httpOnly cookie prevents XSS token theft of refresh tokens.
