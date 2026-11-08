# R-01 — DASHBOARD LEAK REMEDIATION SPECIFICATION

**Status:** READY FOR OWNER REVIEW — NOT IMPLEMENTED  
**Root cause identified:** `/api/dashboard` returns tenant-scoped and staff-only
data to CUSTOMER and RESELLER roles without tenant filtering.  
**Stop condition:** no production dashboard code is modified until the owner
approves this specification.

---

## A. Root cause

### A.1 Vulnerable route

- `src/app/api/dashboard/route.ts` — `GET /api/dashboard`

### A.2 Functions and flow

1. `GET()` handler at `src/app/api/dashboard/route.ts:10`
2. Authentication via `getSessionUser()` at line 18
3. Authorization via `hasPermission(user.role, "dashboard.view")` at line 25
4. Global aggregates and tenant-scoped rows fetched without tenant scope:
   - `db.transaction.count()` — platforms-wide count (line 37)
   - `db.transaction.findMany({ take: 5, orderBy: createdAt desc, include customer + payments })` (lines 46–53)
   - `db.auditLog.findMany({ take: 5, orderBy: createdAt desc, include user })` (lines 44–50)
   - `db.serverMetric.findMany(...)` (lines 55–61)
5. Response assembled and returned at lines 124–155

### A.3 Query behavior

The handler fetches:
- Platform-wide counts (servers, vpn accounts, customers, resellers,
  transactions, revenue, protocols)
- Recent audit logs (5 latest, with user name + role) — staff activity
- Recent transactions (5 latest, with customer name, email, customer code, and
  payment details) — other customers' personal and financial data
- Server metrics (per-server) — infrastructure detail

These queries have **no tenant filter**. They return data from all tenants and
from staff activity, regardless of the requesting role.

### A.4 Exposed fields

#### A.4.1 recentTransactions (PII leak to CUSTOMER and RESELLER)
Each recent transaction includes:
- `customer.name`
- `customer.email`
- `customer.customerCode`
- `payments[].id`, `payments[].provider`, `payments[].status`, `payments[].amount`

This exposes other customers' identities and payment information to any role
with `dashboard.view` — which includes CUSTOMER and RESELLER.

#### A.4.2 recentAuditLogs (staff activity leak to CUSTOMER and RESELLER)
Each audit log includes:
- `user.name`
- `user.role`

This exposes staff identities and roles to CUSTOMER and RESELLER.

#### A.4.3 serverMetrics (infrastructure detail)
`serverMetric` rows include per-server operational data. While not directly PII,
this can aid reconnaissance.

### A.5 Roles affected

| Role        | Impact                                                                 |
|-------------|------------------------------------------------------------------------|
| CUSTOMER    | Sees other customers' transactions (name, email, customer code, payments), staff audit logs, platform counts |
| RESELLER    | Sees other resellers' customers' transactions, staff audit logs, and platform-level data |
| STAFF       | Sees other customers' transactions and staff audit logs; may be acceptable for operations but must be reviewed |
| ADMIN       | Sees platform-wide data; likely intended, but recent transactions and audit logs may still need scoping by reseller context |
| SUPER_ADMIN | Sees platform-wide data; intended |

The hardest-affected roles are CUSTOMER and RESELLER, which receive data well
beyond their tenant boundary.

### A.6 Tenant boundaries violated

- CUSTOMER may view other CUSTOMER records' personal and financial data.
- RESELLER may view other RESELLER subtrees' data.
- STAFF may view other customers' transactions and staff audit logs in a way
  that may cross operational boundaries.
- No customer or reseller context is derived from the session before querying.

---

## B. Data classification

### B.1 Platform-wide data
- counts: servers, vpn accounts, customers, resellers, transactions, protocols
- total revenue aggregate
- revenue trend (6-month aggregate)

These are acceptable for SUPER_ADMIN and ADMIN. For STAFF, RESELLER, CUSTOMER
they should either be hidden or replaced with tenant-scoped aggregates.

### B.2 Tenant-owned data
- Transaction rows belonging to a customer or reseller subtree
- Vpn account rows belonging to a customer/reseller
- Customer rows within a reseller subtree

These must be scoped. A CUSTOMER should only see their own data; a RESELLER
should only see their subtree.

### B.3 Staff-only data
- Recent audit logs (staff activity)
- Staff identities (user name, role) in audit logs

These must not be exposed to CUSTOMER or RESELLER. STAFF and above may have
limited access under review.

### B.4 Public or non-sensitive data
- Generic error messages
- Aggregate counts that are explicitly platform-visible to all authorized roles
  (only for SUPER_ADMIN/ADMIN, if at all)

