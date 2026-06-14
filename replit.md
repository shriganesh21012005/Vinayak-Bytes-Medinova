# MediNova

A health-tech platform where users manage their medical records and get AI-powered health guidance through a personal health assistant.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/health-chat-assistant run dev` — run the frontend (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secrets: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- API: Express 5, esbuild (ESM bundle), pino logging
- DB: MongoDB Atlas + Mongoose
- Auth: JWT access tokens (15 min, in-memory) + refresh tokens (7 days, httpOnly cookie)
- Frontend: React 19, Vite, Tailwind CSS v3, Framer Motion, Radix UI, TanStack Query
- Validation: Zod (`zod/v4`), `drizzle-zod`
- OCR: Tesseract.js (images) + pdf-parse (PDFs)

## Where things live

- `artifacts/api-server/src/` — Express backend
  - `routes/` — auth, records, memory, chat, health-check
  - `models/` — User, HealthRecord, HealthMemory, ChatConversation, ChatMessage
  - `lib/` — jwt, mongodb, logger, ocr, extraction, healthContextBuilder, healthMemoryEngine, safetyLayer, mockAiGenerator
  - `middlewares/` — auth (requireAuth), rateLimit, errorHandler
- `artifacts/health-chat-assistant/src/` — React frontend
  - `contexts/AuthContext.tsx` — JWT auth state, token refresh
  - `components/ChatAssistant.tsx` — SSE-based chat UI
  - `pages/` — Index, and feature pages
- `lib/api-spec/openapi.yaml` — OpenAPI source of truth
- `lib/api-zod/` + `lib/api-client-react/` — generated from spec

## Architecture decisions

- **One conversation per user** — `ChatConversation` uses `userId` as a unique index; chat history is per-user, not per-session.
- **SSE streaming for chat** — `POST /api/chat/send` streams `data: {...}\n\n` events; frontend reads via `ReadableStream`. Makes responses feel fast without WebSockets.
- **Mock AI (Stage 1)** — `lib/mockAiGenerator.ts` generates context-aware responses from the health profile without calling any external AI API. Stage 2 will swap this for GPT-4o-mini.
- **Safety layer runs before context** — `analyzeSafety()` fires first on every message; emergencies and diagnosis/prescription requests get hardcoded safe responses that bypass the AI entirely.
- **Health context is injected per-request** — `HealthMemory` is loaded fresh on each `/chat/send` call and merged into the response logic. No caching needed at Stage 1 scale.
- **JWT secrets in Replit secret store** — never in `.replit` userenv or code. Refresh tokens are SHA-256 hashed before storage in MongoDB.

## Product

- **Health Memory** — upload PDFs/images; OCR + extraction pipeline builds a structured health profile (medications, allergies, conditions, surgeries, critical events).
- **AI Health Assistant** — floating chat widget; streams health-aware, safety-guarded responses; persists conversation history per user; unauthenticated users see a sign-in prompt.
- **Service directory** — Doctors, Hospitals, Ambulance, PharmCare, PathoCare pages.
- **Auth** — register/login with brute-force lockout, rotate-on-use refresh tokens.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pdf-parse` is CJS-only — use `createRequire` in build.mjs; it's externalized in esbuild config.
- Mongoose async pre-save hooks must NOT call `next()` — just `return`.
- Rate limiter: `app.set("trust proxy", 1)` is required on Replit; also set `validate: { xForwardedForHeader: false }` on express-rate-limit.
- pnpm `approve-builds` needed for `tesseract.js` after a fresh install.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Stage 2 (GPT-4o-mini): replace `mockAiGenerator.ts` with a real OpenAI call once `OPENAI_API_KEY` is approved
