# 21. Concurrent Summary Log Submission and Waste Record Versioning

Date: 2025-01-11

## Status

Proposed

## Context

When a user submits a summary log, the system must update potentially thousands of waste records by appending new versions to each record's version history. A typical summary log may contain up to 15,000 rows, with tens of values per row.

This operation presents several challenges:

1. **Concurrency Control**: Multiple users might attempt to submit summary logs for the same organisation/registration simultaneously
2. **Partial Failure Recovery**: The system could crash mid-submission, leaving some waste records updated and others not
3. **Data Consistency**: Users need to see consistent data, but full atomic transactions are not practical
4. **Performance**: Processing 15,000 records must complete in reasonable time
5. **Idempotency**: Retrying a failed submission must not create duplicate versions

### Scale Constraints

- Up to 15,000 waste records per summary log
- Each record contains multiple fields (tens of values)
- MongoDB transaction size limit: 16MB
- MongoDB transaction time limit: 60 seconds
- These constraints make multi-document transactions impractical for this use case

### Acceptable Trade-offs

- **Partial visibility is acceptable**: Users can see updates in progress via the summary log "submitting" status
- **Eventual consistency is acceptable**: Brief periods where some waste records are updated before others
- **Forward recovery preferred**: On failure, complete the submission rather than roll back

## Decision

We will implement a **multi-layered strategy** combining optimistic locking, idempotent operations, batch processing, and forward recovery:

### 1. Summary Log Status-Based Lock (Optimistic Concurrency)

Use the summary log's `status` field and `version` field as an optimistic lock to prevent concurrent submissions:

```javascript
async transitionToSubmitting(summaryLogId, expectedVersion) {
  const result = await db.collection('epr-summary-logs').findOneAndUpdate(
    {
      _id: ObjectId.createFromHexString(summaryLogId),
      status: 'validated',
      version: expectedVersion
    },
    {
      $set: {
        status: 'submitting',
        submissionStartedAt: new Date()
      },
      $inc: { version: 1 }
    },
    { returnDocument: 'after' }
  )

  if (!result.value) {
    throw Boom.conflict('Summary log is not in validated state or version conflict')
  }

  return result.value
}
```

**Rationale**: Atomic check-and-set operation prevents race conditions without separate locking infrastructure.

### 2. Repository Port Design

The waste records repository provides a focused interface for version management:

```javascript
/**
 * @typedef {Object} WasteRecordsRepository
 * @property {(organisationId, registrationId) => Promise<WasteRecord[]>} findByRegistration
 * @property {(organisationId, registrationId, accreditationId, versionsByKey) => Promise<void>} appendVersions
 */
```

Where `versionsByKey` is a `Map<string, VersionAppend>` keyed by `"type:rowId"`, containing:

```javascript
/**
 * @typedef {Object} VersionAppend
 * @property {WasteRecordVersion} version - Complete version (status, summaryLog, data)
 * @property {Object} currentData - Top-level data after this version applied
 */
```

**Rationale**:

- Application layer handles business logic (delta calculation, change detection)
- Repository layer handles persistence (version appending, idempotency)
- Single Map parameter groups all updates for one org/registration batch
- Map key `"type:rowId"` handles multiple waste record types in one summary log

### 3. Application Layer Processing

The application layer orchestrates the submission workflow:

```javascript
async submitSummaryLog(organisationId, registrationId, summaryLogId) {
  // 1. Acquire lock via summary log status transition
  const summaryLog = await summaryLogsRepo.transitionToSubmitting(summaryLogId, version)

  try {
    // 2. Read ALL existing waste records for this org/registration (one query)
    const existingRecords = await wasteRecordsRepo.findByRegistration(
      organisationId,
      registrationId
    )

    // 3. Build lookup Map
    const existingByKey = new Map(
      existingRecords.map(r => [`${r.type}:${r.rowId}`, r])
    )

    // 4. Transform summary log data, calculating deltas
    const versionsByKey = new Map()
    for (const row of summaryLogRows) {
      const key = `${row.type}:${row.rowId}`
      const existing = existingByKey.get(key)

      // Calculate delta, determine status (CREATED vs UPDATED)
      const version = buildVersion(row, existing, summaryLog)
      const currentData = row.data

      // Check idempotency: skip if this summaryLog.id already in versions
      if (!existing?.versions.some(v => v.summaryLog.id === summaryLog.id)) {
        versionsByKey.set(key, { version, currentData })
      }
    }

    // 5. Append all versions in one call
    await wasteRecordsRepo.appendVersions(
      organisationId,
      registrationId,
      accreditationId,
      versionsByKey
    )

    // 6. Mark as completed
    await summaryLogsRepo.markAsSubmitted(summaryLogId)
  } catch (error) {
    // Leave in 'submitting' state for recovery
    throw error
  }
}
```

