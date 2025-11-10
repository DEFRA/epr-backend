# S3 File Reference Standardization

**Date:** 2025-11-10
**Author:** Design session with Graeme
**Status:** Approved for implementation

## Problem

The codebase uses two different patterns for referencing S3 files:

1. **Structured objects:** `{ file: { s3: { bucket: '...', key: '...' } } }` in summary-logs
2. **URI strings:** `s3://bucket/key` in waste-records (mostly tests)

This inconsistency creates developer confusion when adding new features or fixing bugs. The structured object pattern also couples domain models and business logic to S3 implementation details.

## Goals

- **Eliminate confusion:** Single, consistent pattern for S3 file references
- **Reduce coupling:** Domain models and business logic should not depend on S3's bucket/key structure
- **Maintain compatibility:** CDP Uploader sends `{bucket, key}` in HTTP requests (external API constraint)
- **No migration needed:** This is test/dev environment only

## Decision

Standardize on **URI strings** (`s3://bucket/key`) throughout the codebase.

The S3-specific `{bucket, key}` structure appears only at two boundaries:

1. **Incoming:** CDP Uploader HTTP requests (external API we cannot change)
2. **Outgoing:** AWS SDK calls (requires separate Bucket/Key parameters)

Between these boundaries, all code works with URI strings.

## Architecture

### Data Flow

```
CDP Uploader ({bucket, key})
    ↓
HTTP endpoint → converts to s3://bucket/key
    ↓
Domain model (uri: string)
    ↓
MongoDB (uri: string)
    ↓
Application services (uri: string)
    ↓
S3 adapter → parses to {bucket, key}
    ↓
AWS SDK
```

### Domain Model Changes

**File:** `src/domain/summary-logs/model.js`

Replace the current optional `S3Location` structure with a discriminated union:

```javascript
/**
 * @typedef {Object} FileUpload
 * @property {string} id
 * @property {string} name
 * @property {'pending'|'rejected'} status
 */

/**
 * @typedef {Object} StoredFile
 * @property {string} id
 * @property {string} name
 * @property {'complete'} status
 * @property {string} uri - S3 URI (e.g., s3://bucket/key)
 */

/**
 * @typedef {FileUpload | StoredFile} SummaryLogFile
 */
```

This enforces that complete files must have a URI, while pending/rejected files cannot.

### Repository Schema Changes

**File:** `src/repositories/summary-logs/schema.js`

Replace nested `s3` object validation with simple URI string:

```javascript
file: Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  status: Joi.string().valid('pending', 'rejected', 'complete').required(),
  uri: Joi.when('status', {
    is: 'complete',
    then: Joi.string().required()
  })
})
```

### HTTP Endpoint Changes

**Files:**

- `src/routes/v1/organisations/registrations/summary-logs/validate/post.js`
- `src/routes/v1/organisations/registrations/summary-logs/upload-completed/post.js`

Convert CDP Uploader's bucket/key to URI at the boundary:

```javascript
// Before
const summaryLog = await summaryLogsRepository.update(summaryLogId, {
  file: {
    s3: {
      bucket: s3Bucket,
      key: s3Key
    }
  }
})

// After
const uri = `s3://${s3Bucket}/${s3Key}`

const summaryLog = await summaryLogsRepository.update(summaryLogId, {
  file: { uri }
})
```

### S3 Adapter Changes

**File:** `src/adapters/repositories/uploads/s3.js`

Accept URI string and parse using built-in URL class:

```javascript
async findByLocation(uri) {
  // Parse S3 URI using built-in URL class
  let url
  try {
    url = new URL(uri)
  } catch (error) {
    throw new Error(`Malformed URI: ${uri}`)
  }

  if (url.protocol !== 's3:') {
    throw new Error(`Expected s3:// protocol, got: ${url.protocol}`)
  }

  if (!url.hostname) {
    throw new Error(`Missing bucket in S3 URI: ${uri}`)
  }

  if (!url.pathname || url.pathname === '/') {
    throw new Error(`Missing key in S3 URI: ${uri}`)
  }

  const bucket = url.hostname
  const key = url.pathname.slice(1) // Remove leading slash

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  })

  // ... rest of implementation unchanged
}
```

**Validation handles edge cases:**

- Empty bucket: `s3:///key` → error
- Empty key: `s3://bucket/` → error
- Malformed URI → error from `new URL()`
- Wrong protocol: `https://bucket/key` → error
- Keys with slashes: `s3://bucket/path/to/file.csv` → works correctly

### Application Service Changes

**File:** `src/application/summary-logs/extractor.js`

Simplify by passing URI directly instead of destructuring:

```javascript
// Before
const {
  file: {
    s3: { bucket, key }
  }
} = summaryLog

const fileBuffer = await uploadsRepository.findByLocation({ bucket, key })

// After
const {
  file: { uri }
} = summaryLog

const fileBuffer = await uploadsRepository.findByLocation(uri)
```

**File:** `src/application/waste-records/sync-from-summary-log.js`

- Already expects `summaryLog.uri`
- No changes needed

### Test Changes

**In-Memory Repository** (`src/adapters/repositories/uploads/inmemory.js`):

Use URI string as map key directly (no parsing needed):

```javascript
async findByLocation(uri) {
  return this.uploads.get(uri) ?? null
}
```

**Test Helpers** (`src/repositories/summary-logs/contract/test-data.js`):

Remove `TEST_S3_BUCKET` constant, use complete URIs:

```javascript
// Before
export const TEST_S3_BUCKET = 'test-bucket'

buildFile() {
  return {
    id: randomUUID(),
    name: 'test-file.csv',
    status: 'complete',
    s3: {
      bucket: TEST_S3_BUCKET,
      key: 'test-key'
    }
  }
}

// After
buildFile() {
  return {
    id: randomUUID(),
    name: 'test-file.csv',
    status: 'complete',
    uri: 's3://test-bucket/test-key'
  }
}
```

**All test files:**

- Remove references to `TEST_S3_BUCKET`
- Update test data to use URI strings
- Update assertions to check `uri` property instead of `s3.bucket` and `s3.key`

## Implementation Order

1. Update domain types (`model.js`)
2. Update S3 adapter to accept and parse URIs
3. Update in-memory repository to use URIs as keys
4. Update repository schema validation
5. Update HTTP endpoints to construct URIs
6. Update application services (extractor)
7. Update all tests and test helpers
8. Run full test suite to verify changes

## Testing Strategy

- **Repository contract tests:** Verify schema validation enforces URI presence for complete files
- **Unit tests:** Test URI parsing in S3 adapter with edge cases (empty bucket, empty key, malformed URIs, wrong protocol)
- **Integration tests:** Verify end-to-end flow from HTTP request → S3 fetch
- **All existing tests:** Update to use new URI format and verify behavior unchanged

## Risks

**None significant:**

- Test/dev environment only (no production data)
- No migration needed
- All changes are straightforward type/structure updates
- Full test coverage will catch any issues

## Benefits

- **Clearer code:** Single pattern reduces cognitive load
- **Better separation of concerns:** Domain models don't know about S3 implementation details
- **Simpler code:** Less destructuring and nesting in application services
- **Type safety:** Discriminated union enforces URI presence for complete files
- **Future flexibility:** URI pattern could extend to other storage backends if needed (though not currently required)
