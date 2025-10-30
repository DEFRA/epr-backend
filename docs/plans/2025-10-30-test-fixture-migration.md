# Test Fixture Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert all test files from global MongoDB setup to opt-in fixture pattern for faster unit test execution.

**Architecture:** Replace global `setupFiles` with Vitest 4 test fixtures. Tests import fixtures (dbTest, s3Test, serverTest) only when needed. Unit tests that don't need MongoDB will skip the 6-second setup entirely.

**Tech Stack:** Vitest 4.0.4, vitest-mongodb 1.0.2, Vitest test fixtures with file-scoped setup

---

## Task 1: Convert summary logs repository test

**Files:**

- Modify: `src/repositories/summary-logs/mongodb.test.js`

**Step 1: Update imports**

Replace the first line:

```javascript
import { randomUUID } from 'node:crypto'
```

With:

```javascript
import { randomUUID } from 'node:crypto'
import {
  serverTest as test,
  beforeEach,
  describe,
  expect
} from '../../../.vite/db-fixture.js'
```

Remove existing vitest imports if present.

**Step 2: Remove beforeAll/afterAll hooks**

Find and delete this code block:

```javascript
let server
let summaryLogsRepositoryFactory

beforeAll(async () => {
  const { createServer } = await import('#server/server.js')
  server = await createServer()
  await server.initialize()

  summaryLogsRepositoryFactory = createSummaryLogsRepository(server.db)
})

afterAll(async () => {
  await server.stop()
})
```

**Step 3: Update contract test call**

Replace:

```javascript
testSummaryLogsRepositoryContract((logger) =>
  summaryLogsRepositoryFactory(logger)
)
```

With:

```javascript
test('summary logs repository contract', async ({ server }) => {
  const summaryLogsRepositoryFactory = createSummaryLogsRepository(server.db)
  testSummaryLogsRepositoryContract((logger) =>
    summaryLogsRepositoryFactory(logger)
  )
})
```

**Step 4: Convert it() to test() for MongoDB-specific tests**

Find each `it('test name', async () => {` inside MongoDB-specific error handling describe blocks and replace with:

```javascript
test('test name', async () => {
```

**Step 5: Run test to verify**

Run: `TZ=UTC npx vitest run src/repositories/summary-logs/mongodb.test.js`

Expected: All tests pass

**Step 6: Commit**

```bash
git add src/repositories/summary-logs/mongodb.test.js
git commit -m "test: convert summary logs repository to use serverTest fixture"
```

---

## Task 2: Convert mongo helper test

**Files:**

- Modify: `src/common/helpers/mongo.test.js`

**Step 1: Update imports**

Add at the top after existing imports:

```javascript
import {
  serverTest as test,
  beforeAll,
  describe,
  expect
} from '../../../.vite/db-fixture.js'
```

**Step 2: Remove top-level server variable**

Delete:

```javascript
let server
```

**Step 3: Convert first describe block**

Find:

```javascript
describe('Set up', () => {
  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()
  })
```

Replace entire 'Set up' describe block with:

```javascript
describe('Set up', () => {
  test('should have expected decorators', async ({ server }) => {
    expect(server.db).toBeInstanceOf(Db)
    expect(server.mongoClient).toBeInstanceOf(MongoClient)
    expect(server.locker).toBeInstanceOf(LockManager)
  })

  test('should have expected database name', async ({ server }) => {
    expect(server.db.databaseName).toBe('epr-backend')
  })

  test('should have expected namespace', async ({ server }) => {
    expect(server.db.namespace).toBe('epr-backend')
  })
})
```

**Step 4: Convert second describe block**

Replace entire 'Shut down' describe block with:

```javascript
describe('Shut down', () => {
  test('should close Mongo client on server stop', async ({ server }) => {
    const closeSpy = vi.spyOn(server.mongoClient, 'close')
    await server.stop()

    expect(closeSpy).toHaveBeenCalledWith()
  })
})
```

**Step 5: Run test to verify**

Run: `TZ=UTC npx vitest run src/common/helpers/mongo.test.js`

Expected: All tests pass

**Step 6: Commit**

```bash
git add src/common/helpers/mongo.test.js
git commit -m "test: convert mongo helper to use serverTest fixture"
```

---

## Task 3: Convert start-server test

**Files:**

- Modify: `src/start-server.test.js`

**Step 1: Update imports**

Add after existing imports:

```javascript
import {
  serverTest as test,
  describe,
  expect,
  beforeEach,
  afterEach
} from '../.vite/db-fixture.js'
```

**Step 2: Examine current structure**

Read the entire file to understand its structure (it has complex mocking and beforeAll hooks).

**Step 3: Replace server creation pattern**

Find any `beforeAll` or `beforeEach` hooks that call `createServer()` and convert them to use the `{ server }` fixture parameter instead.

Pattern to look for:

```javascript
beforeAll(async () => {
  const { createServer } = await import(...)
  server = await createServer()
  await server.initialize()
})
```

Replace with tests that accept `{ server }` parameter.

