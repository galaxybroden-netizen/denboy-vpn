// MVMP — Next.js instrumentation hook (runs once on server startup)
//
// Next.js 16 calls this file on the server side before handling any request.
// We use it to validate production environment on startup — if a required
// secret is missing or invalid, the process exits with a non-zero code
// instead of silently running in a degraded state.
//
// Phase 14 TASK 2: validation logic delegated to src/lib/env-validate.ts
// so both Docker and Native deployments share the exact same checks.
//
// See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

import { validateEnvironment, reportValidation } from "@/lib/env-validate";

export async function register() {
  // Only run on server (not during build client-side)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const result = validateEnvironment();
  const exitCode = reportValidation(result);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
