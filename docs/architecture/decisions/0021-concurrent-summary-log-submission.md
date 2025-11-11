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

### 2. Idempotent Waste Record Version Updates

Each version in a waste record's version history includes `summaryLog.id`. Before applying updates, check if the summary log has already been processed:

```javascript
// Read existing records in bulk (per batch)
const existingRecords = await db.collection('epr-waste-records')
  .find({ _compositeKey: { $in: compositeKeys } })
  .toArray()

// Check each record for existing version with same summaryLog.id
const versionExists = existing?.versions.some(
  v => v.summaryLog.id === summaryLogId
)

if (versionExists) {
  // Skip - already processed
  continue
}

// Otherwise, append new version
```

**Rationale**: Natural deduplication using existing data structure. Safe to retry entire operation.

### 3. Batch Processing

Process waste records in batches to manage memory and provide progress visibility:

```javascript
const BATCH_SIZE = 100 // Example size - tune based on record size and performance

for (let i = 0; i < wasteRecords.length; i += BATCH_SIZE) {
  const batch = wasteRecords.slice(i, i + BATCH_SIZE)

  // Idempotent upsert
  await wasteRecordsRepo.upsertWasteRecords(batch)

  // Optional: Track progress on summary log
  await summaryLogsRepo.updateProgress(
    summaryLogId,
    i + batch.length,
    wasteRecords.length
  )
}
```

**Rationale**:

- Limits memory usage
- Provides progress visibility
- Reduces blast radius of transient failures
- Bulk read operation per batch is efficient
- Batch size should be tuned based on actual record sizes and database performance

### 4. MongoDB Adapter Implementation

The waste records MongoDB adapter implements idempotent upserts:

1. Reads existing records for the batch in a single query
2. Checks each record for version idempotency
3. Merges existing versions with new version
4. Uses `bulkWrite` with upsert for efficient updates

```javascript
const performUpsertWasteRecords = (db) => async (wasteRecords) => {
  // Read existing records
  const compositeKeys = wasteRecords.map(r => getCompositeKey(...))
  const existingRecords = await db.collection('epr-waste-records')
    .find({ _compositeKey: { $in: compositeKeys } })
    .toArray()

  const existingByKey = new Map(existingRecords.map(r => [r._compositeKey, r]))

  // Build bulk operations with idempotency checks
  const bulkOps = wasteRecords.map((record) => {
    const existing = existingByKey.get(compositeKey)
    const latestVersion = record.versions[record.versions.length - 1]

    // Check if version already exists
    const versionExists = existing?.versions.some(
      v => v.summaryLog.id === latestVersion.summaryLog.id
    )

    if (versionExists) return null // Skip

    // Merge versions
    const mergedVersions = existing
      ? [...existing.versions, latestVersion]
      : [latestVersion]

    return {
      updateOne: {
        filter: { _compositeKey: compositeKey },
        update: { $set: { ...record, versions: mergedVersions } },
        upsert: true
      }
    }
  }).filter(op => op !== null)

  if (bulkOps.length > 0) {
    await db.collection('epr-waste-records').bulkWrite(bulkOps, { ordered: false })
  }
}
```

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
- **Performance**: Bulk operations minimize database round-trips
  - Estimated time for 15k records: 30-60 seconds
  - Database operations: With batch size of 100, approximately 150 read queries + 150 bulk writes = 300 ops total

### Negative

- **Eventual consistency**: Brief period where waste records are partially updated
  - Mitigated by showing "submitting" status to users
- **Read overhead**: Must read existing records before update to check idempotency
  - Mitigated by bulk reads (one query per batch)
- **Complexity**: Multiple components (lock, idempotency, batching, recovery) must work together
- **Recovery delay**: Stuck submissions detected after 5 minutes
  - Acceptable trade-off vs. immediate detection complexity

### Implementation Notes

1. The `submissionStartedAt` timestamp on the summary log enables stuck submission detection
2. The `versions` array in waste records naturally supports idempotency via `summaryLog.id` checking
3. Progress tracking is optional but recommended for user visibility
4. The recovery job should include alerting if submissions repeatedly fail
5. Consider tuning `BATCH_SIZE` based on actual record sizes and MongoDB performance
6. The recovery job should use exponential backoff if a submission continues to fail

### Future Considerations

- If waste records need to support concurrent updates from multiple sources (not just summary logs), add a `version` field to waste records for optimistic locking
- If recovery time needs to be faster, reduce the stuck threshold or implement active monitoring
- If 15k+ records become too slow, consider processing asynchronously via a queue worker