**Step 4: Update all it() to test()**

Replace all `it('test name'` with `test('test name'` and add `{ server }` parameter where server is used.

**Step 5: Remove afterAll server cleanup**

Delete any:

```javascript
afterAll(async () => {
  await server.stop()
})
```

**Step 6: Run test to verify**

Run: `TZ=UTC npx vitest run src/start-server.test.js`

Expected: All tests pass

**Step 7: Commit**

```bash
git add src/start-server.test.js
git commit -m "test: convert start-server to use serverTest fixture"
```

---

## Task 4: Convert createTestServer helper to use fixture

**Files:**

- Modify: `src/test/create-test-server.js`
- Create: `src/test/create-test-server-fixture.js`

**Step 1: Create new fixture-based helper**

Create `src/test/create-test-server-fixture.js`:

```javascript
import { serverTest as test } from '../../.vite/db-fixture.js'
import { vi } from 'vitest'

/**
 * @typedef {import('#common/hapi-types.js').HapiServer & {
 *   loggerMocks: {
 *     info: ReturnType<typeof vi.fn>
 *     error: ReturnType<typeof vi.fn>
 *     warn: ReturnType<typeof vi.fn>
 *   }
 * }} TestServer
 */

/**
 * Extends serverTest fixture with logger mocks.
 * Use this in route tests that need a full test server with MongoDB.
 */
export const testServerFixture = test.extend(
  {
    testServer: async ({ server }, use) => {
      /** @type {TestServer} */
      const testServer = /** @type {*} */ (server)

      testServer.loggerMocks = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
      }

      testServer.ext('onRequest', (request, h) => {
        vi.spyOn(request.logger, 'info').mockImplementation(
          testServer.loggerMocks.info
        )
        vi.spyOn(request.logger, 'error').mockImplementation(
          testServer.loggerMocks.error
        )
        vi.spyOn(request.logger, 'warn').mockImplementation(
          testServer.loggerMocks.warn
        )
        return h.continue
      })

      await use(testServer)
    }
  },
  { scope: 'file' }
)

export { expect, describe, beforeEach, afterEach } from 'vitest'
```

**Step 2: Run linter**

Run: `npm run lint`

Expected: No errors

**Step 3: Commit**

```bash
git add src/test/create-test-server-fixture.js
git commit -m "test: add fixture-based test server helper"
```

---

## Task 5: Convert route test - health check

**Files:**

- Modify: `src/routes/health.test.js`

**Step 1: Update imports**

Replace:

```javascript
// Old createTestServer import
```

With:

```javascript
import {
  testServerFixture as test,
  describe,
  expect
} from '../../test/create-test-server-fixture.js'
```

**Step 2: Remove beforeEach hook**

Delete:

```javascript
beforeEach(async () => {
  server = await createTestServer()
})
```

**Step 3: Convert tests**

Replace all `it('test name', async () => {` with `test('test name', async ({ testServer }) => {`

Replace all references to `server` with `testServer`.

**Step 4: Run test to verify**

Run: `TZ=UTC npx vitest run src/routes/health.test.js`

Expected: All tests pass

**Step 5: Commit**

```bash
git add src/routes/health.test.js
git commit -m "test: convert health route to use testServerFixture"
```

---

## Task 6: Convert route tests - apply endpoints

**Files:**

- Modify: `src/routes/v1/apply/accreditation.test.js`
- Modify: `src/routes/v1/apply/organisation.test.js`
- Modify: `src/routes/v1/apply/registration.test.js`

**Step 1: Convert accreditation route test**

Follow the same pattern as Task 5:

1. Update imports to use `testServerFixture`
2. Remove `beforeEach` that creates server
3. Convert `it()` to `test()` with `{ testServer }` parameter
4. Replace `server` with `testServer`

**Step 2: Run test to verify accreditation**

Run: `TZ=UTC npx vitest run src/routes/v1/apply/accreditation.test.js`

Expected: All tests pass

**Step 3: Commit accreditation**

```bash
git add src/routes/v1/apply/accreditation.test.js
git commit -m "test: convert accreditation route to use testServerFixture"
```

**Step 4: Convert organisation route test**

Repeat steps 1-2 for `organisation.test.js`

**Step 5: Commit organisation**

```bash
git add src/routes/v1/apply/organisation.test.js
git commit -m "test: convert organisation route to use testServerFixture"
```

**Step 6: Convert registration route test**

Repeat steps 1-2 for `registration.test.js`

**Step 7: Commit registration**

```bash
git add src/routes/v1/apply/registration.test.js
git commit -m "test: convert registration route to use testServerFixture"
```

---

## Task 7: Convert route tests - organisation endpoints

**Files:**

- Modify: `src/routes/v1/organisations/get.test.js`
- Modify: `src/routes/v1/organisations/get-by-id.test.js`

**Step 1: Convert get route test**

Follow the same pattern:

1. Update imports to use `testServerFixture`
2. Remove server creation hooks
3. Convert `it()` to `test({ testServer })`
4. Replace `server` with `testServer`

