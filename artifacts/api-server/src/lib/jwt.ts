import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env["JWT_ACCESS_SECRET"];
const REFRESH_SECRET = process.env["JWT_REFRESH_SECRET"];
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

function getSecret(key: string | undefined, name: string): string {
  if (!key) throw new Error(`${name} environment variable is required`);
  return key;
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getSecret(ACCESS_SECRET, "JWT_ACCESS_SECRET"), {
    expiresIn: ACCESS_EXPIRY,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, getSecret(REFRESH_SECRET, "JWT_REFRESH_SECRET"), {
    expiresIn: REFRESH_EXPIRY,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getSecret(ACCESS_SECRET, "JWT_ACCESS_SECRET")) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, getSecret(REFRESH_SECRET, "JWT_REFRESH_SECRET")) as RefreshTokenPayload;
}
