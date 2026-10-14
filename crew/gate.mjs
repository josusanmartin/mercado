// Basic-auth gate in front of the dev server, for the public Tailscale Funnel link (josu 05:20).
// GATE_USER/GATE_PASS come from ~/.config/mercado/gate.env (never committed). Proxies HTTP + WebSocket (HMR).
import http from "node:http";
import net from "node:net";
const { GATE_USER, GATE_PASS, GATE_PORT = "3101", TARGET_PORT = "3100" } = process.env;
if (!GATE_USER || !GATE_PASS) throw new Error("GATE_USER/GATE_PASS missing");
const want = "Basic " + Buffer.from(`${GATE_USER}:${GATE_PASS}`).toString("base64");
const ok = (h) => h.authorization === want || (h.cookie || "").includes(`mgate=${encodeURIComponent(want.slice(6))}`);
const server = http.createServer((req, res) => {
  if (!ok(req.headers)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Mercado"', "Content-Type": "text/plain" });
    return res.end("Mercado preview: sign in");
  }
  const up = http.request({ host: "127.0.0.1", port: TARGET_PORT, method: req.method, path: req.url, headers: req.headers }, (r) => {
    const headers = { ...r.headers };
    if (req.headers.authorization) headers["set-cookie"] = [...[].concat(headers["set-cookie"] || []), `mgate=${encodeURIComponent(want.slice(6))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`];
    res.writeHead(r.statusCode, headers);
    r.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("upstream down"); });
  req.pipe(up);
});
server.on("upgrade", (req, sock, head) => {
  if (!ok(req.headers)) return sock.destroy();
  const up = net.connect(+TARGET_PORT, "127.0.0.1", () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
    if (head?.length) up.write(head);
    sock.pipe(up).pipe(sock);
  });
  up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
});
server.listen(+GATE_PORT, "127.0.0.1", () => console.log(`gate on 127.0.0.1:${GATE_PORT} → :${TARGET_PORT}`));
