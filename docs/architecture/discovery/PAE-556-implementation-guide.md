# PAE-556: Track Summary Log from Upload Initiation

> **Temporary implementation guide** - merge relevant sections into permanent docs once implemented.

## Problem

Currently, the frontend calls CDP Uploader directly to initiate uploads. The backend only learns about an upload when CDP calls `upload-completed`. This means:

- No visibility into uploads that were started but never completed
- Cannot distinguish "no upload exists" from "upload in progress"
- No tracking of abandoned uploads

## Solution

Route upload initiation through the backend:

```
Current:  Frontend → CDP Uploader → (callback) → Backend
Proposed: Frontend → Backend → CDP Uploader → (callback) → Backend
```

## New Backend Endpoint

### `POST /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs`

Creates a summary log and proxies to CDP Uploader.

**Request body:**

```json
{
  "mimeTypes": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  "maxFileSize": 10485760
}
```

**Response:**

```json
{
  "summaryLogId": "generated-uuid",
  "uploadId": "cdp-upload-id",
  "uploadUrl": "/upload-and-scan/{uploadId}",
  "statusUrl": "https://cdp-uploader.../status/{uploadId}"
}
```

**Implementation steps:**

1. Generate `summaryLogId` (UUID)
2. Create summary log entity with status `preprocessing`
3. Call CDP Uploader `/initiate` endpoint
4. Update summary log with `uploadId`
5. Return response to frontend

## CDP Uploader `/initiate` API

**Endpoint:** `POST https://cdp-uploader.{env}.cdp-int.defra.cloud/initiate`

**Request body:**

```json
{
  "redirect": "/organisations/{orgId}/registrations/{regId}/summary-logs/{summaryLogId}",
  "callback": "https://epr-backend.{env}.../v1/organisations/{orgId}/registrations/{regId}/summary-logs/{summaryLogId}/upload-completed",
  "s3Bucket": "tenant-bucket",
  "s3Path": "/organisations/{orgId}/registrations/{regId}",
  "mimeTypes": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  "maxFileSize": 10485760,
  "metadata": {
    "summaryLogId": "the-generated-uuid"
  }
}
```

**Response:**

```json
{
  "uploadId": "fc730e47-73c6-4219-a3c5-49b6dfce6e71",
  "uploadUrl": "/upload-and-scan/fc730e47-73c6-4219-a3c5-49b6dfce6e71",
  "statusUrl": "https://cdp-uploader.{env}.cdp-int.defra.cloud/status/fc730e47-73c6-4219-a3c5-49b6dfce6e71"
}
```

**Notes:**
- `callback` is optional but we use it
- `redirect` is relative - gets appended to frontend URL after upload
- `s3Path` is optional prefix for file organisation
- `uploadUrl` is relative - frontend appends to its base URL

## CDP Uploader Callback

When virus scan completes, CDP calls our existing `upload-completed` endpoint:

**Payload:**

```json
{
  "uploadStatus": "ready",
  "metadata": {
    "summaryLogId": "the-generated-uuid"
  },
  "form": {
    "file": {
      "fileId": "c17543b8-e440-4156-8df4-af62f40a7ac8",
      "filename": "summary-log.xlsx",
      "fileStatus": "complete",
      "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "contentLength": 102400,
      "s3Bucket": "tenant-bucket",
      "s3Key": "fc730e47-73c6-4219-a3c5-49b6dfce6e71/c17543b8-e440-4156-8df4-af62f40a7ac8"
    }
  },
  "numberOfRejectedFiles": 0
}
```

**`fileStatus` values:**
- `complete` - scan passed, file in S3
- `rejected` - scan failed (virus), file deleted
- `pending` - still scanning (rare to see in callback)

## Current Frontend Code

**Location:** `epr-frontend/main/src/server/summary-log-upload/controller.js`

```javascript
// Currently generates summaryLogId in frontend
const summaryLogId = crypto.randomUUID()

const { uploadId, uploadUrl, statusUrl } = await initUpload({
  redirect: `/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
  callback: `${eprBackendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
  s3Bucket,
  s3path: `/organisations/${organisationId}/registrations/${registrationId}`,  // Note: lowercase bug!
  mimeTypes: [mimeTypes.xlsx],
  metadata: { summaryLogId }
})
```

