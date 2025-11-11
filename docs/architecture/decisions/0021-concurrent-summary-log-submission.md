# 21. Concurrent Summary Log Submission and Waste Record Versioning

Date: 2025-01-11

## Status

Proposed

## Context

When a user submits a summary log, the system must update potentially thousands of waste records by appending new versions to each record's version history. A typical summary log may contain up to 15,000 rows, with tens of values per row.

This operation presents several challenges:

1. **Stale Previews**: If a user views a preview and another summary log is uploaded before they submit, the preview becomes incorrect
2. **Concurrency Control**: Multiple users might attempt to submit summary logs for the same organisation/registration simultaneously
3. **Partial Failure Recovery**: The system could crash mid-submission, leaving some waste records updated and others not
4. **Data Consistency**: Users need to see consistent data, but full atomic transactions are not practical
5. **Performance**: Processing 15,000 records must complete in reasonable time
6. **Idempotency**: Retrying a failed submission must not create duplicate versions

### Scale Constraints

- Up to 15,000 waste records per summary log
- Each record contains multiple fields (tens of values)
- MongoDB transaction size limit: 16MB
- MongoDB transaction time limit: 60 seconds
- These constraints make multi-document transactions impractical for this use case

### Acceptable Trade-offs

- **Last upload wins**: Only one unsubmitted summary log per organisation/registration at a time. New uploads supersede previous unsubmitted ones.
- **Partial visibility is acceptable**: Users can see updates in progress via the summary log "submitting" status
- **Eventual consistency is acceptable**: Brief periods where some waste records are updated before others
- **Forward recovery preferred**: On failure, complete the submission rather than roll back

### Key Constraint

**One unsubmitted summary log per organisation/registration**: The system enforces that only one summary log in an unsubmitted state (`validated`, `validating`, `preprocessing`) can exist for a given organisation/registration pair at any time. When a new summary log is uploaded:

1. Any existing unsubmitted summary logs for that org/reg are superseded
2. The new upload becomes the current unsubmitted summary log
3. On submit, the system verifies the summary log ID matches the current one for that org/reg

This constraint eliminates stale preview issues: if another summary log is uploaded while a user views a preview, their submit will fail with a clear message that a newer upload exists.

## Decision

We will implement a **multi-layered strategy** combining org/reg level constraints, optimistic locking, two-phase workflow (validate/preview then submit), idempotent operations, batch processing, and forward recovery:

### 1. Organisation/Registration Level Constraint (Prevents Stale Previews)

Enforce that only one unsubmitted summary log can exist per organisation/registration pair:

**On Upload:**

```javascript
async createSummaryLog(organisationId, registrationId, fileUri) {
  // Supersede any existing unsubmitted summary logs for this org/reg
  await db.collection('summary-logs').updateMany(
    {
      organisationId,
      registrationId,
      status: { $in: ['preprocessing', 'validating', 'validated'] }
    },
    {
      $set: {
        status: 'superseded',
        supersededAt: new Date(),
        supersededReason: 'Newer summary log uploaded'
      }
    }
  )

  // Create new summary log
  const summaryLog = {
    organisationId,
    registrationId,
    status: 'preprocessing',
    file: { uri: fileUri },
    createdAt: new Date(),
    version: 0
  }

  const result = await db.collection('summary-logs').insertOne(summaryLog)
  return { ...summaryLog, id: result.insertedId.toHexString() }
}
```

**On Submit (Validation Check):**

