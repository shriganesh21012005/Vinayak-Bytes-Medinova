---
name: Express trust proxy + rate limit on Replit
description: Replit routes all traffic through a proxy; Express and express-rate-limit must be configured accordingly
---

**Rule:** Always set `app.set("trust proxy", 1)` AND `validate: { xForwardedForHeader: false }` on every `rateLimit()` instance when running on Replit.

**Why:** Replit injects an `X-Forwarded-For` header. Without `trust proxy`, express-rate-limit v8 throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` which propagates as a 500 to the client, killing route handlers before they run.

**How to apply:**
```ts
// app.ts
app.set("trust proxy", 1);

// rateLimit.ts
rateLimit({
  ...
  validate: { xForwardedForHeader: false },
});
```

Both fixes together are belt-and-suspenders: `trust proxy` is the correct fix; `validate: false` silences residual warnings in edge cases.
