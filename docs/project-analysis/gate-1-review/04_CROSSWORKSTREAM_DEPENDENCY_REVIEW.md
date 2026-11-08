# G6 — CROSS-WORKSTREAM DEPENDENCY REVIEW

**Reviewer role:** Independent technical reviewer (read-only)

This review checks whether the three workstreams are mutually consistent and
whether any one of them silently changes the scope or risk of another.

---

## 1. Can the harness host R-01 regression tests?

### 1.1 Yes, with caveats
- The harness has fixtures for users, resellers, customers, transactions, and
  audit logs.
- It has a principal helper and a role/permission matrix.
- It has an in-memory SQLite Prisma path.

That is enough to write R-01 regression tests that exercise scoped queries
through Prisma, and possibly through a route handler if the harness later gains
the ability to invoke handlers in a test context.

### 1.2 What is missing
- No proven ability to invoke the real dashboard handler in a test yet.
- No test yet demonstrates that a CUSTOMER principal cannot receive another
  customer's transaction from a real query.

So the harness is a viable foundation, but R-01 tests are not yet demonstrably
hostable end-to-end.

---

## 2. Will the harness break CI?

### 2.1 Currently, yes, in the default configuration
The failure-behavior test lives in `tests/unit/` and causes `bun test` to exit
non-zero. If CI runs the default command, CI will be permanently red.

This is a concrete cross-workstream risk: the harness was meant to unblock future
testing, but in its current shape it would make a naïve CI pipeline fail on every
run.

### 2.2 Impact on R-01
If R-01 tests are added to the same default path, the same problem can recur if
any test is intentionally red or if any test is expected to fail before the fix is
in.

### 2.3 Recommendation
Decide the CI command explicitly:
- Green-by-default runs should exclude known-failing or work-in-progress tests, or
- failing tests should live outside the default discovery path.

---

## 3. Consistency with the security blueprint

### 3.1 R-01 and WP-01
The blueprint already lists R-01 as part of WP-01 (authorization kernel and
residual tenant scoping). The R-01 spec is consistent with that: it scopes the
dashboard, reuses `tenant-scope.ts`, and points toward a principal-based guard.

### 3.2 Role model mismatch
The blueprint and the current auth system use the full `UserRole` enum in some
places and the static `ROLE_PERMISSIONS` model in others. The R-01 spec uses the
five-role dashboard model. That is acceptable as a dashboard view, but the owner
must decide how OPERATOR, FINANCE, and CUSTOMER_SERVICE fit into dashboard access.
Otherwise implementation may leave those roles with an unintended access class.

### 3.3 Tenant-scope reuse
The R-01 spec's reliance on `resolveTenantScope`, `customerScopeWhere`, and
`customerOwnedScopeWhere` is consistent with the existing architecture. That is a
strength.

---

## 4. Schema and migration risk

### 4.1 R-01 does not need a schema change
The dashboard fix can be done by changing the handler and query filters only. No
new table, no new column, no migration required for the guard itself.

This is important because WP-16a migration work is still blocked at Gate 0. The
R-01 fix should not be used as a pretext to start migration work.

### 4.2 Side effects to watch
- If the fix later adds per-role response shapes, that is a code change, not a
  schema change.
- If later work wants a more sophisticated scoping model, that may require schema
  changes, but that is out of R-01 scope.

---

## 5. Next.js upgrade impact on the dashboard

### 5.1 Behavioral risk
A Next.js upgrade can change:
- build output layout
- standalone packaging
- server runtime behavior
- any route handler semantics if Next.js changes request/response handling

Because the dashboard is a route handler, a Next.js upgrade could affect it
indirectly even if the dashboard code itself is unchanged.

### 5.2 Test baseline risk
If the Next.js upgrade is done before or alongside R-01, it becomes harder to
attribute regressions. That is another reason the plan should stay separate.

### 5.3 Recommended order
The safest sequence is:
1. Finalize R-01 spec
2. Owner approves R-01 and Next.js target separately
3. Execute R-01 implementation with its own tests
4. Execute Next.js upgrade as a separate change with its own build and runtime
   verification

Mixing them increases the chance of misattribution and rollback confusion.

---

## 6. Dependency map for safe sequencing

### 6.1 Current dependencies among workstreams
- Gate 1A provides the test foundation.
- R-01 depends on the dashboard spec and, later, on the harness for regression
  tests.
- Next.js upgrade depends on very little from the other two, except that it
  should reuse the test baseline once the harness is stable.

### 6.2 Safe order
1. Fix the harness structural issue (failure-behavior test placement).
2. Owner approves R-01 spec.
3. Owner approves Next.js target version separately.
4. Implement R-01.
5. Upgrade Next.js in a separate change after R-01 is stable.

### 6.3 Unsafe order
- Upgrading Next.js before R-01 is implemented and verified.
- Adding R-01 tests into a CI path that already includes a deliberately failing
  test.
- Letting the dashboard fix and the Next.js upgrade be reviewed or deployed as one
  change.

---

## 7. P0 preservation check

- Gate 0 P0 changes are preserved: no production file was modified during this
  review.
- The dashboard route still has its current unscoped behavior, which is the
  existing P0 exposure. That is expected at this stage and does not indicate
  regression; it indicates the fix has not been implemented yet.

---

## 8. Scope discipline

- No workstream expanded into another.
- No schema change proposed for R-01.
- No upgrade executed for Next.js.
- No test file modified during review.

---

## 9. Status

All three workstreams are consistent enough to proceed independently once the
owner clears the conditions in the per-workstream reviews.

The most important dependency findings are:
- The harness must not permanently red-default CI.
- R-01 must not force a schema change.
- Next.js must remain a separate change with its own target version and runtime
  verification.

---

G6 INDEPENDENT REVIEW COMPLETED — OWNER DECISION REQUIRED — NO NEW IMPLEMENTATION STARTED.
