# Contract Tests: Vitest Context Refactor

**Date:** 2025-10-31
**Ticket:** PAE-449
**Status:** Design Approved

## Problem Statement

Our contract testing pattern effectively proves behavioural equivalence across adapters (MongoDB, in-memory, S3). However, dependencies like MongoDB and S3 are managed with manual `beforeAll`/`afterAll`/`beforeEach` hooks in each test file, creating boilerplate and preventing us from leveraging Vitest's test context features.

## Goals

- **Primary:** Cleaner test code with explicit dependency declaration
- **Maintain:** Adapter testing pattern - same contract tests run against multiple implementations
- **Preserve:** 100% test coverage requirement
- **Keep:** Existing contract test logic working with minimal changes

## Success Criteria

Tests clearly declare what dependencies they need, and fixtures provide those dependencies. Some boilerplate is acceptable for clarity and explicitness.

## Design Overview

### Three-Layer Architecture

**Layer 1: Reusable Fixtures**
Composable fixtures using Vitest's `test.extend()`. Each fixture (MongoDB, S3, logger) encapsulates setup, teardown, and provides clean instances. Fixtures declare dependencies on other fixtures.

**Layer 2: Adapter Test Files**
Each adapter test file extends base fixtures with adapter-specific needs. The extended test object provides context containing all dependencies. Adapter file passes this extended test object to contract tests.

**Layer 3: Contract Tests**
Modified to accept test object as first parameter. Use that test object's functions (`it.describe()`, `it.beforeEach()`, `it.it()`) instead of globals. Access fixtures via destructuring in callbacks.

**Flow:** Vitest manages fixture lifecycle → Adapter test extends fixtures → Contract tests use extended test object → Fixtures accessed via destructuring

## Implementation Details

### Contract Test Signature Change

**Current:**

```javascript
export const testFindBehaviour = (repositoryFactory) => {
  describe('find', () => {  // uses global
    let repository
    beforeEach(async () => {  // uses global
      repository = await repositoryFactory()
    })
    it('retrieves by ID', async () => { ... })  // uses global
  })
}
```

**Proposed:**

```javascript
export const testFindBehaviour = (it) => {
  it.describe('find', () => {  // uses passed test object
    let repository
    it.beforeEach(async ({ organisationsRepository }) => {  // destructure fixture
      repository = await organisationsRepository()
    })
    it.it('retrieves by ID', async () => { ... })
  })
}
```

**Key changes:**

- Add `it` as first parameter (the extended test object)
- Replace all global Vitest functions with `it.*` calls
- Access fixtures via destructuring in `beforeEach`/test callbacks
- Contract logic remains identical

### MongoDB Adapter Pattern

Build on existing `.vite/fixtures/mongo.js` which provides `db` fixture:

```javascript
// src/repositories/organisations/mongodb.test.js
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  organisationsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db('epr-backend')
    const factory = createOrganisationsRepository(database)
    await use(factory)
  }
})

it.describe('MongoDB organisations repository', () => {
  // Collection cleanup for each test
  it.beforeEach(async ({ mongoClient }) => {
    await mongoClient
      .db('epr-backend')
      .collection('epr-organisations')
      .deleteMany({})
  })

  testOrganisationsRepositoryContract(it)

  // MongoDB-specific tests continue using extended it normally
  it.describe('MongoDB-specific error handling', () => {
    it('handles unexpected errors', async ({ organisationsRepository }) => {
      // test implementation
    })
  })
})
```

### In-Memory Adapter Pattern

No external dependencies needed, extend base test directly:

```javascript
// src/repositories/organisations/inmemory.test.js
import { it as base } from 'vitest'

const it = base.extend({
  organisationsRepository: async ({}, use) => {
    await use(createInMemoryOrganisationsRepository([]))
  }
})

it.describe('In-memory organisations repository', () => {
  testOrganisationsRepositoryContract(it)
})
```

### S3/Uploads Adapter Pattern

Build on existing `.vite/fixtures/s3.js` which provides `s3` fixture:

