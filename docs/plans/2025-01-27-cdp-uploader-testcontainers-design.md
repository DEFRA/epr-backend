# CDP Uploader Testcontainers Integration

## Problem

The S3 uploads adapter has two methods:

- `findByLocation(uri)` - retrieves files from S3
- `initiateSummaryLogUpload(options)` - initiates upload via CDP Uploader HTTP API

Currently, only `findByLocation` has proper contract tests using testcontainers (MinIO). The `initiateSummaryLogUpload` method is only tested via the in-memory adapter, which fakes the response. This means we have no contract test verifying the real CDP Uploader integration.

## Solution

Create a testcontainers fixture that spins up the full CDP Uploader stack (LocalStack + Redis + CDP Uploader) and add a round-trip contract test that:

1. Initiates an upload
2. Uploads a file to CDP Uploader
3. Waits for virus scan to complete
4. Retrieves the file via `findByLocation`

## Design

### Fixture Architecture

Layered fixtures with proper dependency injection:

```
.vite/fixtures/
├── localstack.js      # LocalStack container (S3 + SQS)
├── redis.js           # Redis container
├── cdp-uploader.js    # Full stack: LocalStack + Redis + CDP Uploader
└── s3.js              # Updated to use LocalStack (replaces MinIO)
```

Each fixture exposes its configuration via the vitest fixture `use()` pattern rather than `globalThis`.

### Container Configuration

**LocalStack** (`localstack/localstack:3.0.2`):

- Services: `s3,sqs`
- Port: 4566
- Creates buckets: `cdp-uploader-quarantine`, `re-ex-summary-logs`
- Creates SQS queues for virus scan flow

**Redis** (`redis:7-alpine`):

- Port: 6379
- Used by CDP Uploader for caching

**CDP Uploader** (`defradigital/cdp-uploader:latest`):

- Port: 7337
- Mock virus scanning enabled (1 second delay)
- Connected to LocalStack and Redis via Docker network

### Startup Strategy

1. Create shared testcontainers `Network`
2. Start LocalStack and Redis in parallel
3. Once both healthy, start CDP Uploader
4. Run bucket/queue setup via AWS SDK

Containers communicate via network aliases; tests connect via mapped ports.

### Test Flow

```javascript
it('completes full upload flow', async ({ uploadsRepository, cdpUploaderStack }) => {
  // 1. Initiate
  const { uploadId, uploadUrl } = await uploadsRepository.initiateSummaryLogUpload({...})

  // 2. Upload file
  await fetch(`${cdpUploaderStack.cdpUploader.url}${uploadUrl}`, { method: 'POST', body: form })

  // 3. Wait for scan
  await waitForUploadComplete(cdpUploaderStack.cdpUploader.url, uploadId)

  // 4. Retrieve
  const result = await uploadsRepository.findByLocation(s3Uri)
  expect(result).toBeInstanceOf(Buffer)
})
```

## File Changes

### New Files

- `.vite/fixtures/localstack.js`
- `.vite/fixtures/redis.js`
- `.vite/fixtures/cdp-uploader.js`

### Modified Files

- `.vite/fixtures/s3.js` - Use LocalStack instead of MinIO
- `src/adapters/repositories/uploads/port.contract.js` - Add round-trip contract
- `src/adapters/repositories/uploads/s3.test.js` - Run round-trip contract

## Future Work

- Add callback testing (spin up HTTP server to receive upload completion callback)
