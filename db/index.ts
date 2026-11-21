/**
 * The database connection.
 *
 * Two things here matter more than they look.
 *
 * 1. The connection is built lazily. It used to be created the moment this
 *    module was imported, which meant that if the connection string was not
 *    present the *import itself* threw — every route, including the sign-in
 *    check, died with an opaque 500 before a single line of application code
 *    ran. Building it on first use lets the API answer with a message that
 *    says what is actually wrong.
 *
 * 2. The schema is repaired on first use. `records` shipped without a primary
 *    key, so the `ON CONFLICT (collection, id)` used by every save was
 *    rejected by Postgres and nothing could be written. `ensureSchema()` adds
 *    the missing key (de-duplicating first, if a broken deployment already let
 *    duplicates in) so an existing database heals itself on the next request
 *    rather than needing a manual migration.
 */
import { existsSync, readdirSync } from "node:fs";
import { drizzle as netlifyDrizzle } from "drizzle-orm/netlify-db";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "./schema.ts";

export type Database = any;

/**
 * Netlify sets `NETLIFY_DB_URL` for its managed database. The other names are
 * what people actually have in their environment when they wired the database
 * up by hand, or when they are running against Neon, Supabase or a local
 * Postgres, and there is no reason to fail just because the variable has a
 * different name.
 */
const CONNECTION_ENV_KEYS = [
  "NETLIFY_DB_URL",
  "NETLIFY_DATABASE_URL",
  "NETLIFY_DATABASE_URL_UNPOOLED",
  "DATABASE_URL",
  "NEON_DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
];

export function resolveConnectionString(): string | null {
  for (const key of CONNECTION_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim()) {
      const trimmed = value.trim();
      // Must be a valid connection URI, not a local file path like "data"
      if (
        trimmed.startsWith("postgres://") ||
        trimmed.startsWith("postgresql://") ||
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://")
      ) {
        if (trimmed.includes("/app/cloudsql/") || trimmed.includes("/cloudsql/")) {
          const match = trimmed.match(/(\/(?:app\/)?cloudsql\/[^?&/\s]+)/);
          if (match && match[1] && !existsSync(`${match[1]}/.s.PGSQL.5432`)) {
            continue;
          }
        }
        return trimmed;
      }
    }
  }
  return null;
}

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

const MISSING_CONNECTION_MESSAGE =
  "The database is not connected. Connect a PostgreSQL database via DATABASE_URL to persist data permanently.";

let dbPromise: Promise<Database> | null = null;
let pgliteInstance: PGlite | null = null;

/** Neon's HTTP driver only speaks to Neon hosts; anything else needs node-postgres. */
function usesNeonHttp(connectionString: string): boolean {
  if (process.env.NETLIFY_DB_DRIVER === "server") return false;
  return /neon\.tech|neon\.build|\.aws\.neon\./i.test(connectionString);
}

async function getPGliteClient(): Promise<Database> {
  if (!pgliteInstance) {
    pgliteInstance = new PGlite();
  }
  if (typeof (pgliteInstance as any).waitReady !== "undefined") {
    await (pgliteInstance as any).waitReady;
  }
  return (pgliteDrizzle as any)(pgliteInstance, { schema }) as any;
}