---

## C. Proposed authorization matrix

| Role        | Can see platform stats | Can see own tenant data | Can see other tenants' data | Can see staff audit logs |
|-------------|------------------------|-------------------------|-----------------------------|--------------------------|
| SUPER_ADMIN | Yes                    | Yes (all)               | Yes (all)                   | Yes                      |
| ADMIN       | Yes                    | Yes (all)               | Yes (all)                   | Yes                      |
| STAFF       | No (own scope only)    | Yes (own scope)         | No                          | Yes (own activity review)|
| RESELLER    | No                     | Yes (own subtree)       | No                          | No                       |
| CUSTOMER    | No                     | Yes (own only)          | No                          | No                       |

Notes:
- STAFF access to other customers' transactions is NOT granted by default.
- The matrix must be reviewed by the owner before implementation because STAFF
  operational needs may differ.
- SUPER_ADMIN and ADMIN retain full visibility because they are platform-level
  roles.

---

## D. Tenant isolation design

### D.1 How tenant identity is derived
- From `getSessionUser()` we obtain the user and their role.
- For CUSTOMER: derive customer ID from `user.customerId` (or via the user's
  linked customer record).
- For RESELLER: derive reseller subtree from `user.resellerId` and the
  `parentResellerId` hierarchy (existing `resolveTenantScope` in
  `src/lib/tenant-scope.ts`).
- For STAFF/ADMIN: derive the reseller subtree if they are assigned to one;
  otherwise treat as platform.
- For SUPER_ADMIN: no tenant filter.

### D.2 How scope enters database queries
- `recentTransactions`: add `where` that scopes by customer or reseller subtree.
  Use existing `customerOwnedScopeWhere` / `customerScopeWhere` helpers in
  `src/lib/tenant-scope.ts`.
- `recentAuditLogs`: scope by actor user when the role is below platform level,
  or hide entirely for CUSTOMER/RESELLER.
- `serverMetrics`: hide from CUSTOMER/RESELLER; optionally scope to the
  reseller's servers for RESELLER.
- Platform counts: hide `total` platform counts from CUSTOMER/RESELLER; replace
  with tenant-scoped counts.

### D.3 How reseller hierarchy is handled
- Use existing `resolveTenantScope(user)` which returns a `TenantScope` with
  `kind`, `resellerId`, and `resellerIds[]` for resellers.
- For a CUSTOMER who belongs to a reseller, the customer's data is within the
  reseller subtree; the customer should only see their own customer record, not
  the whole subtree (unless the business wants otherwise, which the owner must
  decide).
- For a RESELLER, scope to their subtree via `resellerIds[]`.

### D.4 How customer ownership is enforced
- A CUSTOMER's `recentTransactions` must be filtered to that customer's
  `customerId`.
- `recentAuditLogs` must not include other customers' data.

### D.5 How staff audit logs are restricted
- `recentAuditLogs` must be hidden from CUSTOMER and RESELLER.
- For STAFF, the existing audit log view should be reviewed: showing all staff
  audit logs may be acceptable operationally, but the spec should be confirmed
  by the owner.

### D.6 How unauthorized resource access is handled
- If a CUSTOMER tries to access another customer's data through any other endpoint,
  that is a separate issue. This spec only addresses the dashboard.
- The fix must fail closed: if tenant context cannot be derived, return an error
  rather than showing global data.

---

## E. Response contract

### E.1 Fields by role

#### SUPER_ADMIN / ADMIN
- platform stats: yes
- recentTransactions: yes, unless business wants scoping (owner decision)
- recentAuditLogs: yes
- serverMetrics: yes

#### STAFF
- platform stats: no (replace with own-scope aggregates or hide)
- recentTransactions: no (own scope only, if any)
- recentAuditLogs: yes (subject to owner confirmation)
- serverMetrics: no

#### RESELLER
- platform stats: no
- recentTransactions: own subtree only
- recentAuditLogs: no
- serverMetrics: own reseller's servers only, if applicable

#### CUSTOMER
- platform stats: no
- recentTransactions: own customer only
- recentAuditLogs: no
- serverMetrics: no

### E.2 Preventing accidental disclosure

- Do not return `recentTransactions` with nested `customer` and `payments` to
  CUSTOMER or RESELLER.
- Do not return `recentAuditLogs` to CUSTOMER or RESELLER.
- Do not return platform-level `total` counts to CUSTOMER or RESELLER.
- Error messages must not leak whether a resource exists or who owns it.
- Aggregates must be computed after tenant scoping, not before.

---

## F. Regression test plan

