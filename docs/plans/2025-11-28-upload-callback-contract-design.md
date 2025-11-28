# Upload Callback Contract Design

This document describes the design for extending the uploads repository contract to include the CDP Uploader callback, ensuring integration tests exercise the full upload flow.

## Problem

The current integration tests bypass the CDP Uploader callback:

1. Tests manually construct callback payloads
2. Tests POST directly to the `upload-completed` endpoint
3. The in-memory adapter's `completeUpload()` only stores the file - it doesn't trigger a callback

This means we're not testing that our backend correctly handles callbacks from CDP Uploader as part of the upload flow.

## Design

### Contract Extension

The uploads repository contract currently defines:

- `initiateSummaryLogUpload()` - returns uploadId, uploadUrl, statusUrl
- `findByLocation()` - retrieves file from S3

We're adding an implicit contract requirement: **when an upload completes, the adapter must make an HTTP POST to the callback URL**.

The callback URL is constructed from the `backendUrl` config and the IDs provided during `initiateSummaryLogUpload()`.

### HTTP Callback as Part of the Contract

The HTTP callback is part of the contract - both adapters must make it:

- **Real CDP Uploader**: CDP Uploader makes the callback after virus scan completes
- **In-memory adapter**: The adapter makes the callback when `completeUpload()` is called

Both adapters use `fetch` to make the HTTP request, ensuring consistent behaviour.

### Contract Test Changes

The contract test sets up a simple HTTP server to receive callbacks:

1. Start a minimal HTTP server that captures POST requests
2. Configure the adapter with this server's URL as `backendUrl`
3. Verify the callback was made with correct payload after upload completes

```javascript
it('makes HTTP callback when upload completes', async () => {
  const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
    organisationId: 'org-123',
    registrationId: 'reg-456',
    summaryLogId: 'sl-789'
  })

  await performUpload(uploadId, testFileBuffer)

  expect(callbackReceiver.requests).toHaveLength(1)
  expect(callbackReceiver.requests[0].payload).toMatchObject({
    form: {
      summaryLogUpload: {
        fileStatus: 'complete',
        s3Bucket: expect.any(String),
        s3Key: expect.any(String)
      }
    }
  })
})
```

### In-Memory Adapter Changes

The in-memory adapter needs to:

1. **Accept `backendUrl` in config** - base URL for callback requests
2. **Store callback info** in pending uploads (organisationId, registrationId, summaryLogId)
3. **Make `completeUpload()` async** - it now makes an HTTP request
4. **POST to callback URL** via `fetch` when upload completes

```javascript
createInMemoryUploadsRepository({
  s3Bucket: 'test-bucket',
  backendUrl: 'http://localhost:3001'
})
```

### Integration Test Changes

Integration tests can now use the adapter to trigger the full flow:

1. Start Hapi server on actual port (`server.start()`)
2. Configure adapter with `backendUrl: server.info.uri`
3. Call `initiateSummaryLogUpload()` + `completeUpload()`
4. Adapter makes callback via `fetch` - server handles it - status transitions
5. Poll for validation

This replaces manually constructing callback payloads.

### Flexibility

If using `fetch` with actual HTTP servers proves impractical (port conflicts, cleanup issues), we can fall back to `server.inject()` for integration tests. The contract test would still use real HTTP to verify the callback behaviour.

## Implementation Steps

1. **Update in-memory adapter** (`inmemory.js`):
   - Accept `backendUrl` in config
   - Store callback URL info in pending uploads
   - Make `completeUpload()` async
   - POST to callback URL via `fetch` when upload completes

2. **Update contract test** (`port.contract.js`):
   - Set up a simple HTTP server to receive callbacks
   - Add test case verifying callback is made with correct payload
   - Pass `backendUrl` to adapter fixture

3. **Update in-memory adapter test** (`inmemory.test.js`):
   - Start callback receiver server
   - Configure adapter with server URL

4. **Update integration test** (`integration.test.js`):
   - Start Hapi server on actual port
   - Use `initiateSummaryLogUpload()` + `completeUpload()` instead of manual payload
   - Let the adapter trigger the callback

5. **Clean up**: Remove redundant manual callback tests if appropriate.

## Benefits

- **Contract guarantee**: Both adapters are verified to make the HTTP callback
- **True integration testing**: Tests exercise the real flow, not shortcuts
- **Adapter swappability**: Same tests can run against either adapter (only in-memory for now)
- **Confidence**: We know our backend handles CDP Uploader callbacks correctly
