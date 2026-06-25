import http from "node:http";
import net from "node:net";

const VITE_PORT = 19579;
const API_PORT = 8080;
const PORT = 5000;

function forward(req, res, targetPort) {
  const opts = {
    hostname: "localhost",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${targetPort}` },
  };
  const proxy = http.request(opts, (pr) => {
    res.writeHead(pr.statusCode ?? 502, pr.headers);
    pr.pipe(res, { end: true });
  });
  proxy.on("error", (err) => {
    console.error(`Proxy error (→${targetPort}):`, err.message);
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(proxy, { end: true });
}

const server = http.createServer((req, res) => {
  const isApi = req.url?.startsWith("/api");
  forward(req, res, isApi ? API_PORT : VITE_PORT);
});

// WebSocket tunnel (needed for Vite HMR)
server.on("upgrade", (req, socket, head) => {
  const conn = net.connect(VITE_PORT, "localhost", () => {
    const lines = [
      `${req.method} ${req.url} HTTP/1.1`,
      ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`),
      "",
      "",
    ];
    conn.write(lines.join("\r\n"));
    if (head?.length) conn.write(head);
    socket.pipe(conn);
    conn.pipe(socket);
  });
  conn.on("error", () => socket.destroy());
  socket.on("error", () => conn.destroy());
});

server.on("error", (err) => {
  console.error("Proxy server error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} already in use — exiting proxy`);
    process.exit(1);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`dev-proxy: ${PORT} → /api:${API_PORT}, *:${VITE_PORT}`);
});