**Bug:** `s3path` should be `s3Path` (capital P) to match `init-upload.js`

## Frontend Changes Required

Replace the direct CDP call with a backend call:

```javascript
// NEW: Call backend instead of CDP directly
const response = await fetch(
  `${eprBackendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mimeTypes: [mimeTypes.xlsx],
      maxFileSize: config.get('cdpUploader.maxFileSize')
    })
  }
)

const { summaryLogId, uploadId, uploadUrl, statusUrl } = await response.json()

// Rest stays the same - store in session, render view with uploadUrl
```

## Backend Changes Required

### 1. New route: `POST /summary-logs`

**File:** `src/routes/v1/organisations/registrations/summary-logs/post.js`

```javascript
export const summaryLogsCreate = {
  method: 'POST',
  path: '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs',
  options: {
    // auth config
    validate: {
      payload: Joi.object({
        mimeTypes: Joi.array().items(Joi.string()),
        maxFileSize: Joi.number().optional()
      })
    }
  },
  handler: async (request, h) => {
    const { organisationId, registrationId } = request.params
    const { mimeTypes, maxFileSize } = request.payload

    // 1. Generate summaryLogId
    const summaryLogId = crypto.randomUUID()

    // 2. Create summary log with preprocessing status
    await summaryLogsRepository.insert(summaryLogId, {
      status: 'preprocessing',
      organisationId,
      registrationId
    })

    // 3. Call CDP Uploader
    const cdpResponse = await initiateCdpUpload({
      redirect: `${frontendUrl}/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
      callback: `${backendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      s3Bucket: config.get('s3.summaryLogsBucket'),
      s3Path: `/organisations/${organisationId}/registrations/${registrationId}`,
      mimeTypes,
      maxFileSize,
      metadata: { summaryLogId }
    })

    // 4. Update summary log with uploadId
    await summaryLogsRepository.update(summaryLogId, {
      uploadId: cdpResponse.uploadId
    })

    // 5. Return to frontend
    return h.response({
      summaryLogId,
      uploadId: cdpResponse.uploadId,
      uploadUrl: cdpResponse.uploadUrl,
      statusUrl: cdpResponse.statusUrl
    }).code(201)
  }
}
```

### 2. New helper: CDP Uploader client

**File:** `src/common/helpers/cdp-uploader.js`

```javascript
import fetch from 'node-fetch'
import { config } from '#config/config.js'

export async function initiateCdpUpload(options) {
  const cdpUploaderUrl = config.get('cdpUploader.url')

  const response = await fetch(`${cdpUploaderUrl}/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  })

  if (!response.ok) {
    throw new Error(`CDP Uploader initiate failed: ${response.status}`)
  }

  return response.json()
}
```

### 3. Config additions

Add CDP Uploader URL to config if not already present:

```javascript
cdpUploader: {
  url: Joi.string().default('https://cdp-uploader.{env}.cdp-int.defra.cloud')
}
```

### 4. Update `upload-completed` endpoint

The existing endpoint already handles both create and update (lines 108-115 in `post.js`). After this change, it will always find an existing entity. The create path becomes dead code but can be left for safety, or removed with a guard:

```javascript
if (!existing) {
  // This shouldn't happen after PAE-556 - log warning
  logger.warn({ summaryLogId }, 'upload-completed called for non-existent summary log')
  // Still create for backwards compatibility during rollout
  await summaryLogsRepository.insert(summaryLogId, summaryLog)
}
```

## Status Flow

```
[POST /summary-logs]     → preprocessing
[CDP callback: complete] → validating → validated/invalid
[POST /submit]           → submitting → submitted/submission_failed
```

## Testing Considerations

1. **Unit tests** for new endpoint and CDP client helper
2. **Integration test** mocking CDP Uploader response
3. **Contract test** verifying CDP Uploader payload format
4. **Frontend update** to call backend instead of CDP directly

## Rollout Considerations

1. Deploy backend first (new endpoint)
2. Deploy frontend (switch to calling backend)
3. The `upload-completed` create path provides backwards compatibility during rollout

## References

- CDP Uploader docs: `cdp-documentation/main/how-to/file-upload.md`
- LLD sequence diagram: `docs/architecture/discovery/pepr-lld.md` (Phase 1)
- Status transitions: `docs/architecture/defined/summary-log-submission-lld.md`
