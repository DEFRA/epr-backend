# Eventual Consistency Testing Design

**Date**: 2025-11-03
**Status**: Approved for Implementation

## Problem Statement

The organisations repository contract tests currently pass in local development but rely on read-after-write consistency guarantees that don't exist in production.

**Local Development**: Single-node MongoDB - read-after-write always works
**Production**: 3-node MongoDB replica set with `readPreference: 'secondary'` - reads can return stale data due to replication lag

Contract tests like this pass locally but can fail in production:

```javascript
await repository.update(orgData.id, 1, { status: 'approved' })
const result = await repository.findById(orgData.id)
expect(result.status).toBe('approved') // May fail in production!
```

## Goal

Prevent code from relying on read-after-write consistency by making local tests fail when consistency is assumed but not explicitly requested.

## Solution Design

### Core Mechanism: Stale Read Cache

Add eventual consistency simulation to the in-memory repository implementation using a dual-storage pattern:

**Storage Structure**:

- `storage`: Authoritative current data (receives all writes immediately)
- `staleCache`: Lagged snapshot used for all reads
- `pendingSync`: Timer handle for scheduled cache updates

**Write Operations** (insert/update):

1. Update `storage` immediately
2. Cancel any pending sync
3. Schedule staleCache update: `setImmediate(() => { this.staleCache = structuredClone(this.storage) })`
4. Return to caller

**Read Operations** (findById/findAll/findRegistrationById):

- Always read from `staleCache` (never from `storage`)
- May return stale data until next event loop tick

**Insert Behavior**:

- Insert does NOT lag - staleCache updated immediately
- Rationale: MongoDB inserts to primary are immediately readable from primary

### Version-Aware Retry

Modify `findById()` signature to accept optional expected version:

```javascript
async findById(id, expectedVersion = undefined)
```

**Behavior**:

- **Without version**: Returns immediately from staleCache (may be stale)
- **With version**: Retries until `result.version >= expectedVersion` or timeout

**Implementation**:

```javascript
async findById(id, expectedVersion) {
  const MAX_RETRIES = 10
  const RETRY_DELAY_MS = 10

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = performFindById(staleCache, id)

      if (expectedVersion === undefined) {
        return result
      }

      if (result.version >= expectedVersion) {
        return result
      }
    } catch (error) {
      // Document not found - retry in case insert hasn't replicated
      if (i === MAX_RETRIES - 1) {
        throw error
      }
    }

    if (i < MAX_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }

  // Timeout - log details but throw simple error
  console.error(`Consistency timeout: expected version ${expectedVersion}`)
  throw Boom.internal('Consistency timeout waiting for expected version')
}
```

### Other Repository Methods

**findAll()**:

- No version parameter
- Always returns staleCache immediately
- Eventual consistency assumed for bulk reads

**findRegistrationById(organisationId, registrationId)**:

- Add optional `expectedOrgVersion` parameter
- Shares the organisation's version field
- Same retry logic as findById

### MongoDB Implementation

Apply the same signature changes to the MongoDB implementation:

```javascript
async findById(id, expectedVersion)
async findRegistrationById(organisationId, registrationId, expectedOrgVersion)
```

In production with replica sets, this retry logic handles real replication lag.

## Implementation Approach

### Phase 1: Add Stale Cache to In-Memory Repository

1. Add `staleCache` and `pendingSync` to repository state
2. Initialize `staleCache = structuredClone(initialOrganisations)`
3. Modify write operations to schedule async cache updates
4. Modify read operations to always read from `staleCache`

### Phase 2: Verify Tests Fail

1. Run contract tests - expect widespread failures
2. Document which tests fail and why
3. Confirm failures match expected violations

### Phase 3: Add Version-Aware Methods

1. Update `findById()` signature and implementation (both inmemory and MongoDB)
2. Update `findRegistrationById()` signature and implementation
3. Update port.js typedef

### Phase 4: Fix Contract Tests Incrementally

1. Update one contract test file at a time
2. Add expected version to `findById()` calls after updates
3. Verify test passes
4. Commit each file separately for reviewability

### Phase 5: Fix Application Code

1. Search for all `findById()` usage after `update()` calls
2. Add expected version parameter
3. Test with journey tests

## Edge Cases

**Document Not Found with Version**:

- Retry for MAX_RETRIES (document might be propagating)
- After timeout, throw `Boom.notFound()`
- Handles slow insert replication

**Concurrent Updates**:

- `findById(id, 2)` called after version 3 created
- Returns immediately (version 3 >= 2)
- Works correctly

**Version Regression**:

- Shouldn't happen (versions only increment)
- If staleCache somehow regresses, retry will eventually timeout
- Throws error as expected

## Performance Impact

**Per-write overhead**:

- One `setImmediate()` call (~0.1ms)
- One `structuredClone()` of entire storage array
- Estimated 5-10% test suite slowdown (well under 20% budget)

**Per-read overhead**:

- Simple cache selection (negligible)
- Retry loop only when version specified (most reads unaffected)

## Success Criteria

1. All contract tests fail initially (proving detection works)
2. After fixes, all contract tests pass with version parameters
3. Test suite runs in < 20% more time
4. No false positives (tests fail only when actually relying on consistency)
5. Clear error messages when consistency timeout occurs

## Design Decisions

1. **Inserts don't lag**: MongoDB inserts to primary are immediately visible
2. **Not found retries**: When version specified but doc not found, retry (handles slow replication)
3. **Hardcoded retry config**: 10 retries × 10ms = 100ms max (constants, not configurable)
4. **findAll no retry**: Bulk reads always return stale (no version check)
5. **findRegistrationById uses org version**: Shares parent organisation's version field
6. **Incremental test fixes**: Fix tests after verifying they fail as expected
7. **No MongoDB config change**: Keep `readPreference: 'secondary'` to test retry logic
8. **Simple error messages**: Log details to console, throw simple Boom error without variables
