---
name: CJS modules in ESM esbuild output
description: How to import CJS-only npm packages when the esbuild output is ESM format and the package is externalized
---

## The problem

When esbuild output format is ESM and a package is in the `external` list, esbuild emits a static `import X from "package"`. Node.js then tries to load the package as ESM. If the package is CJS-only (no `"exports"."import"` field, no named `default` export), Node throws:

```
SyntaxError: The requested module 'package' does not provide an export named 'default'
```

## The rule

For CJS-only externalized packages, replace the static import with `createRequire`:

```typescript
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const myPkg = _require("my-cjs-package") as SomeType;
```

**Why:** `createRequire` uses Node's CJS loader, which correctly handles `module.exports` as the default export.

## How to apply

- Check before externalizing: does the package have `"exports": { "import": ... }` in its package.json?
- If yes → safe to externalize + static import
- If no (pure CJS) → externalize + use `createRequire` pattern, OR remove from externals and let esbuild bundle it

## Affected packages in this project

- `pdf-parse` — CJS only; uses `createRequire` in `src/lib/ocr.ts`
- `tesseract.js` — ESM dist available (`dist/tesseract.esm.min.js`); static import works fine when externalized