The following tests must be added to `tests/security/` (not in this spec
implementation, but specified now so they are ready):

1. CUSTOMER_A cannot see CUSTOMER_B transactions.
2. CUSTOMER_A cannot see CUSTOMER_B identity (name, email, customer code).
3. CUSTOMER cannot see staff audit logs.
4. RESELLER cannot see unrelated reseller subtree data.
5. SUPER_ADMIN retains authorized platform visibility.
6. Empty tenant scope fails closed (no global data returned).
7. Missing principal fails closed (401/403, not partial data).
8. Nested relations cannot bypass tenant restrictions (payments.customer not
   reachable via a scoped transaction query).
9. Aggregates do not leak cross-tenant information.
10. Pagination and sorting cannot bypass tenant filters.

These tests will use the existing fixtures in `tests/setup/factory.ts` and the
principal helpers in `tests/helpers/principal.ts`.

---

## G. Implementation plan

### G.1 Files to change
- `src/app/api/dashboard/route.ts` — apply tenant scoping and response shaping.

### G.2 Functions to change
- `GET()` in `src/app/api/dashboard/route.ts`
- Possibly extract a `buildDashboardResponse(user, db)` helper to keep the
  handler readable and testable.

### G.3 Query changes
- Scope `recentTransactions` by customer/reseller.
- Scope or hide `recentAuditLogs`.
- Scope or hide `serverMetrics`.
- Replace platform counts with tenant-scoped counts for CUSTOMER/RESELLER.

### G.4 Response changes
- Remove or restrict `recentTransactions`, `recentAuditLogs`, `serverMetrics`,
  and platform `total` counts based on role.
- Keep `success: true` shape consistent.

### G.5 Reuse of existing tenant-scope utilities
- Reuse `resolveTenantScope(user)` from `src/lib/tenant-scope.ts`.
- Reuse `customerScopeWhere`, `customerOwnedScopeWhere`, `canAccess*` helpers
  where applicable.

### G.6 Compatibility considerations
- Existing ADMIN/SUPER_ADMIN dashboards may change if platform stats are hidden
  from STAFF. Owner must confirm STAFF's intended visibility.
- Frontend consumers of `/api/dashboard` may rely on fields that will be removed
  for CUSTOMER/RESELLER. The owner must confirm frontend tolerance or update.

### G.7 Rollback approach
- The change is confined to one route file. Rolled back by reverting that file.
- Because this is a read-only endpoint, rollback does not affect data integrity.

---

## H. Acceptance criteria

Every role must have explicit positive and negative test cases:

| Role        | Positive case                              | Negative case                                        |
|-------------|--------------------------------------------|------------------------------------------------------|
| CUSTOMER    | Sees own data only                         | Cannot see other customer data or staff logs         |
| RESELLER    | Sees own subtree data only                 | Cannot see other reseller data or staff logs         |
| STAFF       | Sees own scope data; audit logs (if allowed)| Cannot see other customers' transactions            |
| ADMIN       | Sees platform data as intended             | (Review if any scoping needed)                       |
| SUPER_ADMIN | Sees platform data as intended             | (No regression)                                      |

All tests from section F must pass.

---

## I. Risk assessment

### I.1 Data exposure
- Current risk: HIGH. CUSTOMER and RESELLER can see other customers' PII and
  payment info, and staff audit logs.
- After fix: LOW for CUSTOMER/RESELLER; residual risk for STAFF/ADMIN must be
  reviewed.

### I.2 Staff operational impact
- If STAFF loses access to recent transactions or audit logs, operations may be
  impacted. Owner must confirm desired STAFF visibility.

### I.3 Dashboard compatibility
- Frontend may break if it expects fields now removed for some roles. Owner must
  confirm or update frontend.

### I.4 Performance
- Adding tenant filters to queries is low risk. Scoping reseller subtree may add
  a small lookup, but existing utilities already implement it.

### I.5 Query behavior
- Tenant-scoped queries must still return correct aggregates. Testing must cover
  empty scopes (no data) and normal scopes.

### I.6 Regression risk
- Low, because the change is confined to one route. Risk increases if ADMIN/
  SUPER_ADMIN behavior is altered. Owner must confirm intended behavior for those
  roles.

---

## Owner decision required

Before any code is changed, the owner must:
1. Confirm the authorization matrix, especially STAFF and ADMIN visibility.
2. Confirm whether ADMIN should still see platform-wide recent transactions and
   audit logs.
3. Confirm frontend impact tolerance or agree to update the frontend.
4. Approve the regression test plan.

Once approved, implementation can proceed in a subsequent step, with the tests
from section F added alongside the fix.
