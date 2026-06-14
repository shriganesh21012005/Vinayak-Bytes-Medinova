import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

function run(cmd, args, opts = {}) {
  const proc = spawn(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  proc.on("error", (err) => console.error(`[${cmd}] error:`, err.message));
  return proc;
}

// Start proxy (port 5000 → 19579) immediately so the workflow port-check passes
const proxy = run("node", ["scripts/dev-proxy.mjs"]);

// Start Vite dev server (port 19579)
const vite = run("pnpm", [
  "--filter",
  "@workspace/health-chat-assistant",
  "run",
  "dev",
]);

function shutdown() {
  proxy.kill("SIGTERM");
  vite.kill("SIGTERM");
  setTimeout(() => process.exit(0), 2000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Exit if either child dies unexpectedly
proxy.on("exit", (code) => {
  if (code !== 0) {
    console.error("Proxy exited with code", code);
    process.exit(code ?? 1);
  }
});
vite.on("exit", (code) => {
  if (code !== 0) {
    console.error("Vite exited with code", code);
    process.exit(code ?? 1);
  }
});