```javascript
async transitionToSubmitting(summaryLogId, organisationId, registrationId, expectedVersion) {
  // Verify this is still the current unsubmitted summary log for org/reg
  const current = await db.collection('summary-logs').findOne({
    organisationId,
    registrationId,
    status: 'validated'
  })

  if (!current || current._id.toHexString() !== summaryLogId) {
    throw Boom.conflict(
      'A newer summary log has been uploaded. Please review the latest upload.'
    )
  }

  // Transition to submitting
  const result = await db.collection('summary-logs').findOneAndUpdate(
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

**Rationale**:

- Last upload wins - simpler mental model for users
- Eliminates stale preview problem entirely
- No preview can become outdated (new upload supersedes old one)
- Clear error message if user attempts to submit superseded summary log
- Atomic operations ensure constraint is enforced reliably

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

### 3. Validation Phase (Calculate Preview Statistics)

During validation, the system calculates preview statistics for the user to review:

```javascript
async validateSummaryLog(summaryLogId) {
  // Get the summary log (status: 'validating')
  const summaryLog = await summaryLogsRepo.findById(summaryLogId)

  // 1. Extract and parse the summary log file
  const parsedData = await summaryLogExtractor.extract(summaryLog)

  // 2. Validate the parsed data against business rules
  const validationErrors = await validateParsedData(parsedData)

  if (validationErrors.length > 0) {
    // Mark as invalid with errors
    await summaryLogsRepo.update(summaryLogId, {
      status: 'invalid',
      validationErrors
    })
    return
  }

  // 3. Read ALL existing waste records for this org/registration (one query)
  const existingRecords = await wasteRecordsRepo.findByRegistration(
    summaryLog.organisationId,
    summaryLog.registrationId
  )

  // 4. Build lookup Map
  const existingByKey = new Map(
    existingRecords.map(r => [`${r.type}:${r.rowId}`, r])
  )

  // 5. Transform summary log data, calculating deltas
  // Uses validatedAt timestamp for determinism
  const wasteRecords = transformFromSummaryLog(
    parsedData,
    {
      summaryLog: { id: summaryLog.id, uri: summaryLog.file.uri },
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      accreditationId: summaryLog.accreditationId,
      versionTimestamp: new Date() // Will be stored as validatedAt
    },
    existingByKey
  )

  // 6. Calculate summary statistics
  const stats = {
    created: 0,
    updated: 0,
    unchanged: 0
  }

  for (const record of wasteRecords) {
    const lastVersion = record.versions[record.versions.length - 1]
    if (lastVersion.summaryLog.id === summaryLog.id) {
      if (lastVersion.status === 'CREATED') {
        stats.created++
      } else if (lastVersion.status === 'UPDATED') {
        stats.updated++
      }
    } else {
      stats.unchanged++
    }
  }

  // 7. Mark as validated with preview stats
  await summaryLogsRepo.update(summaryLogId, {
    status: 'validated',
    validatedAt: new Date(),
    previewStats: stats
  })
}
```

**Rationale**:

- Preview calculation happens during validation workflow
- Summary stats stored in summary log document (small, well within 16MB limit)
- Uses `validatedAt` timestamp for version creation to enable deterministic recalculation on submit
- Full waste records not stored (would exceed 16MB limit for 15k records)
- User views preview page which simply displays the stored `previewStats`

### 4. Submission Phase (Persist Changes)

After user confirms the preview, the application layer orchestrates the submission workflow:

```javascript
async submitSummaryLog(organisationId, registrationId, summaryLogId) {
  // 1. Verify summary log is still current and transition to submitting
  const summaryLog = await summaryLogsRepo.transitionToSubmitting(
    summaryLogId,
    organisationId,
    registrationId,
    version
  )

  try {
    // 2. Extract and parse the summary log file (same as validation)
    const parsedData = await summaryLogExtractor.extract(summaryLog)

    // 3. Read ALL existing waste records for this org/registration (one query)
    const existingRecords = await wasteRecordsRepo.findByRegistration(
      organisationId,
      registrationId
    )

    // 4. Build lookup Map
    const existingByKey = new Map(
      existingRecords.map(r => [`${r.type}:${r.rowId}`, r])
    )

    // 5. Transform summary log data using SAME timestamp as validation
    // This produces identical versions to what user saw in preview
    const wasteRecords = transformFromSummaryLog(
      parsedData,
      {
        summaryLog: { id: summaryLog.id, uri: summaryLog.file.uri },
        organisationId,
        registrationId,
        accreditationId,
        versionTimestamp: summaryLog.validatedAt  // Deterministic!
      },
      existingByKey
    )

    // 6. Build versionsByKey Map for repository
    const versionsByKey = new Map()
    for (const record of wasteRecords) {
      const lastVersion = record.versions[record.versions.length - 1]

      // Only append if this summary log added a new version
      if (lastVersion.summaryLog.id === summaryLog.id) {
        const key = `${record.type}:${record.rowId}`
        versionsByKey.set(key, {
          version: lastVersion,
          currentData: record.data
        })
      }
    }

    // 7. Append all versions in one call
    await wasteRecordsRepo.appendVersions(
      organisationId,
      registrationId,
      accreditationId,
      versionsByKey
    )

    // 8. Mark as completed
    await summaryLogsRepo.markAsSubmitted(summaryLogId)
  } catch (error) {
    // Leave in 'submitting' state for recovery
    throw error
  }
}
```

**Rationale**:

- Verifies summary log is still current for org/reg before starting (prevents stale submissions)
- Recalculates transformations using same `validatedAt` timestamp as validation phase
- Org/reg constraint ensures waste records may have changed but preview stats are still accurate
- Produces identical versions to what user saw in preview (deterministic)
- Application layer owns business logic (delta calculation, status determination)
- Repository receives clean instructions: "append these versions"
- If processing 15k records becomes a memory concern, this can be batched

### 5. MongoDB Adapter Implementation

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

### 6. Forward Recovery via Background Job

A background job runs periodically (e.g., every minute) to detect and recover stuck submissions:

```javascript
async recoverStuckSubmissions() {
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

  // Recover stuck submissions - complete the submission
  const stuckSubmissions = await summaryLogsRepo.find({
    status: 'submitting',
    submissionStartedAt: { $lt: new Date(Date.now() - STUCK_THRESHOLD_MS) }
  })

  for (const log of stuckSubmissions) {
    try {
      // Re-run submission - idempotency handles partial completion
      await submitSummaryLog(log.organisationId, log.registrationId, log.id)
    } catch (error) {
      // If this summary log has been superseded, mark it and continue
      if (error.message.includes('newer summary log')) {
        await summaryLogsRepo.update(log.id, {
          status: 'superseded',
          supersededAt: new Date(),
          supersededReason: 'Superseded during recovery'
        })
      } else {
        // Log and alert for other errors
        logger.error({ error, summaryLogId: log.id }, 'Failed to recover stuck submission')
      }
    }
  }
}
```

**Rationale**:

- Stuck submissions use forward recovery leveraging idempotency
- Handles case where summary log was superseded during submission
- No need to track partial progress or implement rollback logic
- Stuck validations don't need recovery (they're just background jobs that can restart)

## Consequences

### Positive

- **No stale previews**: Org/reg constraint ensures preview is always for current unsubmitted summary log
- **Simple mental model**: Last upload wins - easy for users to understand
- **User confirmation**: Preview during validation allows users to review changes before committing
- **Handles large scale**: Efficiently processes up to 15,000+ waste records
- **Prevents race conditions**: Org/reg constraint + optimistic locking on summary log status
- **Deterministic recalculation**: Using `validatedAt` timestamp ensures submitted versions match preview
- **Crash-safe**: Idempotency allows safe retry after partial failure
- **No transactions required**: Works within MongoDB's practical limits
- **Forward recovery**: Simple, predictable recovery mechanism
- **Performance**: Minimal database round-trips per phase
  - Validation: 1 bulk read (existing records) + calculation + store stats
  - Submit: 1 bulk read (existing records) + 1 bulk write (all version appends)
  - Estimated time for 15k records: 10-30 seconds per phase
  - Application memory: Holds all records in memory during processing (manageable for 15k records)

### Negative

- **Last upload wins**: Users who are reviewing a preview will get an error if someone uploads a newer summary log
  - Trade-off: Simpler than allowing multiple concurrent previews and dealing with merge conflicts
  - Clear error message guides user to review the newer upload
- **Two-phase overhead**: Calculates transformations twice (validation + submit)
  - Trade-off: User confidence and confirmation outweighs computational cost
  - Org/reg constraint prevents wasted work (only one summary log being worked on at a time)
- **Memory usage**: Application holds all existing records in memory during processing
  - For 15k records: acceptable on modern infrastructure
  - If this becomes a constraint, can batch the Map building and writes
- **Application complexity**: Delta calculation and status logic in application layer
  - Trade-off: simpler repository, clearer separation of concerns
- **Recovery delay**: Stuck submissions detected after 5 minutes
  - Forward recovery completes them
  - Acceptable trade-off vs. immediate detection complexity

### Implementation Notes

1. The `validatedAt` timestamp enables deterministic version creation (same versions in preview and submit)
2. The `submissionStartedAt` timestamp on the summary log enables stuck submission detection
3. The `versions` array in waste records naturally supports idempotency via `summaryLog.id` checking
4. Preview stats stored in summary log: `{ previewStats: { created: 1234, updated: 567, unchanged: 89 } }`
5. Idempotency check happens in application layer before building the Map (avoids unnecessary writes)
6. Map key format `"type:rowId"` naturally groups versions by waste record
7. The recovery job should include alerting if operations repeatedly fail
8. The recovery job should use exponential backoff if an operation continues to fail
9. New uploads must supersede existing unsubmitted summary logs for the same org/reg
10. Submit must verify the summary log is still current before processing
11. The `superseded` status is a terminal state (no further transitions allowed)
12. If memory usage becomes a concern with >15k records, batch the Map building and multiple `appendVersions` calls

### Future Considerations

- If waste records need to support concurrent updates from multiple sources (not just summary logs), add a `version` field to waste records for optimistic locking
- If recovery time needs to be faster, reduce the stuck threshold or implement active monitoring
- If memory usage exceeds infrastructure limits, implement batched processing (multiple smaller Maps and `appendVersions` calls)
- If processing time exceeds acceptable limits, consider async processing via queue worker
