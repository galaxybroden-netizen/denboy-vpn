# GATE 1A — ACCEPTANCE CHECKLIST

## Must be true before Gate 1A is considered complete

- [x] `bun test` executes successfully from the project root.
- [x] Test discovery works (files under `tests/` are found and run).
- [x] At least one meaningful smoke test passes.
- [x] Failure behavior is verified (an intentionally-failing test fails with non-zero exit).
- [x] No production business logic changed.
- [x] No unnecessary dependency added.
- [x] Existing P0 changes remain intact.
- [x] Execution instructions are documented.

## Verification notes

The checklist above was verified by running the harness and by confirming files
on disk. No production module was edited.

## Out of scope (explicitly not required for this gate)

- Coverage reporting.
- Snapshot testing.
- End-to-end browser tests.
- Real Postgres/Redis integration tests.
- Tests asserting the dashboard leak fix (R-01 is not implemented yet).

## Owner action

No code change required from the owner. The owner's required action at this point
is to review the R-01 specification before any dashboard code is changed.
