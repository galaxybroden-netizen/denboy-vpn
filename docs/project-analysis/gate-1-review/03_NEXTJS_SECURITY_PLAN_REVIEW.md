# G6 — NEXT.JS SECURITY UPGRADE PLAN REVIEW

**Reviewer role:** Independent technical reviewer (read-only)  
**Verdict:** APPROVE WITH CONDITIONS. The plan is a sound skeleton, but it is not
yet a decision-ready target because it does not state a single recommended version
and it does not yet assess project-specific exposure in enough detail.

---

## 1. What was checked

- `docs/project-analysis/nextjs-security-upgrade/00_NEXTJS_SECURITY_UPGRADE_PLAN.md`
- `package.json`
- `bun.lock`
- `bun pm ls` output
- `tsconfig.json`
- `next.config.ts`
- `deploy/docker/docker-compose.yml` (existence/reference check only)
- Public advisory evidence for the four GHSA IDs listed in the plan

No dependency was changed. No lockfile was modified. No build was run.

---

## 2. Actual dependency baseline

From `package.json` and `bun pm ls`:

- next: 16.1.1
- react: 19.3.1
- react-dom: 19.3.1
- sharp: 0.34.5
- eslint-config-next: 16.4.5
- typescript: 5.9.3
- prisma: 6.19.3
- @prisma/client: 6.19.3
- bullmq: 6.7.1
- ioredis: 6.0.0
- next-auth: 4.24.15
- next-intl: 4.14.9
- tailwindcss: 4.3.5
- @tailwindcss/postcss: 4.3.5

This is more precise than the plan's "confirm against lockfile" placeholder. The
reviewer can now state the actual current versions.

---

## 3. Advisory evidence

The four advisories named in the plan were checked against public advisory sources.

### 3.1 GHSA-p293-qw3h-jr36
- Title: Unauthenticated Remote Code Execution on windows-hosted servers
- Published: 2026-08-25
- Affected: `>= 13.4 < 15.5.24` and `>= 16.0 < 16.3.3`
- Patched: 15.5.24 and 16.3.3
- CVE: CVE-2026-75604
- CVSS: 9.0 (Critical)
- Workaround: none for affected Windows-hosted apps
- Source: GitHub advisory page

Relevance to this project: the project's `package.json` lists Windows under
supported platforms in earlier documentation, and the project's Docker
configuration and production environment still need owner confirmation of the
host OS. If the production host is Windows, this advisory is directly
actionable. If the production host is Linux, the reviewer should still treat it
as high priority because OS assumptions can change.

### 3.2 GHSA-2xp9-vwfh-vxw4
- Title: Unauthenticated RCE in Image Optimization API when AVIF files are used
- Published: 2026-08-25
- Affected: `>= 10.0.0 < 15.5.24` and `>= 16.0.0 < 16.3.3`
- Patched: 15.5.24 and 16.3.3
- CVSS: 9.5 (Critical)
- Source: GitHub advisory page

Relevance: depends on whether the app uses image optimization and accepts AVIF.
The project has `sharp` in dependencies, which is related to image processing.

### 3.3 GHSA-2464-fhr4-w9xw
- Title: Unauthenticated RCE in Image Optimization API when SVG files are used
- Published: 2026-10-14
- Affected: `>= 10.0.0 < 15.5.28` and `>= 16.0.0 < 16.4.1`
- Patched: 15.5.28 and 16.4.1
- CVSS: 10.0 (Critical) on one source; CVSS:4.0 9.5 on another
- Workaround: ensure sharp >= 0.35.5; upgrading Next.js to patched versions
  brings in a fixed sharp
- Source: GitHub advisory page and GitLab advisory database

Relevance: this is the latest of the image-optimization advisories and has a
wider patch gap. It also ties to sharp, which the project already uses.

### 3.4 GHSA-673q-mjm6-r5xr
- Title: Unauthenticated RCE in `use cache` functions returning typed arrays
- Published: 2026-10-22
- Affected: `>= 16.0.0 < 16.4.1`
- Patched: 16.4.1
- CVSS: 9.5 Critical (CVSS v4)
- Source: OSV and GitHub advisory page