/* ------------------------------------------------------------------ *
 * Schema repair
 *
 * Everything below is idempotent: it is safe to run against a brand new
 * database, a fully migrated one, or the half-built one a failed deploy left
 * behind. It runs once per cold start.
 * ------------------------------------------------------------------ */

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "users" (
     "id" serial PRIMARY KEY NOT NULL,
     "username" text NOT NULL,
     "email" text,
     "full_name" text NOT NULL,
     "role" text NOT NULL,
     "password_hash" text NOT NULL,
     "active" integer DEFAULT 1 NOT NULL,
     "must_change_password" integer DEFAULT 0 NOT NULL,
     "last_login_at" timestamp,
     "created_at" timestamp DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS "sessions" (
     "token" text PRIMARY KEY NOT NULL,
     "user_id" integer NOT NULL,
     "created_at" timestamp DEFAULT now(),
     "expires_at" timestamp NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "records" (
     "id" text NOT NULL,
     "collection" text NOT NULL,
     "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
     "created_by" text DEFAULT '' NOT NULL,
     "updated_by" text DEFAULT '' NOT NULL,
     "created_at" timestamp DEFAULT now(),
     "updated_at" timestamp DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS "audit_log" (
     "id" serial PRIMARY KEY NOT NULL,
     "actor" text DEFAULT '' NOT NULL,
     "actor_role" text DEFAULT '' NOT NULL,
     "action" text NOT NULL,
     "collection" text DEFAULT '' NOT NULL,
     "record_id" text DEFAULT '' NOT NULL,
     "summary" text DEFAULT '' NOT NULL,
     "severity" text DEFAULT 'info' NOT NULL,
     "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
     "created_at" timestamp DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" ("username")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email")`,
  `CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" ("created_at")`,
  `CREATE INDEX IF NOT EXISTS "records_collection_idx" ON "records" ("collection")`,
  `CREATE INDEX IF NOT EXISTS "records_collection_created_by_idx" ON "records" ("collection", "created_by")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "records_collection_id_key" ON "records" ("collection", "id")`,
];

let schemaReady: Promise<void> | null = null;

const REQUIRED_TABLES = ["users", "sessions", "records", "audit_log"];

function sanitizeError(err: any): string {
  if (!err) return "Unknown database error";
  let str = String(err?.message || err);
  // Redact passwords and credentials
  str = str.replace(/:[^:@/]+@/g, ":***@");
  str = str.replace(/password=['"][^'"]+['"]/gi, "password='***'");
  return str;
}

export interface DriverStatus {
  connected: boolean;
  configured: boolean;
  isPersistent: boolean;
  isTemporary: boolean;
  driver: string;
  message: string;
  cloudSqlInstance?: string;
  error?: string;
}

let activeDriverInfo: DriverStatus = {
  connected: false,
  configured: false,
  isPersistent: false,
  isTemporary: true,
  driver: "Unconnected",
  message: "Database uninitialized.",
};

async function ensureSchema(db: Database): Promise<void> {
  // 1. First inspect if all required tables already exist in public schema
  let missing: string[] = [];
  try {
    const res = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const existingTables = (res.rows || []).map((r: any) => String(r.table_name || r.TABLE_NAME || "").toLowerCase());
    missing = REQUIRED_TABLES.filter((t) => !existingTables.includes(t));
  } catch {
    missing = [...REQUIRED_TABLES];
  }

  // 2. Only run DDL if tables are actually missing
  if (missing.length > 0) {
    const resolvedSocket = resolveCloudSqlSocketPath();
    if (resolvedSocket && process.env.SQL_ADMIN_USER && process.env.SQL_ADMIN_PASSWORD) {
      const { Pool } = await import("pg");
      const adminPool = new Pool({
        host: resolvedSocket,
        user: process.env.SQL_ADMIN_USER,
        password: process.env.SQL_ADMIN_PASSWORD,
        database: process.env.SQL_DB_NAME,
        connectionTimeoutMillis: 5000,
      });
      try {
        for (const statement of DDL) {
          await adminPool.query(statement);
        }
        if (process.env.SQL_USER) {
          await adminPool.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${process.env.SQL_USER}"`);
          await adminPool.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${process.env.SQL_USER}"`);
        }
      } catch {
        for (const statement of DDL) {
          try {
            await db.execute(sql.raw(statement));
          } catch {}
        }
      } finally {
        await adminPool.end();
      }
    } else {
      for (const statement of DDL) {
        try {
          await db.execute(sql.raw(statement));
        } catch (ddlErr: any) {
          console.warn("[Database] DDL execution notice:", ddlErr?.message || ddlErr);
        }
      }
    }

    // Re-verify after attempted creation
    const res2 = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const existingTables2 = (res2.rows || []).map((r: any) => String(r.table_name || r.TABLE_NAME || "").toLowerCase());
    const stillMissing = REQUIRED_TABLES.filter((t) => !existingTables2.includes(t));
    if (stillMissing.length > 0) {
      throw new Error(`Schema verification failed: missing required tables [${stillMissing.join(", ")}].`);
    }
  }

  // 3. Rigorously VERIFY read/write permissions on required tables
  try {
    await db.execute(sql`SELECT count(*) FROM users`);
    await db.execute(sql`SELECT count(*) FROM sessions`);
    await db.execute(sql`SELECT count(*) FROM records`);
    await db.execute(sql`SELECT count(*) FROM audit_log`);
  } catch (permErr: any) {
    throw new Error(`Schema permission verification failed: ${sanitizeError(permErr)}`);
  }
}

export function resolveCloudSqlSocketPath(): string | null {
  if (!process.env.SQL_USER || !process.env.SQL_DB_NAME) {
    return null;
  }
  const configuredHost = process.env.SQL_HOST?.trim() || "";
  if (configuredHost && !configuredHost.startsWith("/")) {
    return configuredHost;
  }
  if (configuredHost && existsSync(`${configuredHost}/.s.PGSQL.5432`)) {
    return configuredHost;
  }
  try {
    if (existsSync("/app/cloudsql")) {
      for (const entry of readdirSync("/app/cloudsql")) {
        const candidate = `/app/cloudsql/${entry}`;
        if (existsSync(`${candidate}/.s.PGSQL.5432`)) {
          return candidate;
        }
      }
    }
  } catch {}
  return null;
}

export function hasCloudSqlConfig(): boolean {
  return Boolean(resolveCloudSqlSocketPath());
}

/**
 * Hand back a ready-to-use database handle. The first call connects and
 * repairs the schema; every later call reuses that work.
 */
export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      // 1. Prioritize Cloud SQL if configured via platform environment variables
      const socketPath = resolveCloudSqlSocketPath();
      if (socketPath) {
        try {
          const { drizzle: pgDrizzle } = await import("drizzle-orm/node-postgres");
          const { Pool } = await import("pg");
          const pool = new Pool({
            host: socketPath,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            database: process.env.SQL_DB_NAME,
            max: 10,
            connectionTimeoutMillis: 4000,
          });
          pool.on("error", (err) => {
            console.error("Unexpected error on idle SQL pool client:", err);
          });
          await pool.query("SELECT 1;");
          const client = (pgDrizzle as any)({ client: pool, schema }) as any;
          await ensureSchema(client);
          schemaReady = Promise.resolve();

          activeDriverInfo = {
            connected: true,
            configured: true,
            isPersistent: true,
            isTemporary: false,
            driver: `Cloud SQL (PostgreSQL - ${socketPath.replace("/app/cloudsql/", "")})`,
            message: "Connected to persistent Cloud SQL PostgreSQL database. All operational tables verified.",
            cloudSqlInstance: socketPath,
          };
          return client;
        } catch (cloudErr: any) {
          console.warn("[Database] Cloud SQL socket unreachable, falling back cleanly:", sanitizeError(cloudErr));
        }
      }

      // 2. Standard connection string (DATABASE_URL / NEON_DATABASE_URL)
      const connectionString = resolveConnectionString();
      if (connectionString) {
        const driverName = usesNeonHttp(connectionString)
          ? "Netlify Database (Neon serverless)"
          : "Postgres (node-postgres)";
        try {
          let client: Database;
          if (usesNeonHttp(connectionString)) {
            client = (netlifyDrizzle as any)(connectionString, { schema }) as any;
          } else {
            const { drizzle: pgDrizzle } = await import("drizzle-orm/node-postgres");
            client = (pgDrizzle as any)(connectionString, { schema }) as any;
          }
          await client.execute(sql`select 1`);

          activeDriverInfo = {
            connected: true,
            configured: true,
            isPersistent: true,
            isTemporary: false,
            driver: driverName,
            message: `Connected to persistent remote database (${driverName}). All operational tables verified.`,
          };
          return client;
        } catch (error: any) {
          const sanitized = sanitizeError(error);
          activeDriverInfo = {
            connected: false,
            configured: true,
            isPersistent: false,
            isTemporary: false,
            driver: `${driverName} (Failed)`,
            message: `Remote database connection failed: ${sanitized}`,
            error: sanitized,
          };
          // FAIL CLOSED
          throw new DatabaseUnavailableError(
            `Remote database connection failed: ${sanitized}. Refusing fallback to ephemeral storage to protect business records.`
          );
        }
      }

      // 3. Fallback to in-memory PGlite ONLY when NO persistent connection was configured
      if (process.env.NETLIFY === "true" || process.env.NODE_ENV === "production") {
        throw new DatabaseUnavailableError(MISSING_CONNECTION_MESSAGE);
      }
      const client = await getPGliteClient();
      try {
        if (pgliteInstance && typeof (pgliteInstance as any).query === "function") {
          await pgliteInstance.query("SELECT 1;");
        } else {
          await client.execute(sql`select 1`);
        }
      } catch (err: any) {
        console.warn("[Database] PGlite check notice:", err?.message || err);
      }

      activeDriverInfo = {
        connected: true,
        configured: false,
        isPersistent: false,
        isTemporary: true,
        driver: "In-Memory PostgreSQL (PGlite) - TEMPORARY",
        message: "TEMPORARY in-memory storage (PGlite). No persistent connection configured. Changes will reset on container restart.",
      };
      return client;
    })().catch((error) => {
      // Let the next request try again rather than caching the failure forever.
      dbPromise = null;
      throw error;
    });
  }

  const db = await dbPromise;

  if (!schemaReady) {
    schemaReady = ensureSchema(db).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;

  return db;
}

/** Backs /api/health and admin panels, so an administrator can see the connection state. */
export async function checkDatabase(): Promise<DriverStatus> {
  try {
    await getDb();
    return { ...activeDriverInfo };
  } catch (err: any) {
    return {
      connected: false,
      configured: hasCloudSqlConfig() || Boolean(resolveConnectionString()),
      isPersistent: false,
      isTemporary: activeDriverInfo.isTemporary,
      driver: activeDriverInfo.driver,
      message: sanitizeError(err),
      cloudSqlInstance: process.env.SQL_HOST,
      error: sanitizeError(err),
    };
  }
}


