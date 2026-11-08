# G6 — R-01 DASHBOARD REMEDIATION SPECIFICATION REVIEW

**Reviewer role:** Independent technical reviewer (read-only)  
**Verdict:** APPROVE WITH CONDITIONS. The root cause and direction are correct; the
spec has one internal inconsistency, one role-model gap, and one area that needs
tighter query mapping before code is written.

---

## 1. What was checked

- `docs/project-analysis/gate-1b/00_R01_DASHBOARD_REMEDIATION_SPEC.md`
- `src/app/api/dashboard/route.ts`
- `src/lib/auth.ts`
- `src/lib/tenant-scope.ts`
- `src/lib/rbac.ts`
- `prisma/schema.prisma` (User, Customer, Reseller, Transaction, AuditLog,
  ServerMetric, Notification, VpnAccount, UserRole, Role, Permission,
  RolePermission, UserPermission)
- `src/lib/utils-mvmp.ts` (serialize)
- `docs/project-analysis/15_INDEPENDENT_AUDIT_VALIDATION.md`
- `docs/project-analysis/16_SECURITY_REMEDIATION_BLUEPRINT.md`
- `docs/project-analysis/gate-0/00_GATE0_EXECUTIVE_REPORT.md`
- `docs/project-analysis/gate-0/02_RESIDUAL_FINDINGS_VERIFICATION.md`
- `docs/project-analysis/gate-0/03_PROJECT_BASELINE.md`
- `docs/project-analysis/gate-0/05_TEST_HARNESS_PLAN.md`
- `docs/project-analysis/gate-0/06_GATE1_IMPLEMENTATION_READINESS.md`

---

## 2. Root cause verification

### 2.1 Route and handler
The spec points at `src/app/api/dashboard/route.ts` and the `GET()` handler.
Correct.

### 2.2 Authentication and authorization
The spec correctly notes:
- `getSessionUser()` provides the user
- `hasPermission(user.role, "dashboard.view")` is the only authZ check before
  data is fetched

This matches the code.

### 2.3 Queries
The spec lists:
- `db.transaction.count()`
- `db.transaction.findMany({ take:5, orderBy: createdAt desc, include customer + payments })`
- `db.auditLog.findMany({ take:5, orderBy: createdAt desc, include user })`
- `db.serverMetric.findMany(... include server)`

All of these are present in the code and all are unscoped. Correct.

### 2.4 Exposed data
The spec correctly identifies:
- `recentTransactions` includes `customer.name`, `customer.email`,
  `customer.customerCode`, and payment fields
- `recentAuditLogs` includes `user.name` and `user.role`
- Server metrics are included with server details

Note on serialization: `serialize()` in `utils-mvmp.ts` only converts BigInt/Date
to JSON-safe values. It does not strip relations or PII. So the Prisma
`include` directly determines what leaks. The spec is right to flag this.

### 2.5 Roles affected
The spec correctly identifies CUSTOMER and RESELLER as the hardest hit, with
STAFF needing review and ADMIN/SUPER_ADMIN less affected.

### 2.6 Conclusion on root cause
Root cause is correctly identified and well supported by the code.

---

## 3. Authorization matrix review

### 3.1 Roles used
The spec uses SUPER_ADMIN, ADMIN, STAFF, RESELLER, CUSTOMER only. This matches
the `ROLE_PERMISSIONS` table in `auth.ts`, which is the static role model the
dashboard currently uses.

### 3.2 Real role universe
The schema `UserRole` enum has seven values:
- SUPER_ADMIN
- ADMIN
- OPERATOR
- FINANCE
- CUSTOMER_SERVICE
- RESELLER
- CUSTOMER

The dashboard spec does not use OPERATOR, FINANCE, or CUSTOMER_SERVICE. That is
acceptable for the dashboard if the project intends those roles to be handled like
other staff roles. But the spec should explicitly say so, because the dashboard
today would receive those roles from `user.role` and the static matrix would treat
them as undefined/blocked unless mapped.

### 3.3 STAFF inconsistency
The spec contains an internal inconsistency:
- In section C, the matrix lists STAFF with `Can see platform stats: No`.
- In `auth-matrix.ts` and in section E, STAFF is described as able to see
  platform stats in some places and not in others.

This must be resolved before implementation because it changes the STAFF response
contract. The review cannot assume which one the owner wants.

### 3.4 Staff role semantics
`tenant-scope.ts` defines `STAFF_ROLES` as
`SUPER_ADMIN, ADMIN, OPERATOR, FINANCE, CUSTOMER_SERVICE` and treats them as
`{ kind: "all" }`. There is no role literally named `STAFF` in that set. So the
dashboard spec's use of `STAFF` is a business-role label, not a verbatim
`user.role` value, unless the project actually uses a role called `STAFF`.

This is a real gap: the spec should either:
- use the exact `user.role` values that exist, or
- define a clear mapping from `user.role` to dashboard access classes