Relevance: depends on whether the project uses the Cache Component with
`use cache` and returns typed arrays. This must be assessed against the codebase
before calling it actionable.

### 3.5 Mixed picture
- Two image-optimization advisories are patched at different versions:
  AVIF at 16.3.3, SVG at 16.4.1.
- The Windows RCE advisory is patched at 16.3.3.
- The `use cache` advisory is patched at 16.4.1.

So if the goal is to address all four, the smallest common patched version in the
16.x line is 16.4.1, not 16.3.3.

---

## 4. Target version reasoning

### 4.1 Smallest version covering all four advisories
- 16.3.3 covers GHSA-p293-qw3h-jr36 and GHSA-2xp9-vwfh-vxw4.
- 16.4.1 covers all four advisories in the 16.x line.

If the project needs all four addressed, 16.4.1 is the smallest 16.x target that
covers them.

### 4.2 Should the project jump to latest?
The plan should not default to "upgrade to latest" without assessing:
- Whether later versions introduce breaking changes the project is not ready for
- Whether the project actually uses the vulnerable features
- Whether the production host OS and deployment model make some advisories more
  or less relevant

The review supports 16.4.1 as the minimum defensible target for full coverage,
but the owner must still approve it after the project-specific assessment.

---

## 5. Compatibility assessment gaps

The plan is a skeleton and defers most compatibility work to the implementation
phase. That is acceptable at plan stage, but the plan should still list the key
questions that will decide feasibility.

### 5.1 React
- Current: React 19.3.1
- Next.js 16.x generally aligns with React 19, but the plan must confirm the
  exact React version constraints for the target Next.js release.
- Any major React API change would affect the codebase.

### 5.2 Image optimization
- The project has `sharp` and may use `next/optimized-image` or image
  optimization routes.
- If it does, the image-optimization advisories are not theoretical.
- If it does not, the project may be able to reduce exposure by disabling
  optimization, but that still leaves the other advisories.

### 5.3 `use cache`
- The plan must check whether the codebase uses `use cache` or Cache Component at
  all, and whether any such function returns typed arrays.
- If not, GHSA-673q-mjm6-r5xr may be less immediately exploitable, but still
  advisable to patch.

### 5.4 Deployment model
- The project uses standalone output and containers in some deployment docs.
- The Windows advisory is host-OS-dependent.
- The owner must confirm production host OS.

### 5.5 Other ecosystem changes
- Upgrading Next.js can pull newer `@next/swc-*`, `postcss`, `sharp`, or other
  transitive dependencies.
- The plan must anticipate lockfile churn and review it.

---

## 6. Isolation review

The plan correctly says this must be independent from:
- Dashboard remediation
- RBAC refactor
- Session hashing
- Payment refactor
- Database migration
- Credential re-encryption

This is the right call. A dependency upgrade should be its own reviewed change
with its own rollback path.

---

## 7. Conditions

1. State a single recommended target version. Based on advisory evidence, the
   reviewer's current view is that 16.4.1 is the smallest 16.x version covering
   all four advisories, but the owner must confirm.
2. Add a project-specific exposure assessment:
   - Does the app use image optimization?
   - Does the app use `use cache` or Cache Component?
   - Does the app return typed arrays from cached functions?
   - What is the production host OS?
3. List the exact code and config changes that are expected at the target
   version before approval.
4. List the exact regression checks that will be run after upgrade, ideally
   reusing Gate 1A tests plus a small runtime smoke check.
5. Re-confirm the lockfile update and rollback approach in concrete terms.

---

## 8. Status

**APPROVE WITH CONDITIONS**

The plan is acceptable as a planning artifact, but it is not yet ready to
authorize an upgrade. The owner must approve the target version and the
project-specific exposure assessment before implementation.

---

G6 INDEPENDENT REVIEW COMPLETED — OWNER DECISION REQUIRED — NO NEW IMPLEMENTATION STARTED.
