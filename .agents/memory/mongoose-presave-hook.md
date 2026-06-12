---
name: Mongoose async pre-save hook
description: Mongoose v7+ async pre-hooks must not call next(); return is enough
---

In Mongoose 7+, if the pre-hook is declared `async function`, calling `next()` throws `TypeError: next is not a function`.

**Rule:** Use `async function ()` with plain `return` — do NOT pass or call `next`.

```ts
// WRONG (throws "next is not a function" in Mongoose 7+)
UserSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// CORRECT
UserSchema.pre("save", async function () {
  if (!this.isModified("passwordHash")) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});
```

**Why:** Mongoose changed the async hook contract in v7. Async hooks resolve via the returned promise; the `next` callback is not injected.

**How to apply:** Any time a Mongoose pre/post hook is async, never include `next` in the signature.