---

## 4. Tenant isolation review

### 4.1 Principle
The spec correctly insists that tenant scope must enter the database query, not
be applied after fetching global results.

### 4.2 Existing utilities
The spec references `resolveTenantScope`, `customerScopeWhere`,
`customerOwnedScopeWhere`, and `canAccess*` helpers in `tenant-scope.ts`. These
exist and are already used by other routes. That is a good reuse target.

### 4.3 Current dashboard does not use them
The current dashboard does not call any tenant-scope helper. So the fix is not
just a configuration change; it requires introducing scope into the handler.

### 4.4 Reseller subtree
The spec correctly notes that a reseller subtree should be scoped through
`resellerIds[]`. `resolveTenantScope` already implements a BFS with depth limit.
That is appropriate.

### 4.5 Customer-only access
For CUSTOMER, the spec correctly says the customer should see only their own data.
`resolveTenantScope` derives `customerId` from `user.id` via the Customer model.
That is correct.

### 4.6 Fail-closed
The spec correctly requires fail-closed behavior when tenant context cannot be
derived. This is important and should be explicitly implemented, not left to the
existing global queries.

---

## 5. Response contract review

### 5.1 Fields by role
The section is directionally correct. It should be tightened to list exactly which
top-level `data` fields remain for each role, because the current response object
has many fields:
- stats
- recentAuditLogs
- recentTransactions
- serverMetrics
- revenueTrend
- notificationsUnread
- aggregate

### 5.2 Notification count
The current handler includes `notificationsUnread`, which is already user-scoped
by `userId`. That field is not a cross-tenant leak by itself. The spec should say
whether it stays for all roles or is hidden for some. As written, the spec is
silent on it.

### 5.3 Revenue trend
The revenue trend query in the code is `db.transaction.findMany({ where: { status:
"PAID", createdAt: { gte: sixMonthsAgo } }, select: { amount, createdAt,
currency } })`. This is also unscoped and platform-wide. The spec should list
revenueTrend explicitly as platform-wide data that must be scoped or hidden for
non-platform roles.

### 5.4 Nested relations
The spec correctly warns about nested relations and Prisma includes. The fix must
avoid accidentally returning `customer` or `payments` inside a transaction list
for roles that should not see them. In practice, the fix may need to either drop
the `include` or reshape the returned objects per role.

---

## 6. Regression test plan review

### 6.1 Coverage
The spec lists 10 regression tests. This is a strong start.

### 6.2 What is missing or ambiguous
- The test plan should explicitly include the STAFF-platform-stats case, because
  the matrix is currently inconsistent.
- The test plan should include `revenueTrend` as platform data that must be scoped
  or hidden.
- The test plan should include the notification count behavior.
- The test plan should include the case where a CUSTOMER has no customer record
  (fail closed), because `resolveTenantScope` can return `{ kind: "none" }`.
- The test plan should include the case where a RESELLER has no reseller record.
- The test plan should distinguish between "field omitted" and "field present but
  scoped," because both are valid remediation strategies and tests must match the
  chosen one.

### 6.3 Traceability
Each test should be traceable to a specific field and a specific query. The spec
is close to that but not fully explicit yet.

---

## 7. Compatibility and regression risk review

### 7.1 Frontend impact
The frontend likely consumes the full dashboard payload. If fields are removed for
some roles, the frontend must tolerate missing fields. The spec identifies this
risk. The owner must confirm frontend tolerance or assign frontend updates.

### 7.2 Staff operational impact
If STAFF loses platform totals, staff operations may be affected. The owner must
confirm intended STAFF visibility.

### 7.3 Performance
Adding tenant filters is generally low cost. Reseller subtree resolution is
already implemented in `resolveTenantScope` and has a depth limit. The spec's
performance assessment is reasonable.

### 7.4 Admin/Super admin regression
The spec should explicitly preserve ADMIN and SUPER_ADMIN visibility unless the
owner wants to change it. As written, the spec mostly preserves them, which is
correct.

---

## 8. Conditions

1. Resolve the STAFF platform-stats inconsistency.
2. Clarify the role model: either use exact `user.role` values or define the
   mapping from `UserRole` enum to dashboard access classes.
3. Explicitly list the full response shape per role, including `notificationsUnread`
   and `revenueTrend`.
4. Expand the regression test plan to cover the STAFF case, revenue trend,
   notification count, empty-scope fail-closed, and missing-customer/ missing-
   reseller cases.
5. Map each regression test to a specific query and a specific field.

---

## 9. Status

**APPROVE WITH CONDITIONS**

The specification is fundamentally correct and well aligned with the actual route,
utilities, and schema. It is safe to approve for the next step — owner decision —
provided the conditions above are addressed before implementation.

---

G6 INDEPENDENT REVIEW COMPLETED — OWNER DECISION REQUIRED — NO NEW IMPLEMENTATION STARTED.
