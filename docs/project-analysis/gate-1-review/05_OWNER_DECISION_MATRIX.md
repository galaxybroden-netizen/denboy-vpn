# G6 — OWNER DECISION MATRIX

**Reviewer role:** Independent technical reviewer (read-only)  
**Purpose:** give the owner a clear set of decisions, and make clear that approving
a document is not the same as approving implementation.

---

## 1. Status table

| Workstream | Review status | Implementation permission |
|---|---|---|
| Gate 1A Test Harness | APPROVE WITH CONDITIONS | NOT YET — conditions must be cleared first |
| R-01 Dashboard Specification | APPROVE WITH CONDITIONS | NO — owner must approve implementation separately after this review |
| Next.js Security Upgrade Plan | APPROVE WITH CONDITIONS | NO — owner must approve target version and exposure assessment separately |

---

## 2. What each "yes" would mean

### 2.1 Gate 1A
A "yes" here means:
- The harness may be kept as the project's minimal test foundation.
- The conditions in the Gate 1A review should be cleared before the harness is
  used as a green CI baseline.

A "yes" does NOT mean:
- The harness is already a complete security-testing platform.
- The failure-behavior test is already safe for default CI.

### 2.2 R-01
A "yes" here means:
- The reviewer finds the specification technically sound enough to proceed to
  owner decision on implementation.
- The owner may then decide whether to approve implementation after the
  conditions are addressed.

A "yes" does NOT mean:
- The dashboard fix is approved.
- The dashboard fix is implemented.
- The dashboard fix is verified.

### 2.3 Next.js
A "yes" here means:
- The plan structure is acceptable.
- The owner may approve a target version and exposure assessment and then
  authorize implementation as a separate change.

A "yes" does NOT mean:
- The project should upgrade immediately.
- The target version is already chosen for the owner.
- The upgrade is safe without its own build and runtime verification.

---

## 3. Owner decisions required

### 3.1 Gate 1A
1. Approve the harness as the minimal test foundation.
2. Approve the plan to move or isolate the failure-behavior test so default CI is
   not permanently red.
3. Approve the statement that the smoke test is a harness sanity check, not a
   security regression test.
4. Approve the future expansion path (integration-style tests, then security
   tests) as a later step.

### 3.2 R-01
1. Confirm how OPERATOR, FINANCE, and CUSTOMER_SERVICE should appear in dashboard
   access, since the spec currently uses a five-role model.
2. Resolve the STAFF platform-stats inconsistency: should STAFF see platform
   totals or not.
3. Confirm the full per-role response shape, including `notificationsUnread` and
   `revenueTrend`.
4. Confirm frontend tolerance for missing fields, or assign frontend updates.
5. Approve the regression test plan, including the additional cases noted in the
   review.
6. Approve implementation separately after the above.

### 3.3 Next.js
1. Confirm production host OS, because the Windows advisory is host-OS-dependent.
2. Confirm whether the project uses image optimization and whether it uses
   `use cache` / Cache Component.
3. Approve a target version. Based on advisory evidence, the reviewer's current
   view is that 16.4.1 is the smallest 16.x version covering all four advisories,
   but the owner must confirm.
4. Approve the expected code/config changes at that target before implementation.
5. Approve the upgrade as a separate change from R-01.

---

## 4. Distinction between approval stages

### 4.1 Document approved
The document is clear enough and technically reasonable enough to be used as the
basis for the next step.

### 4.2 Design approved
The approach, role model, response contract, and test plan are approved enough to
guide implementation.

### 4.3 Implementation approved
The owner has given explicit permission to change code or configuration.

### 4.4 Implementation completed
The change has been made.

### 4.5 Implementation verified
The change has been checked by the agreed tests and runtime verification.

These are not interchangeable. At this point:
- Gate 1A document: approved with conditions
- R-01 design: conditionally approved pending owner clarifications
- R-01 implementation: NOT approved
- Next.js plan: approved with conditions
- Next.js implementation: NOT approved

---

## 5. Conditions summary

### Gate 1A conditions
- Remove the default-CI red status caused by the failure-behavior test.
- Do not overstate the smoke test as security coverage.

### R-01 conditions
- Resolve STAFF platform-stats inconsistency.
- Clarify role model for OPERATOR/FINANCE/CUSTOMER_SERVICE.
- Tighten per-role response contract.
- Expand regression test plan.

### Next.js conditions
- State a recommended target version.
- Add project-specific exposure assessment.
- Keep the upgrade separate from R-01.

---

## 6. Stop condition honored

No code, configuration, schema, lockfile, or test file was modified during this
review. No implementation was started. No deployment occurred.

---

G6 INDEPENDENT REVIEW COMPLETED — OWNER DECISION REQUIRED — NO NEW IMPLEMENTATION STARTED.