```javascript
// src/domain/uploads/repository/port.contract.test.js
import { it as s3It } from '#vite/fixtures/s3.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const it = s3It.extend({
  s3Client: async ({ s3 }, use) => {
    const client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: s3,
      forcePathStyle: true
    })

    await client.send(new CreateBucketCommand({ Bucket: 'test-bucket' }))
    await client.send(
      new PutObjectCommand({
        Bucket: 'test-bucket',
        Key: 'path/to/summary-log.xlsx',
        Body: Buffer.from('test file content')
      })
    )

    await use(client)
    client.destroy()
  },

  uploadsRepository: async ({ s3Client }, use) => {
    await use(createUploadsRepository(s3Client))
  },

  inMemoryUploadsRepository: async ({}, use) => {
    await use(createInMemoryUploadsRepository())
  }
})
```

### Logger Fixture for Summary Logs

Some repositories need logger dependencies:

```javascript
const it = mongoIt.extend({
  logger: async ({}, use) => {
    await use({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    })
  },

  summaryLogsRepository: async ({ mongoClient, logger }, use) => {
    const db = mongoClient.db('epr-backend')
    const factory = createSummaryLogsRepository(db)
    await use(factory(logger))
  }
})
```

## Migration Strategy

### Incremental Approach

1. **Pick one repository** (organisations recommended as starting point)
2. **Update contract tests** - Add `it` parameter, replace globals with `it.*`, use fixture destructuring
3. **Update adapter tests** - Extend fixtures, pass `it` object to contracts
4. **Verify coverage** - Ensure 100% maintained
5. **Repeat for other repositories** - Apply proven pattern

### Repository Migration Order

1. `organisations` (simpler, good starting point)
2. `summary-logs` (adds logger dependency complexity)
3. `uploads` (uses S3 instead of MongoDB)

### Testing During Migration

- Run full test suite after each repository migration
- Verify coverage reports show 100% for migrated code
- Check that both adapter implementations still pass identical contract tests

## Edge Cases

### Collection Cleanup

MongoDB tests need per-test cleanup. Handle in adapter test file:

```javascript
it.beforeEach(async ({ mongoClient }) => {
  await mongoClient
    .db('epr-backend')
    .collection('collection-name')
    .deleteMany({})
})
```

### Multiple Implementations in Same File

Uploads tests both S3 and in-memory in one file. Both fixtures available, tests destructure what they need:

```javascript
it.describe.each([
  { name: 'S3', fixture: 'uploadsRepository' },
  { name: 'in-memory', fixture: 'inMemoryUploadsRepository' }
])('$name implementation', ({ fixture }) => {
  it('tests file operations', async (context) => {
    const repository = context[fixture]
    // test implementation
  })
})
```

### Adapter-Specific Tests

Tests outside the contract continue using extended `it` normally:

```javascript
it.describe('MongoDB-specific error handling', () => {
  it('handles timeout errors', async ({ organisationsRepository }) => {
    // MongoDB-specific test logic
  })
})
```

## Trade-offs

### Benefits

- Cleaner test code with less boilerplate
- Explicit dependency declaration in fixtures
- Vitest manages lifecycle automatically
- Fixtures composable and reusable
- Type-safe fixture access (with TypeScript)

### Drawbacks

- Feels "magical" - fixtures hide setup complexity
- Contract tests must use passed `it` object instead of globals
- Fixture destructuring in callbacks feels less explicit than manual setup
- Learning curve for developers unfamiliar with Vitest fixtures

### Mitigation

- Magic is isolated to adapter test files
- Contract tests remain explicit and readable
- Documentation and examples help onboarding
- Pattern is standard Vitest, not custom abstraction

## Non-Goals

- Removing adapter testing pattern (keep it, it's valuable)
- Backward compatibility (accept breaking change to contract signatures)
- Zero boilerplate (explicit dependencies preferred over magic)
- TypeScript conversion (works with existing JavaScript)

## References

- [Vitest Test Context](https://vitest.dev/guide/test-context.html)
- [Vitest Fixtures](https://vitest.dev/guide/test-context.html#test-extend)
- Existing fixtures: `.vite/fixtures/mongo.js`, `.vite/fixtures/s3.js`
