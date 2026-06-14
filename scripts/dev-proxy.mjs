import http from "node:http";
import net from "node:net";

const TARGET = 19579;
const PORT = 5000;

const server = http.createServer((req, res) => {
  const opts = {
    hostname: "localhost",
    port: TARGET,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${TARGET}` },
  };
  const proxy = http.request(opts, (pr) => {
    res.writeHead(pr.statusCode ?? 502, pr.headers);
    pr.pipe(res, { end: true });
  });
  proxy.on("error", () => res.destroy());
  req.pipe(proxy, { end: true });
});

// WebSocket tunnel (needed for Vite HMR)
server.on("upgrade", (req, socket, head) => {
  const conn = net.connect(TARGET, "localhost", () => {
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
  console.log(`dev-proxy: ${PORT} → ${TARGET}`);
});
