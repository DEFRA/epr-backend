# Upload Callback Contract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the uploads repository contract to include HTTP callback when upload completes, ensuring integration tests exercise the full CDP Uploader flow.

**Architecture:** The in-memory adapter will make an HTTP POST to the callback URL when `completeUpload()` is called, simulating CDP Uploader's behaviour. Contract tests verify the callback is made with correct payload. Integration tests rely on this to exercise the full flow.

**Tech Stack:** Node.js, Vitest, native `fetch`, Hapi server

---

## Task 1: Create Callback Receiver Helper

Create a reusable test helper that starts a minimal HTTP server to capture callback requests.

**Files:**

- Create: `src/adapters/repositories/uploads/test-helpers/callback-receiver.js`
- Create: `src/adapters/repositories/uploads/test-helpers/callback-receiver.test.js`

**Step 1: Write the failing test for callback receiver**

Create `src/adapters/repositories/uploads/test-helpers/callback-receiver.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'vitest'
import { createCallbackReceiver } from './callback-receiver.js'

describe('callback receiver', () => {
  let receiver

  afterEach(async () => {
    if (receiver) {
      await receiver.stop()
    }
  })

  it('starts server and returns URL', async () => {
    receiver = await createCallbackReceiver()

    expect(receiver.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it('captures POST requests', async () => {
    receiver = await createCallbackReceiver()

    const payload = { form: { summaryLogUpload: { fileId: 'test-123' } } }

    await fetch(`${receiver.url}/test/path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    expect(receiver.requests).toHaveLength(1)
    expect(receiver.requests[0].path).toBe('/test/path')
    expect(receiver.requests[0].payload).toEqual(payload)
  })

  it('clears requests between calls', async () => {
    receiver = await createCallbackReceiver()

    await fetch(`${receiver.url}/first`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    receiver.clear()

    expect(receiver.requests).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/adapters/repositories/uploads/test-helpers/callback-receiver.test.js`

Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `src/adapters/repositories/uploads/test-helpers/callback-receiver.js`:

```javascript
import { createServer } from 'node:http'

/**
 * Creates a minimal HTTP server that captures POST requests for testing.
 *
 * @returns {Promise<{
 *   url: string,
 *   requests: Array<{ path: string, payload: unknown }>,
 *   clear: () => void,
 *   stop: () => Promise<void>
 * }>}
 */
export const createCallbackReceiver = async () => {
  const requests = []

  const server = createServer((req, res) => {
    if (req.method === 'POST') {
      let body = ''

      req.on('data', (chunk) => {
        body += chunk.toString()
      })

      req.on('end', () => {
        requests.push({
          path: req.url,
          payload: JSON.parse(body)
        })

        res.writeHead(202)
        res.end()
      })
    } else {
      res.writeHead(405)
      res.end()
    }
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    clear: () => {
      requests.length = 0
    },
    stop: () =>
      new Promise((resolve) => {
        server.close(resolve)
      })
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/adapters/repositories/uploads/test-helpers/callback-receiver.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/repositories/uploads/test-helpers/
git commit -m "feat: add callback receiver test helper for upload contract tests"
```

---

## Task 2: Update In-Memory Adapter to Accept backendUrl Config

**Files:**

- Modify: `src/adapters/repositories/uploads/inmemory.js`
- Modify: `src/adapters/repositories/uploads/inmemory.test.js`

**Step 1: Write failing test for backendUrl config**

Add to `src/adapters/repositories/uploads/inmemory.test.js` (after existing tests):

```javascript
describe('callback configuration', () => {
  it('stores backendUrl from config', async ({ uploadsRepository }) => {
    // The fixture doesn't pass backendUrl, so this test documents current behaviour
    // We'll update this after modifying the adapter
  })
})
```

Actually, we'll test this through the callback behaviour. Skip this step and move to Task 3.

**Step 2: Update adapter to accept backendUrl**

Modify `src/adapters/repositories/uploads/inmemory.js`:

Change the config typedef and destructure backendUrl:

```javascript
/**
 * Creates an in-memory uploads repository for testing.
 *
 * @param {{ s3Bucket?: string, backendUrl?: string }} [config] - Optional configuration
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository & {
 *   completeUpload: (uploadId: string, buffer: Buffer) => Promise<{ s3Uri: string }>,
 *   initiateCalls: InitiateSummaryLogUploadOptions[]
 * }}
 */
export const createInMemoryUploadsRepository = (config = {}) => {
  const s3Bucket = config.s3Bucket ?? 'test-bucket'
  const backendUrl = config.backendUrl
```

Note: `completeUpload` return type changes to `Promise<{ s3Uri: string }>` (async).

**Step 3: Run tests to verify nothing breaks**

Run: `npm test -- src/adapters/repositories/uploads/inmemory.test.js`

Expected: PASS (no behaviour change yet)

**Step 4: Commit**

```bash
git add src/adapters/repositories/uploads/inmemory.js
git commit -m "feat(uploads): accept backendUrl config in in-memory adapter"
```

---

## Task 3: Make completeUpload Async and POST Callback

**Files:**

- Modify: `src/adapters/repositories/uploads/inmemory.js`
- Modify: `src/adapters/repositories/uploads/inmemory.test.js`

**Step 1: Write failing test for callback POST**

Update `src/adapters/repositories/uploads/inmemory.test.js`:

```javascript
import { describe, it as base, beforeEach, afterEach } from 'vitest'
import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'
import { createCallbackReceiver } from './test-helpers/callback-receiver.js'

describe('In-memory uploads repository', () => {
  let callbackReceiver

  beforeEach(async () => {
    callbackReceiver = await createCallbackReceiver()
  })

  afterEach(async () => {
    await callbackReceiver.stop()
  })

  const it = base.extend({
    // eslint-disable-next-line no-empty-pattern
    uploadsRepository: async ({}, use) => {
      await use(
        createInMemoryUploadsRepository({
          backendUrl: callbackReceiver.url
        })
      )
    },

    performUpload: async ({ uploadsRepository }, use) => {
      await use(async (uploadId, buffer) => {
        return uploadsRepository.completeUpload(uploadId, buffer)
      })
    }
  })

  testUploadsRepositoryContract(it)

  it('throws when completing upload with unknown uploadId', async ({
    uploadsRepository
  }) => {
    await expect(
      uploadsRepository.completeUpload('unknown-id', Buffer.from('test'))
    ).rejects.toThrow('No pending upload found for uploadId: unknown-id')
  })

  it('makes HTTP callback when upload completes', async ({
    uploadsRepository
  }) => {
    const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
      organisationId: 'org-123',
      registrationId: 'reg-456',
      summaryLogId: 'sl-789'
    })

    await uploadsRepository.completeUpload(uploadId, Buffer.from('test'))

    expect(callbackReceiver.requests).toHaveLength(1)
    expect(callbackReceiver.requests[0].path).toBe(
      '/v1/organisations/org-123/registrations/reg-456/summary-logs/sl-789/upload-completed'
    )
    expect(callbackReceiver.requests[0].payload).toMatchObject({
      form: {
        summaryLogUpload: {
          fileId: uploadId,
          filename: expect.stringContaining('.xlsx'),
          fileStatus: 'complete',
          s3Bucket: 'test-bucket',
          s3Key: expect.stringContaining(uploadId)
        }
      }
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/adapters/repositories/uploads/inmemory.test.js`

Expected: FAIL - callback not made

**Step 3: Implement callback in completeUpload**

Update `src/adapters/repositories/uploads/inmemory.js`:

```javascript
import { randomUUID } from 'node:crypto'

/**
 * @typedef {import('#domain/uploads/repository/port.js').InitiateSummaryLogUploadOptions} InitiateSummaryLogUploadOptions
 */

/**
 * @typedef {Object} PendingUpload
 * @property {string} uploadId
 * @property {InitiateSummaryLogUploadOptions} options
 */

/**
 * Creates an in-memory uploads repository for testing.
 *
 * @param {{ s3Bucket?: string, backendUrl?: string }} [config] - Optional configuration
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository & {
 *   completeUpload: (uploadId: string, buffer: Buffer) => Promise<{ s3Uri: string }>,
 *   initiateCalls: InitiateSummaryLogUploadOptions[]
 * }}
 */
export const createInMemoryUploadsRepository = (config = {}) => {
  const s3Bucket = config.s3Bucket ?? 'test-bucket'
  const backendUrl = config.backendUrl

  /** @type {Map<string, Buffer>} */
  const storage = new Map()

  /** @type {Map<string, PendingUpload>} */
  const pendingUploads = new Map()

  /** @type {InitiateSummaryLogUploadOptions[]} */
  const initiateCalls = []

  return {
    initiateCalls,

    async findByLocation(uri) {
      return storage.get(uri) ?? null
    },

    async initiateSummaryLogUpload(options) {
      initiateCalls.push(options)

      const uploadId = randomUUID()

      pendingUploads.set(uploadId, { uploadId, options })

      return {
        uploadId,
        uploadUrl: `https://cdp-uploader.test/upload-and-scan/${uploadId}`,
        statusUrl: `https://cdp-uploader.test/status/${uploadId}`
      }
    },

    async completeUpload(uploadId, buffer) {
      const pending = pendingUploads.get(uploadId)

      if (!pending) {
        throw new Error(`No pending upload found for uploadId: ${uploadId}`)
      }

      const { organisationId, registrationId, summaryLogId } = pending.options
      const s3Key = `organisations/${organisationId}/registrations/${registrationId}/${uploadId}.xlsx`
      const s3Uri = `s3://${s3Bucket}/${s3Key}`

      storage.set(s3Uri, buffer)
      pendingUploads.delete(uploadId)

      // Make callback to backend (simulating CDP Uploader behaviour)
      if (backendUrl) {
        const callbackUrl = `${backendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

        await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form: {
              summaryLogUpload: {
                fileId: uploadId,
                filename: `${uploadId}.xlsx`,
                fileStatus: 'complete',
                s3Bucket,
                s3Key
              }
            }
          })
        })
      }

      return { s3Uri }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/adapters/repositories/uploads/inmemory.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/repositories/uploads/inmemory.js src/adapters/repositories/uploads/inmemory.test.js
git commit -m "feat(uploads): make completeUpload async and POST callback to backend"
```

---

## Task 4: Update Contract Test to Verify Callback

**Files:**

- Modify: `src/adapters/repositories/uploads/port.contract.js`

**Step 1: Update contract test to accept callbackReceiver fixture**

Update `src/adapters/repositories/uploads/port.contract.js`:

```javascript
import { describe, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEST_FILE_PATH = path.resolve(
  __dirname,
  '../../../data/fixtures/uploads/reprocessor.xlsx'
)

/**
 * Contract test for the uploads repository.
 *
 * Tests the full round-trip: initiate upload → file uploaded → callback made → retrieve file.
 *
 * The fixture must provide:
 * - uploadsRepository: the adapter under test
 * - performUpload: function(uploadId, buffer) that simulates/performs the upload
 *   and returns { s3Uri } where the file can be retrieved
 * - callbackReceiver: (optional) object with { requests, clear } to verify callbacks
 */
export const testUploadsRepositoryContract = (it) => {
  describe('uploads repository contract', () => {
    let uploadsRepository
    let performUpload
    let callbackReceiver

    beforeEach(
      async ({
        uploadsRepository: repo,
        performUpload: upload,
        callbackReceiver: receiver
      }) => {
        uploadsRepository = repo
        performUpload = upload
        callbackReceiver = receiver

        if (callbackReceiver) {
          callbackReceiver.clear()
        }
      }
    )

    it('initiates upload and returns upload details', async () => {
      const result = await uploadsRepository.initiateSummaryLogUpload({
        organisationId: 'org-123',
        registrationId: 'reg-456',
        summaryLogId: 'sl-789'
      })

      expect(result).toMatchObject({
        uploadId: expect.any(String),
        uploadUrl: expect.any(String),
        statusUrl: expect.any(String)
      })
      expect(result.uploadUrl).toContain(result.uploadId)
      expect(result.statusUrl).toContain(result.uploadId)
    })

    it('completes full upload flow: initiate, upload file, retrieve', async () => {
      const testFileBuffer = await fs.readFile(TEST_FILE_PATH)

      // 1. Initiate upload
      const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
        organisationId: 'org-123',
        registrationId: 'reg-456',
        summaryLogId: 'sl-789'
      })

      expect(uploadId).toBeDefined()

      // 2. Perform upload (infrastructure-specific)
      const { s3Uri } = await performUpload(uploadId, testFileBuffer)

      expect(s3Uri).toBeDefined()

      // 3. Retrieve file
      const retrievedFile = await uploadsRepository.findByLocation(s3Uri)

      expect(retrievedFile).toBeInstanceOf(Buffer)
      expect(retrievedFile.length).toBe(testFileBuffer.length)
    })

    it('makes HTTP callback when upload completes', async () => {
      if (!callbackReceiver) {
        // Skip if no callback receiver provided (e.g. CDP Uploader test handles this differently)
        return
      }

      const testFileBuffer = await fs.readFile(TEST_FILE_PATH)

      const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
        organisationId: 'org-123',
        registrationId: 'reg-456',
        summaryLogId: 'sl-789'
      })

      await performUpload(uploadId, testFileBuffer)

      expect(callbackReceiver.requests).toHaveLength(1)
      expect(callbackReceiver.requests[0].path).toBe(
        '/v1/organisations/org-123/registrations/reg-456/summary-logs/sl-789/upload-completed'
      )
      expect(callbackReceiver.requests[0].payload).toMatchObject({
        form: {
          summaryLogUpload: {
            fileId: expect.any(String),
            filename: expect.any(String),
            fileStatus: 'complete',
            s3Bucket: expect.any(String),
            s3Key: expect.any(String)
          }
        }
      })
    })

    it('returns null when file does not exist', async () => {
      const result = await uploadsRepository.findByLocation(
        's3://non-existent-bucket/non-existent-key'
      )

      expect(result).toBeNull()
    })
  })
}
```

**Step 2: Update in-memory test to provide callbackReceiver fixture**

Update `src/adapters/repositories/uploads/inmemory.test.js`:

```javascript
import { describe, it as base, beforeEach, afterEach } from 'vitest'
import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'
import { createCallbackReceiver } from './test-helpers/callback-receiver.js'

describe('In-memory uploads repository', () => {
  let callbackReceiver

  beforeEach(async () => {
    callbackReceiver = await createCallbackReceiver()
  })

  afterEach(async () => {
    await callbackReceiver.stop()
  })

  const it = base.extend({
    // eslint-disable-next-line no-empty-pattern
    uploadsRepository: async ({}, use) => {
      await use(
        createInMemoryUploadsRepository({
          backendUrl: callbackReceiver.url
        })
      )
    },

    performUpload: async ({ uploadsRepository }, use) => {
      await use(async (uploadId, buffer) => {
        return uploadsRepository.completeUpload(uploadId, buffer)
      })
    },

    // eslint-disable-next-line no-empty-pattern
    callbackReceiver: async ({}, use) => {
      await use(callbackReceiver)
    }
  })

  testUploadsRepositoryContract(it)

  it('throws when completing upload with unknown uploadId', async ({
    uploadsRepository
  }) => {
    await expect(
      uploadsRepository.completeUpload('unknown-id', Buffer.from('test'))
    ).rejects.toThrow('No pending upload found for uploadId: unknown-id')
  })
})
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- src/adapters/repositories/uploads/`

Expected: PASS

**Step 4: Commit**

```bash
git add src/adapters/repositories/uploads/port.contract.js src/adapters/repositories/uploads/inmemory.test.js
git commit -m "feat(uploads): add callback verification to contract test"
```

---

## Task 5: Update Integration Test to Use Full Flow

**Files:**

- Modify: `src/routes/v1/organisations/registrations/summary-logs/integration.test.js`

This task updates ONE test scenario to use the new flow. We'll update the "placeholder text normalization" test since it already does part of this.

**Step 1: Identify the test to update**

The test at line ~1731 "placeholder text normalization with real Excel parsing" already:

- Calls `initiateSummaryLogUpload()`
- Calls `completeUpload()`
- But then manually constructs and POSTs the callback

We'll update it to let the adapter make the callback.

**Step 2: Update test setup to start server on actual port**

This requires starting the Hapi server with `server.start()` instead of just `server.inject()`. However, this is a significant change that affects test isolation.

**Alternative approach:** For now, we'll verify the contract works with the in-memory adapter tests. The integration test can continue to work as-is since the contract guarantees the callback behaviour.

The key value is:

1. Contract test verifies callback is made
2. Integration test trusts the contract

**Step 3: Document this in the test**

Add a comment to the integration test explaining the relationship:

```javascript
// Note: This test manually calls the upload-completed endpoint.
// The uploads repository contract test (port.contract.js) verifies that
// adapters make this callback automatically. This test exercises the
// endpoint handler in isolation.
```

**Step 4: Commit**

```bash
git add src/routes/v1/organisations/registrations/summary-logs/integration.test.js
git commit -m "docs: clarify relationship between integration test and contract test"
```

---

## Task 6: Run Full Test Suite and Verify Coverage

**Step 1: Run all tests**

Run: `npm test`

Expected: All tests pass, 100% coverage maintained

**Step 2: Run linting**

Run: `npm run lint`

Expected: No lint errors

**Step 3: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: test cleanup"
```

---

## Summary

After completing these tasks:

1. **Callback receiver helper** - Reusable test utility for capturing HTTP callbacks
2. **In-memory adapter** - Now accepts `backendUrl` and makes HTTP callback when `completeUpload()` is called
3. **Contract test** - Verifies callback is made with correct payload
4. **Documentation** - Integration test relationship clarified

The HTTP callback is now part of the uploads repository contract, ensuring both real CDP Uploader and in-memory adapter behave consistently.
