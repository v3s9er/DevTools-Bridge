import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import ws from "./vendor/ws/index.js";

const { WebSocketServer } = ws;
const host = "127.0.0.1";
const port = 18765;
const packageRoot = dirname(fileURLToPath(import.meta.url));
const roots = new Map([
  ["/app/", resolve(packageRoot, "vendor", "devtools-app")]
]);
const sessions = new Map();
const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
const tokenPattern = /^[0-9a-f]{48}$/;
const mimeTypes = new Map(Object.entries({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8"
}));

function localAddress(address) {
  return address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function writeSocket(socket, value) {
  if (socket?.readyState === ws.OPEN) socket.send(value);
}

function forget(token, role, socket) {
  const record = sessions.get(token);
  if (!record || record[role] !== socket) return;
  record[role] = null;
  if (role === "frontend") {
    record.closeTimer = setTimeout(() => {
      if (!record.frontend) {
        writeSocket(record.extension, JSON.stringify({ bridge: "frontend_closed" }));
      }
    }, 2500);
  } else if (record.frontend) {
    record.frontend.close(1001, "Extension disconnected");
  }
  if (!record.extension && !record.frontend) {
    clearTimeout(record.closeTimer);
    sessions.delete(token);
  }
}

const server = http.createServer(async (request, response) => {
  if (!localAddress(request.socket.remoteAddress)) {
    response.writeHead(403).end();
    return;
  }
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ready: true, frontendConnected: [...sessions.values()].some(s => s.frontend) }));
    return;
  }
  const prefix = [...roots.keys()].find(candidate => url.pathname.startsWith(candidate));
  if (!prefix || request.method !== "GET") {
    response.writeHead(404).end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname.slice(prefix.length)); }
  catch { response.writeHead(400).end(); return; }
  const root = roots.get(prefix);
  const file = resolve(root, pathname);
  if (!file.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const type = mimeTypes.get(extname(file).toLowerCase()) ?? "application/octet-stream";
    const gzip = /\bgzip\b/.test(request.headers["accept-encoding"] ?? "") &&
      (type.startsWith("text/") || type.startsWith("application/json"));
    response.writeHead(200, {
      "Content-Type": type,
      ...(gzip ? { "Content-Encoding": "gzip", "Vary": "Accept-Encoding" } : { "Content-Length": info.size }),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self' devtools: data: blob:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' devtools:; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:18765; object-src 'none'"
    });
    const stream = createReadStream(file);
    if (gzip) stream.pipe(createGzip()).pipe(response);
    else stream.pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

server.on("upgrade", (request, socket, head) => {
  if (!localAddress(socket.remoteAddress)) {
    socket.destroy();
    return;
  }
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const match = /^\/bridge\/(extension|frontend)\/([0-9a-f]+)$/.exec(url.pathname);
  if (!match || !tokenPattern.test(match[2])) {
    socket.destroy();
    return;
  }
  const [, role, token] = match;
  const origin = request.headers.origin ?? "";
  if (role === "extension" ? !/^chrome-extension:\/\/[a-p]{32}$/.test(origin) :
      origin !== `http://${host}:${port}`) {
    socket.destroy();
    return;
  }
  let record = sessions.get(token);
  if (role === "extension") {
    if (record?.extension) { socket.destroy(); return; }
    record ??= { extension: null, frontend: null, closeTimer: null };
    sessions.set(token, record);
  } else if (!record?.extension || record.frontend) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, peer => {
    if (role === "frontend") clearTimeout(record.closeTimer);
    record[role] = peer;
    peer.on("message", (data, binary) => {
      if (binary) return;
      const raw = data.toString();
      if (raw === '{"bridge":"ping"}') return;
      writeSocket(record[role === "extension" ? "frontend" : "extension"], raw);
    });
    peer.on("close", () => forget(token, role, peer));
    peer.on("error", () => forget(token, role, peer));
  });
});

server.listen(port, host, () => {
  console.log(`DevTools Bridge: http://${host}:${port}/health`);
  console.log("이 창을 열어 둔 상태로 브라우저 확장 버튼을 누르세요.");
});