**Rationale**:

- Single read of all existing records (efficient bulk query)
- Application layer owns business logic (delta calculation, status determination)
- Idempotency check in application layer (can skip unnecessary writes)
- Repository receives clean instructions: "append these versions"
- If processing 15k records becomes a memory concern, this can be batched

### 4. MongoDB Adapter Implementation

The waste records MongoDB adapter implements `appendVersions`:

```javascript
const performAppendVersions =
  (db) =>
  async (organisationId, registrationId, accreditationId, versionsByKey) => {
    if (versionsByKey.size === 0) return

    const bulkOps = []

    for (const [key, { version, currentData }] of versionsByKey) {
      const [type, rowId] = key.split(':')
      const compositeKey = getCompositeKey(
        organisationId,
        registrationId,
        type,
        rowId
      )

      bulkOps.push({
        updateOne: {
          filter: { _compositeKey: compositeKey },
          update: {
            $setOnInsert: {
              _compositeKey: compositeKey,
              schemaVersion: SCHEMA_VERSION,
              organisationId,
              registrationId,
              ...(accreditationId && { accreditationId }),
              type,
              rowId
            },
            $set: {
              data: currentData
            },
            $push: {
              versions: version
            }
          },
          upsert: true
        }
      })
    }

    await db
      .collection('epr-waste-records')
      .bulkWrite(bulkOps, { ordered: false })
  }
```

**Key behaviors**:

- `$setOnInsert`: Sets static fields only when creating new document
- `$set`: Updates top-level data on every operation
- `$push`: Appends version to versions array
- `upsert: true`: Creates document if it doesn't exist
- `ordered: false`: Continues processing if one operation fails
- No explicit idempotency check (application layer already filtered)

### 5. Forward Recovery via Background Job

A background job runs periodically (e.g., every minute) to detect and recover stuck submissions:

```javascript
async recoverStuckSubmissions() {
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

  const stuckLogs = await summaryLogsRepo.find({
    status: 'submitting',
    submissionStartedAt: { $lt: new Date(Date.now() - STUCK_THRESHOLD_MS) }
  })

  for (const log of stuckLogs) {
    // Re-run submission - idempotency handles partial completion
    await submitSummaryLog(log.organisationId, log.registrationId, log.id)
  }
}
```

**Rationale**: Simple forward recovery leverages idempotency. No need to track partial progress or implement rollback logic.

## Consequences

### Positive

- **Handles large scale**: Efficiently processes up to 15,000+ waste records
- **Prevents concurrent conflicts**: Optimistic lock on summary log prevents race conditions
- **Crash-safe**: Idempotency allows safe retry after partial failure
- **No transactions required**: Works within MongoDB's practical limits
- **Forward recovery**: Simple, predictable recovery mechanism
- **Performance**: Minimal database round-trips
  - Estimated time for 15k records: 10-30 seconds
  - Database operations: 1 bulk read (all existing records) + 1 bulk write (all version appends) = 2 ops total
  - Application memory: Holds all records in memory during processing (manageable for 15k records)

### Negative

- **Memory usage**: Application holds all existing records in memory during processing
  - For 15k records: acceptable on modern infrastructure
  - If this becomes a constraint, can batch the Map building and writes
- **Application complexity**: Delta calculation and status logic in application layer
  - Trade-off: simpler repository, clearer separation of concerns
- **Recovery delay**: Stuck submissions detected after 5 minutes
  - Acceptable trade-off vs. immediate detection complexity

### Implementation Notes

1. The `submissionStartedAt` timestamp on the summary log enables stuck submission detection
2. The `versions` array in waste records naturally supports idempotency via `summaryLog.id` checking
3. Idempotency check happens in application layer before building the Map (avoids unnecessary writes)
4. Map key format `"type:rowId"` naturally groups versions by waste record
5. The recovery job should include alerting if submissions repeatedly fail
6. The recovery job should use exponential backoff if a submission continues to fail
7. If memory usage becomes a concern with >15k records, batch the Map building and multiple `appendVersions` calls

### Future Considerations

- If waste records need to support concurrent updates from multiple sources (not just summary logs), add a `version` field to waste records for optimistic locking
- If recovery time needs to be faster, reduce the stuck threshold or implement active monitoring
- If memory usage exceeds infrastructure limits, implement batched processing (multiple smaller Maps and `appendVersions` calls)
- If processing time exceeds acceptable limits, consider async processing via queue worker
