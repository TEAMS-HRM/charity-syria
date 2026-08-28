// Every value the container needs, read once at startup and validated here so a
// misconfigured task fails immediately and visibly rather than on the first
// request that happens to need the missing piece.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function databaseUrlParts(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    return {
      host: parsed.hostname,
      port: Number.parseInt(parsed.port || "5432", 10),
      database: parsed.pathname.replace(/^\//, ""),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    throw new Error("Invalid DATABASE_URL format");
  }
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /**
   * The RDS parameter group sets rds.force_ssl = 1, so a non-TLS connection is
   * refused outright. Local Postgres usually has no TLS at all, hence the flag.
   */
  ssl: boolean;
  poolSize: number;
}

export interface AppConfig {
  port: number;
  environment: string;
  logLevel: string;
  rootDomain: string;
  provisioning: {
    workerEnabled: boolean;
    workerIntervalMs: number;
  };
  auth: {
    cognitoRegion: string;
    userPoolId: string;
    appClientId: string;
    enabled: boolean;
  };
  database: DatabaseConfig;
}

export function loadConfig(): AppConfig {
  const dbFromUrl = databaseUrlParts();

  return {
    port: Number.parseInt(optional("PORT", "8080"), 10),
    environment: optional("NODE_ENV", "development"),
    logLevel: optional("LOG_LEVEL", "info"),

    // Used to strip the environment suffix off a Host header when working out
    // which tenant a request belongs to.
    rootDomain: optional("ROOT_DOMAIN", "staging.charity-syria.com"),

    provisioning: {
      workerEnabled: optional("PROVISIONING_WORKER_ENABLED", "false") === "true",
      workerIntervalMs: Number.parseInt(optional("PROVISIONING_WORKER_INTERVAL_MS", "4000"), 10),
    },

    auth: {
      cognitoRegion: optional("COGNITO_REGION", ""),
      userPoolId: optional("COGNITO_USER_POOL_ID", ""),
      appClientId: optional("COGNITO_APP_CLIENT_ID", ""),
      enabled:
        optional("COGNITO_REGION", "") !== "" &&
        optional("COGNITO_USER_POOL_ID", "") !== "" &&
        optional("COGNITO_APP_CLIENT_ID", "") !== "",
    },

    database: {
      host: dbFromUrl?.host ?? required("DB_HOST"),
      port: dbFromUrl?.port ?? Number.parseInt(optional("DB_PORT", "5432"), 10),
      database: dbFromUrl?.database ?? required("DB_NAME"),
      user: dbFromUrl?.user ?? required("DB_USER"),
      // Injected by ECS from Secrets Manager - never present in the task
      // definition, only resolved into the process at start.
      password: dbFromUrl?.password ?? required("DB_PASSWORD"),
      ssl: optional("DB_SSL", "true") === "true",
      poolSize: Number.parseInt(optional("DB_POOL_SIZE", "10"), 10),
    },
  };
}
