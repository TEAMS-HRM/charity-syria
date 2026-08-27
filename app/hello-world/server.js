const http = require("node:http");
const net = require("node:net");

const port = Number.parseInt(process.env.PORT || "8080", 10);

// /db-check reports the database hostname, name and user, and the ALB serves
// it to the whole internet. Opt in per environment; off is a plain 404.
const dbCheckEnabled = process.env.DB_CHECK_ENABLED === "true";

// The ALB terminates TLS and forwards plain HTTP, so the original scheme and
// hostname only survive in these headers. Tenant routing (a later phase) keys
// off the same Host header.
function describeRequest(request) {
  const host = request.headers.host || "";
  const [subdomain] = host.split(".");

  return {
    host,
    tenant: subdomain || null,
    proto: request.headers["x-forwarded-proto"] || "http",
  };
}

// PostgreSQL SSLRequest: length 8, then the magic 80877103. The server answers
// with a single byte - 'S' it will do TLS, 'N' it won't. Enough to prove the
// route, the security groups and that Postgres itself is listening, without
// pulling in a driver.
const SSL_REQUEST = (() => {
  const packet = Buffer.alloc(8);
  packet.writeInt32BE(8, 0);
  packet.writeInt32BE(80877103, 4);
  return packet;
})();

function probeDatabase({ host, port: dbPort, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host, port: dbPort });

    const finish = (result) => {
      socket.destroy();
      resolve({ ...result, elapsedMs: Date.now() - startedAt });
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => socket.write(SSL_REQUEST));
    socket.on("data", (chunk) => {
      const reply = String.fromCharCode(chunk[0]);
      finish({
        reachable: true,
        speaksPostgres: reply === "S" || reply === "N",
        tls: reply === "S" ? "offered" : "not offered",
      });
    });
    socket.on("timeout", () =>
      finish({ reachable: false, error: "timeout — usually a security group or subnet route" })
    );
    socket.on("error", (error) =>
      finish({ reachable: false, error: error.code || error.message })
    );
  });
}

async function checkDatabase() {
  const host = process.env.DB_HOST;

  if (!host) {
    return {
      configured: false,
      note: "DB_HOST is unset — the task definition is not wired to the database",
    };
  }

  const probe = await probeDatabase({
    host,
    port: Number.parseInt(process.env.DB_PORT || "5432", 10),
    timeoutMs: 4000,
  });

  return {
    configured: true,
    host,
    port: Number.parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || null,
    user: process.env.DB_USER || null,
    // Whether Secrets Manager injection worked. The value itself never leaves
    // the process.
    passwordInjected: Boolean(process.env.DB_PASSWORD),
    ...probe,
  };
}

const server = http.createServer(async (request, response) => {
  let statusCode = 200;
  let payload;

  if (request.url === "/health") {
    payload = { status: "ok" };
  } else if (request.url === "/db-check" && dbCheckEnabled) {
    // Never 5xx here: the load balancer health check is /health, and a failing
    // probe is a diagnosis, not a reason to kill the task.
    payload = await checkDatabase();
  } else if (request.url === "/") {
    payload = { message: "Hello from CharityApp", ...describeRequest(request) };
  } else {
    statusCode = 404;
    payload = { error: "not found" };
  }

  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Listening on port ${port}`);
});
