// MVMP Realtime Service — socket.io gateway
// Port 3003: socket.io (browser connects via Caddy: io('/?XTransformPort=3003'))
// Port 3004: internal HTTP emit endpoint (Next.js API routes, server-to-server only)
import { createServer } from "http";
import { Server } from "socket.io";

const SOCKET_PORT = 3003;
const EMIT_PORT = 3004;

// --- Socket.io (browser-facing) ---
const io = new Server(SOCKET_PORT, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: "/",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  console.log(`[realtime] client connected: ${socket.id} (total ${io.engine.clientsCount})`);

  socket.emit("realtime:hello", {
    message: "Terhubung ke MVMP realtime server",
    timestamp: new Date().toISOString(),
  });

  socket.on("disconnect", () => {
    console.log(`[realtime] client disconnected: ${socket.id} (total ${io.engine.clientsCount})`);
  });

  socket.on("error", (error) => {
    console.error(`[realtime] socket error (${socket.id}):`, error);
  });
});

// --- Internal emit endpoint (Next.js API -> broadcast) ---
const emitServer = createServer((req, res) => {
  const send = (code: number, data: any) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  if (req.method === "GET" && req.url === "/health") {
    return send(200, { ok: true, clients: io.engine.clientsCount });
  }

  if (req.method === "POST" && req.url === "/emit") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { event, payload } = JSON.parse(body || "{}");
        if (!event || typeof event !== "string") {
          return send(400, { ok: false, error: "Missing event" });
        }
        io.emit(event, payload ?? null);
        console.log(`[realtime] broadcast "${event}" to ${io.engine.clientsCount} client(s)`);
        return send(200, { ok: true, clients: io.engine.clientsCount });
      } catch (e: any) {
        return send(400, { ok: false, error: e?.message || "Bad JSON" });
      }
    });
    return;
  }

  send(404, { ok: false, error: "Not found" });
});

emitServer.listen(EMIT_PORT, "127.0.0.1", () => {
  console.log(`MVMP realtime emit endpoint on 127.0.0.1:${EMIT_PORT}`);
});

console.log(`MVMP realtime service listening on port ${SOCKET_PORT}`);

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down realtime service...");
  io.close();
  emitServer.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down realtime service...");
  io.close();
  emitServer.close(() => process.exit(0));
});
