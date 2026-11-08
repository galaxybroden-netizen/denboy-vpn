# Next.js Security Upgrade Plan

**Status:** READY FOR OWNER REVIEW — NOT EXECUTED  
**Related advisory:** Gate 0 identified four critical RCE advisories in the current
Next.js dependency. This plan is separate from Gate 1A and R-01.

---

## 1. Objective

Define a safe, reviewed-before-execution plan to upgrade Next.js to a version that
addresses the critical advisories identified at Gate 0, without combining this work
with the security refactor or any other change.

---

## 2. Current baseline (to confirm against lockfile)

Before execution, the following must be confirmed against `package-lock.json` /
`bun.lockb` and `package.json`:

- Current Next.js version in `package.json` (reported as 16.1.1 at Gate 0)
- Current React version
- Any other framework dependencies that ship with Next.js (e.g., `@next/env`,
  `@next/swc-*`, `postcss`, `sharp`, `nanoid`, etc.)
- The exact resolved versions in the lockfile, not just the range in
  `package.json`
- The lockfile format and package manager in use

---

## 3. Security advisory mapping

Gate 0 identified the following advisories as critical and associated with the
current Next.js version:

1. GHSA-p293-qw3h-jr36 — unauthenticated RCE on Windows-hosted servers
2. GHSA-2xp9-vwfh-vxw4 — unauthenticated RCE in Image Optimization (AVIF)
3. GHSA-2464-fhr4-w9xw — unauthenticated RCE in Image Optimization (SVG)
4. GHSA-673q-mjm6-r5xr — unauthenticated RCE in `use cache` returning typed arrays

For each advisory, the plan must record:
- Advisory identifier
- Affected version range
- Fixed version
- Whether the project is actually affected given its runtime platform and feature
  usage
- Whether the vulnerability requires authentication, a specific endpoint, or a
  specific feature to be exploitable

The plan must distinguish:
- Confirmed vulnerability (advisory applies to the version in use)
- Potentially affected dependency (indirect dependency with an advisory)
- Fixed version (the version that resolves the advisory)
- Unverified runtime exposure (advisory applies in theory, but project may not
  expose the relevant surface)

---

## 4. Recommended target version

The recommendation must be derived from the advisories and official Next.js release
notes, not from memory. The target version must:

- Be a version that is documented as fixing the identified advisories
- Be compatible with the current React version, or include a React upgrade that is
  itself safe and reviewed
- Be within a supported Next.js major/minor line if possible, to minimize breaking
  changes

The exact target version will be recorded in the plan after confirming advisory
status and release notes.

---

## 5. Compatibility assessment

The plan must assess:

### 5.1 React compatibility
- Current React version
- React version required by the target Next.js
- Whether React must be upgraded together with Next.js
- Any known React API changes that affect the codebase

### 5.2 Next.js 16 compatibility requirements
- Breaking changes introduced in the target Next.js line
- Changes to `next.config.ts` options that the project uses
- Changes to server routes, route handlers, or middleware behavior
- Changes to static generation, ISR, or caching semantics
- Changes to build output or standalone mode that affect `docker-compose` or the
  production image

### 5.3 Bun and Node compatibility
- Whether the target Next.js builds and runs under the current Bun version
- Whether any build step requires Node
- Whether the production startup command remains valid

### 5.4 Project-specific features
- Image Optimization usage (since two advisories are in image optimization)
- `use cache` usage (since one advisory is in `use cache`)
- Any app that depends on Next.js internals or undocumented behavior

---

## 6. Required code changes, if any

Depending on the target version, the plan may require:

- Updates to `next.config.ts`
- Updates to route handlers or middleware if behavior changed
- Updates to image optimization usage if the project relies on it
- Updates to caching or `use cache` usage if the project relies on it
- Dependency updates for peer dependencies

Any required code change must be listed explicitly before execution, and must be
reviewed separately from the dependency upgrade.

---

## 7. Lockfile update strategy

The plan must specify:

- Which package manager command updates the lockfile
- Whether the lockfile is committed
- Whether the upgrade is done in a dedicated commit
- How to review the diff before committing

---

## 8. Build verification plan

Before any deployment, the plan must include:

- A clean build with the upgraded dependency
- Verification that the build output is valid
- Verification that the app starts and serves a basic route
- Verification that image optimization, if used, still works
- Verification that the build is compatible with the deployment image

---

## 9. Regression test plan

The plan must include:

- Running the existing test suite (Gate 1A harness) against the upgraded app
- Basic runtime checks for the pages/endpoints the app exposes
- Any app-specific smoke tests needed to confirm no regression

The existing Gate 1A tests may be reused where applicable.

---

## 10. Deployment strategy

The plan must specify:

- How the upgraded app is deployed (image rebuild, standalone output, etc.)
- Whether the deployment can be rolled back by redeploying the previous image
- Whether the deployment requires a maintenance window

---

## 11. Rollback plan

- Keep the previous lockfile and previous image available until the upgrade is
  verified in production.
- Rollback by redeploying the previous image and restoring the previous lockfile.
- If the upgrade introduces a build failure, do not deploy; revert the dependency
  change and rebuild.

---

## 12. Owner decisions required

Before execution, the owner must:

1. Approve the target version after reviewing the advisory mapping and release
   notes.
2. Approve any required React upgrade, if applicable.
3. Approve any required code changes.
4. Approve the deployment timing.
5. Confirm separate approval for this workstream, distinct from Gate 1A and R-01.

---

## 13. Stop condition

This plan is research and documentation only. No dependency is upgraded, no
`package.json` is changed, no lockfile is changed, and no build is run until the
owner approves the plan and the target version.