**Step 2: Run test to verify**

Run: `TZ=UTC npx vitest run src/routes/v1/organisations/get.test.js`

Expected: All tests pass

**Step 3: Commit get route**

```bash
git add src/routes/v1/organisations/get.test.js
git commit -m "test: convert organisations get route to use testServerFixture"
```

**Step 4: Convert get-by-id route test**

Repeat for `get-by-id.test.js`

**Step 5: Commit get-by-id route**

```bash
git add src/routes/v1/organisations/get-by-id.test.js
git commit -m "test: convert organisations get-by-id route to use testServerFixture"
```

---

## Task 8: Convert route tests - summary logs endpoints

**Files:**

- Modify: `src/routes/v1/organisations/registrations/summary-logs/validate/post.test.js`
- Modify: `src/routes/v1/organisations/registrations/summary-logs/upload-completed/post.test.js`
- Modify: `src/routes/v1/organisations/registrations/summary-logs/integration.test.js`

**Step 1: Convert validate post route**

Follow the pattern:

1. Update imports
2. Remove server creation
3. Convert tests to use `{ testServer }`

**Step 2: Run and commit validate post**

Run: `TZ=UTC npx vitest run src/routes/v1/organisations/registrations/summary-logs/validate/post.test.js`

```bash
git add src/routes/v1/organisations/registrations/summary-logs/validate/post.test.js
git commit -m "test: convert validate post route to use testServerFixture"
```

**Step 3: Convert upload-completed post route**

Repeat for `upload-completed/post.test.js`

**Step 4: Run and commit upload-completed**

Run: `TZ=UTC npx vitest run src/routes/v1/organisations/registrations/summary-logs/upload-completed/post.test.js`

```bash
git add src/routes/v1/organisations/registrations/summary-logs/upload-completed/post.test.js
git commit -m "test: convert upload-completed post route to use testServerFixture"
```

**Step 5: Convert integration test**

Repeat for `integration.test.js`

**Step 6: Run and commit integration**

Run: `TZ=UTC npx vitest run src/routes/v1/organisations/registrations/summary-logs/integration.test.js`

```bash
git add src/routes/v1/organisations/registrations/summary-logs/integration.test.js
git commit -m "test: convert summary logs integration test to use testServerFixture"
```

---

## Task 9: Run full test suite and verify performance

**Files:**

- None (verification only)

**Step 1: Run all tests**

Run: `TZ=UTC npm test 2>&1 | tee test-output.txt`

Expected: All tests pass (ignore pre-existing AWS SDK errors)

**Step 2: Check performance**

Look at timing in output:

- Total duration should be similar or faster than baseline (11.43s)
- Unit tests should run very fast (< 1s combined)
- Integration tests will still take time due to MongoDB setup

**Step 3: Run unit tests without MongoDB**

Run a pure unit test to verify it's fast:

```bash
TZ=UTC npx vitest run src/common/helpers/apply/extract-answers.test.js
```

Expected: Completes in < 500ms

**Step 4: Commit verification results**

```bash
git add test-output.txt
git commit -m "test: verify all tests pass with fixture migration"
```

---

## Task 10: Update test performance analysis documentation

**Files:**

- Modify: `docs/test-performance-analysis.md`

**Step 1: Add migration section**

Add a new section at the end of the document:

````markdown
## Update: Test Fixture Migration (2025-10-30)

**Implementation:** Migrated from global `setupFiles` to opt-in test fixtures using Vitest 4's `test.extend()` API.

**Fixtures Available:**

- `dbTest` - MongoDB only
- `s3Test` - S3 only
- `integrationTest` - Both MongoDB and S3
- `serverTest` - Full Hapi server with MongoDB
- `testServerFixture` - Hapi server with MongoDB and logger mocks (for route tests)

**Usage:**

```javascript
// Unit tests (no MongoDB) - import from 'vitest'
import { describe, it, expect } from 'vitest'

// Integration tests (need MongoDB) - import from fixture
import { serverTest as test, describe, expect } from '../.vite/db-fixture.js'

test('repository test', async ({ server }) => {
  const repository = createRepository(server.db)
  // ...
})
```
````

**Benefits:**

- Unit tests skip MongoDB setup entirely (6-second savings)
- Clear separation between unit and integration tests
- Better test isolation and faster feedback loops
- Explicit dependencies in test files

**Migration Status:**

- ✅ All repository tests converted
- ✅ All route tests converted
- ✅ Server tests converted
- ✅ Helper tests converted

````

**Step 2: Commit documentation update**

```bash
git add docs/test-performance-analysis.md
git commit -m "docs: document test fixture migration"
````

---

## Completion

After all tasks complete, you should have:

- ✅ All MongoDB-dependent tests using fixtures
- ✅ Unit tests running without MongoDB setup overhead
- ✅ Clear separation between unit and integration tests
- ✅ Full test suite passing
- ✅ Documentation updated

**Next:** Use superpowers:finishing-a-development-branch to complete this work.
