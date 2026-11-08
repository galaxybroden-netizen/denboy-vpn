// MVMP — Shared environment validation utility
//
// Used by src/instrumentation.ts (Next.js startup hook) and src/worker/index.ts.
// Consolidates the env-var checks that BOTH Docker and Native deployments must pass.
//
// Phase 14 TASK 2: standardize production configuration across deployment modes.

export interface EnvValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  source: "env" | "dev-fallback" | "missing";
}

interface RequiredVar {
  name: string;
  /** Returns true if the value is acceptable. */
  validate: (value: string | undefined) => boolean;
  /** Human-readable requirement. */
  requirement: string;
  /** Whether missing/invalid is fatal in production. */
  requiredInProd: boolean;
}

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const HEX_96 = /^[0-9a-fA-F]{96}$/;

const REQUIRED_VARS: RequiredVar[] = [
  {
    name: "NODE_ENV",
    validate: (v) => v === "production" || v === "development" || v === "test",
    requirement: "Must be 'production', 'development', or 'test'",
    requiredInProd: true,
  },
  {
    name: "DATABASE_URL",
    validate: (v) => !!v && (v.startsWith("postgresql://") || v.startsWith("file:")),
    requirement: "Must be a postgresql:// or file: URL",
    requiredInProd: true,
  },
  {
    name: "REDIS_URL",
    validate: (v) => !!v && v.startsWith("redis://"),
    requirement: "Must be a redis:// URL",
    requiredInProd: true,
  },
  {
    name: "AI_ENCRYPTION_KEY",
    validate: (v) => {
      if (!v) return false;
      if (HEX_64.test(v)) return true; // 32-byte hex
      try {
        return Buffer.from(v, "base64").length === 32; // 32-byte base64
      } catch {
        return false;
      }
    },
    requirement: "Must be 32 bytes — 64 hex chars or valid base64 of 32 bytes",
    requiredInProd: true,
  },
  {
    name: "PUBLIC_URL",
    validate: (v) => !!v && v.startsWith("http"),
    requirement: "Must be an http(s):// URL",
    requiredInProd: true,
  },
  {
    name: "SESSION_SECRET",
    validate: (v) => !!v && (HEX_96.test(v) || v.length >= 32),
    requirement: "Should be ≥ 32 chars (96 hex chars recommended)",
    requiredInProd: false, // warning only
  },
];

/**
 * Validate the current process.env against MVMP production requirements.
 *
 * Behavior:
 *   - In NODE_ENV=production: any failed requiredInProd var → result.ok=false
 *   - In other modes: warnings only, result.ok=true
 *
 * The caller is responsible for exiting the process if !result.ok.
 */
export function validateEnvironment(): EnvValidationResult {
  const isProd = process.env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const v of REQUIRED_VARS) {
    const value = process.env[v.name];
    if (!value || !v.validate(value)) {
      const msg = `${v.name}: ${v.requirement} (got: ${value ? "<invalid>" : "<missing>"})`;
      if (isProd && v.requiredInProd) {
        errors.push(msg);
      } else if (v.requiredInProd) {
        warnings.push(`(dev-mode) ${msg}`);
      } else {
        warnings.push(msg);
      }
    }
  }

  // Additional: in production, DATABASE_URL must NOT be SQLite
  if (isProd && process.env.DATABASE_URL?.startsWith("file:")) {
    errors.push("DATABASE_URL must be PostgreSQL in production (got file: SQLite URL)");
  }

  // Additional: AI_FALLBACK_TO_MOCK must NOT be true in production
  if (isProd && process.env.AI_FALLBACK_TO_MOCK === "true") {
    warnings.push("AI_FALLBACK_TO_MOCK=true in production — AI failures will return mock responses");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    source: process.env.AI_ENCRYPTION_KEY ? "env" : "missing",
  };
}

/**
 * Print the validation result to stdout/stderr in a uniform format.
 * Returns the exit code: 0 if ok, 1 if errors.
 */
export function reportValidation(result: EnvValidationResult): number {
  for (const w of result.warnings) {
    console.warn(`[MVMP env] WARN: ${w}`);
  }
  for (const e of result.errors) {
    console.error(`[MVMP env] FATAL: ${e}`);
  }
  if (result.ok) {
    console.log(`[MVMP env] Environment validated (NODE_ENV=${process.env.NODE_ENV || "development"}, source=${result.source}).`);
    return 0;
  }
  console.error("[MVMP env] Refusing to start — fix the FATAL errors above and restart.");
  return 1;
}
