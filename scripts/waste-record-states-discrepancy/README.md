# Committed row-state discrepancy report

Read-only report that proves the committed row-state collection (ADR-0037,
`waste-balance-row-states`) is whole and consistent against the legacy
waste-records committed state, across an environment. A **CLEAN** verdict is the
green light for the backfill-complete check and the irreversible write-flag
flip (`FEATURE_FLAG_WASTE_RECORD_STATES`).

## What it checks

For every registration partition with a committed submission, it compares the
committed row-state read (`wasteRecordStatesForRegistration`) against the legacy
waste-records read for the same partition, and reports:

- **Coverage census** — partitions with a committed submission but no row-state
  data (a backfill gap), plus per-partition row counts.
- **Missing / extra rows** — rows committed at the head submission that are
  absent from the row-state membership, or row-states with no matching committed
  row.
- **creditTotal drift** — the included row-states at the head must sum to the
  head event's committed `creditTotal` (ADR-0037 decomposability invariant). Any
  drift means the membership is incomplete or wrong.
- **Classification divergences** — rows whose row-state outcome disagrees with
  the legacy reader's included-ness. This is a **context-sensitive** signal
  (the legacy side can only be re-classified under current context, not the
  submission's), reported in the census but **not** part of the clean verdict.

## Read-only

The script connects through a read-only `Db` guard: it reuses the production
repository factories — so all the read and document-mapping logic is the
battle-tested production code — but the factories' index assurance is
neutralised to a no-op and any data-write method throws. It issues **no writes**
to any collection.

## Running

```bash
MONGO_URI=mongodb://… MONGO_DATABASE=epr-backend \
  node scripts/waste-record-states-discrepancy

# or
npm run report:row-state-discrepancy
```

Defaults: `MONGO_URI=mongodb://127.0.0.1:27017`, `MONGO_DATABASE=epr-backend`.

Exit code is `0` for a clean estate and `1` when discrepancies remain, so the
report can gate a deployment step.
