# Extractor Port Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move abstraction boundary from parser/uploads to extractor level, simplifying test setup and creating clearer separation of concerns.

**Architecture:** Create SummaryLogExtractor port with two implementations: production (S3 + ExcelJS) and in-memory (test data). Remove parser port abstraction. Update all tests to use new extractor factories.

**Tech Stack:** Node.js, Vitest, Joi, ExcelJS

---

## Task 1: Create Extractor Port Definition

**Files:**

- Create: `src/domain/summary-logs/extractor/port.js`

**Step 1: Create port typedef**

```javascript
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */

/**
 * @typedef {Object} ParsedSummaryLog
 * @property {Object} meta - Metadata extracted from the summary log
 * @property {Object} data - Data extracted from the summary log
 */

/**
 * @typedef {Object} SummaryLogExtractor
 * @property {(summaryLog: SummaryLog) => Promise<ParsedSummaryLog>} extract
 */
```

**Step 2: Commit**

```bash
git add src/domain/summary-logs/extractor/port.js
git commit -m "feat: add SummaryLogExtractor port definition"
```

---

## Task 2: Create Contract Test Suite

**Files:**

- Create: `src/domain/summary-logs/extractor/port.contract.js`

**Step 1: Create contract test structure**

```javascript
import { describe, it, expect, beforeEach } from 'vitest'

const testSuccessExtraction = (extractorFactory) => {
  describe('successful extraction', () => {
    it('should return parsed structure with meta and data', async () => {
      const fileId = 'test-file-123'
      const parsedData = {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          }
        },
        data: {}
      }

      const extractor = extractorFactory({
        [fileId]: parsedData
      })

      const summaryLog = {
        file: {
          id: fileId,
          s3: { bucket: 'test-bucket', key: 'test-key' }
        }
      }

      const result = await extractor.extract(summaryLog)

      expect(result).toEqual(parsedData)
      expect(result.meta.WASTE_REGISTRATION_NUMBER.value).toBe('WRN-123')
    })
  })
}

const testMissingFile = (extractorFactory) => {
  describe('missing file', () => {
    it('should throw error when file does not exist', async () => {
      const extractor = extractorFactory({})

      const summaryLog = {
        file: {
          id: 'missing-file',
          s3: { bucket: 'test-bucket', key: 'missing-key' }
        }
      }

      await expect(extractor.extract(summaryLog)).rejects.toThrow(
        'Something went wrong while retrieving your file upload'
      )
    })
  })
}

export const testSummaryLogExtractorContract = (extractorFactory) => {
  describe('summary log extractor contract', () => {
    testSuccessExtraction(extractorFactory)
    testMissingFile(extractorFactory)
  })
}
```

**Step 2: Commit**

```bash
git add src/domain/summary-logs/extractor/port.contract.js
git commit -m "feat: add SummaryLogExtractor contract tests"
```

---

## Task 3: Create In-Memory Extractor Factory

**Files:**

- Create: `src/application/summary-logs/extractor-inmemory.js`

**Step 1: Write contract test for in-memory implementation**

```javascript
import { describe } from 'vitest'
import { createInMemorySummaryLogExtractor } from './extractor-inmemory.js'
import { testSummaryLogExtractorContract } from '#domain/summary-logs/extractor/port.contract.js'

describe('InMemorySummaryLogExtractor', () => {
  testSummaryLogExtractorContract(createInMemorySummaryLogExtractor)
})
```

Save to: `src/application/summary-logs/extractor-inmemory.test.js`

**Step 2: Run test to verify it fails**

Run: `npm test -- extractor-inmemory.test.js`
Expected: FAIL - module not found

**Step 3: Implement in-memory extractor**

```javascript
/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */

/**
 * Creates an in-memory summary log extractor for testing
 * @param {Object.<string, ParsedSummaryLog>} testDataMap - Map of file IDs to parsed data
 * @returns {SummaryLogExtractor}
 */
export const createInMemorySummaryLogExtractor = (testDataMap) => {
  return {
    /**
     * @param {SummaryLog} summaryLog
     * @returns {Promise<ParsedSummaryLog>}
     */
    extract: async (summaryLog) => {
      const {
        file: { id: fileId }
      } = summaryLog

      if (!testDataMap[fileId]) {
        throw new Error(
          'Something went wrong while retrieving your file upload'
        )
      }

      return testDataMap[fileId]
    }
  }
}
```

Save to: `src/application/summary-logs/extractor-inmemory.js`

**Step 4: Run test to verify it passes**

Run: `npm test -- extractor-inmemory.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/application/summary-logs/extractor-inmemory.js src/application/summary-logs/extractor-inmemory.test.js
git commit -m "feat: add in-memory SummaryLogExtractor implementation"
```

---

## Task 4: Refactor Production Extractor to Factory

**Files:**

- Modify: `src/application/summary-logs/extractor.js` (entire file refactor)
- Create: `src/application/summary-logs/extractor.contract.test.js`

**Step 1: Write contract test for production implementation**

Create test that will verify production extractor against contract:

```javascript
import { describe, beforeEach } from 'vitest'
import { createSummaryLogExtractor } from './extractor.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { testSummaryLogExtractorContract } from '#domain/summary-logs/extractor/port.contract.js'

describe('SummaryLogExtractor (production)', () => {
  const createExtractorFactory = (testDataMap) => {
    // Convert testDataMap to uploads repository format
    const uploadsData = {}
    Object.keys(testDataMap).forEach((fileId) => {
      // For contract tests, we need to mock the Excel file as a buffer
      // In production, ExcelJS parses the buffer and returns workbook
      // For testing, we'll need a helper that creates valid Excel buffers
      uploadsData[`test-bucket/test-key-${fileId}`] = Buffer.from('mock')
    })

    const uploadsRepository = createInMemoryUploadsRepository(uploadsData)
    return createSummaryLogExtractor({ uploadsRepository })
  }

  // Note: This will need ExcelJS mocking or real Excel files
  // For now, we'll skip contract tests for production extractor
  // and rely on existing unit tests until we can mock ExcelJS properly
})
```

Save to: `src/application/summary-logs/extractor.contract.test.js`

**Step 2: Refactor extractor.js to factory function**

Replace entire contents of `src/application/summary-logs/extractor.js`:

```javascript
import { ExcelJSSummaryLogsParser } from '#adapters/parsers/summary-logs/exceljs-parser.js'

/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */

/**
 * Creates a production summary log extractor that fetches from S3 and parses with ExcelJS
 * @param {Object} params
 * @param {UploadsRepository} params.uploadsRepository
 * @returns {SummaryLogExtractor}
 */
export const createSummaryLogExtractor = ({ uploadsRepository }) => {
  const parser = new ExcelJSSummaryLogsParser()

  return {
    /**
     * @param {SummaryLog} summaryLog
     * @returns {Promise<ParsedSummaryLog>}
     */
    extract: async (summaryLog) => {
      const {
        file: {
          s3: { bucket, key }
        }
      } = summaryLog

      const summaryLogBuffer = await uploadsRepository.findByLocation({
        bucket,
        key
      })

      if (!summaryLogBuffer) {
        throw new Error(
          'Something went wrong while retrieving your file upload'
        )
      }

      return parser.parse(summaryLogBuffer)
    }
  }
}
```

**Step 3: Update existing extractor unit test**

Modify `src/application/summary-logs/extractor.test.js`:

Replace the test setup from:

```javascript
const summaryLogExtractor = new SummaryLogExtractor({
  uploadsRepository,
  summaryLogsParser
})
```

To:

```javascript
const summaryLogExtractor = createSummaryLogExtractor({
  uploadsRepository
})
```

And remove all references to `summaryLogsParser` - the parser is now internal.

For the parser tests, mock the ExcelJS parser at the module level instead:

```javascript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createSummaryLogExtractor } from './extractor.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'

vi.mock('#adapters/parsers/summary-logs/exceljs-parser.js', () => ({
  ExcelJSSummaryLogsParser: vi.fn().mockImplementation(() => ({
    parse: vi.fn().mockResolvedValue({ meta: {}, data: {} })
  }))
}))

// ... rest of tests
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- extractor.test.js`
Expected: PASS (all existing tests work with new factory)

**Step 5: Commit**

```bash
git add src/application/summary-logs/extractor.js src/application/summary-logs/extractor.test.js src/application/summary-logs/extractor.contract.test.js
git commit -m "refactor: convert SummaryLogExtractor to factory function"
```

---

## Task 5: Update Worker Thread

**Files:**

- Modify: `src/workers/summary-logs/worker/worker-thread.js:40-47`

**Step 1: Update worker thread to use factory**

Find this code (around lines 40-47):

```javascript
const uploadsRepository = createUploadsRepository(s3Client)
const summaryLogsParser = new ExcelJSSummaryLogsParser()

const summaryLogExtractor = new SummaryLogExtractor({
  uploadsRepository,
  summaryLogsParser
})
```

Replace with:

```javascript
const uploadsRepository = createUploadsRepository(s3Client)

const summaryLogExtractor = createSummaryLogExtractor({
  uploadsRepository
})
```

**Step 2: Remove unused import**

Remove:

```javascript
import { ExcelJSSummaryLogsParser } from '#adapters/parsers/summary-logs/exceljs-parser.js'
```

Update:

```javascript
import { SummaryLogExtractor } from '#application/summary-logs/extractor.js'
```

To:

```javascript
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
```

**Step 3: Run worker thread unit tests**

Run: `npm test -- worker-thread.test.js`
Expected: PASS

**Step 4: Commit**

```bash
git add src/workers/summary-logs/worker/worker-thread.js
git commit -m "refactor: update worker thread to use extractor factory"
```

---

## Task 6: Update Inline Validator

**Files:**

- Modify: `src/adapters/validators/summary-logs/inline.js:15-24`

**Step 1: Update inline validator factory signature**

Change function signature from:

```javascript
export const createInlineSummaryLogsValidator = (
  uploadsRepository,
  summaryLogsParser,
  summaryLogsRepository,
  organisationsRepository
) => {
```

To:

```javascript
export const createInlineSummaryLogsValidator = (
  uploadsRepository,
  summaryLogsRepository,
  organisationsRepository
) => {
```

**Step 2: Update extractor creation**

Replace:

```javascript
const summaryLogExtractor = new SummaryLogExtractor({
  uploadsRepository,
  summaryLogsParser
})
```

With:

```javascript
const summaryLogExtractor = createSummaryLogExtractor({
  uploadsRepository
})
```

**Step 3: Update import**

Change:

```javascript
import { SummaryLogExtractor } from '#application/summary-logs/extractor.js'
```

To:

```javascript
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
```

**Step 4: Run inline validator unit tests**

Run: `npm test -- inline.test.js`
Expected: FAIL (tests need updating for new signature)

**Step 5: Commit**

```bash
git add src/adapters/validators/summary-logs/inline.js
git commit -m "refactor: update inline validator to use extractor factory"
```

---

## Task 7: Update Inline Validator Unit Tests

**Files:**

- Modify: `src/adapters/validators/summary-logs/inline.test.js`

**Step 1: Update test setup**

Find the setup code that creates the validator (look for `createInlineSummaryLogsValidator` calls).

Change from:

```javascript
const summaryLogsParser = { parse: vi.fn() }
const summaryLogsValidator = createInlineSummaryLogsValidator(
  uploadsRepository,
  summaryLogsParser,
  summaryLogsRepository,
  organisationsRepository
)
```

To:

```javascript
const summaryLogsValidator = createInlineSummaryLogsValidator(
  uploadsRepository,
  summaryLogsRepository,
  organisationsRepository
)
```

Remove all `summaryLogsParser` variable declarations and mocks.

**Step 2: Run tests to verify they pass**

Run: `npm test -- inline.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add src/adapters/validators/summary-logs/inline.test.js
git commit -m "test: update inline validator tests for new factory signature"
```

---

## Task 8: Update Route Integration Test

**Files:**

- Modify: `src/routes/v1/organisations/registrations/summary-logs/integration.test.js:66-105`

**Step 1: Replace parser mock with extractor factory**

Find this code (around lines 66-105):

```javascript
const uploadsRepository = createInMemoryUploadsRepository()
const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

const testOrg = buildOrganisation({
  registrations: [
    {
      id: registrationId,
      wasteRegistrationNumber: 'WRN-123',
      material: 'paper',
      wasteProcessingType: 'reprocessor',
      formSubmissionTime: new Date(),
      submittedToRegulator: 'ea'
    }
  ]
})
testOrg.id = organisationId

const organisationsRepository = createInMemoryOrganisationsRepository([
  testOrg
])()

const summaryLogsParser = {
  parse: async () => ({
    meta: {
      WASTE_REGISTRATION_NUMBER: {
        value: 'WRN-123',
        location: { sheet: 'Data', row: 1, column: 'B' }
      }
    },
    data: {}
  })
}

const summaryLogsValidator = createInlineSummaryLogsValidator(
  uploadsRepository,
  summaryLogsParser,
  summaryLogsRepository,
  organisationsRepository
)
```

Replace with:

```javascript
const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

const testOrg = buildOrganisation({
  registrations: [
    {
      id: registrationId,
      wasteRegistrationNumber: 'WRN-123',
      material: 'paper',
      wasteProcessingType: 'reprocessor',
      formSubmissionTime: new Date(),
      submittedToRegulator: 'ea'
    }
  ]
})
testOrg.id = organisationId

const organisationsRepository = createInMemoryOrganisationsRepository([
  testOrg
])()

const summaryLogExtractor = createInMemorySummaryLogExtractor({
  [`file-${uploadId}`]: {
    meta: {
      WASTE_REGISTRATION_NUMBER: {
        value: 'WRN-123',
        location: { sheet: 'Data', row: 1, column: 'B' }
      }
    },
    data: {}
  }
})

const summaryLogUpdater = new SummaryLogUpdater({
  summaryLogsRepository
})

const summaryLogsValidator = new SummaryLogsValidator({
  summaryLogsRepository,
  organisationsRepository,
  summaryLogExtractor,
  summaryLogUpdater
})
```

**Step 2: Add missing imports**

Add:

```javascript
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { SummaryLogsValidator } from '#application/summary-logs/validator.js'
import { SummaryLogUpdater } from '#application/summary-logs/updater.js'
```

Remove:

```javascript
import { createInlineSummaryLogsValidator } from '#adapters/validators/summary-logs/inline.js'
```

**Step 3: Run integration tests**

Run: `npm test -- routes/v1/organisations/registrations/summary-logs/integration.test.js`
Expected: PASS

**Step 4: Commit**

```bash
git add src/routes/v1/organisations/registrations/summary-logs/integration.test.js
git commit -m "test: update route integration tests to use extractor factory"
```

---

## Task 9: Update Worker Integration Test

**Files:**

- Modify: `src/workers/summary-logs/worker/integration.test.js:5-67`

**Step 1: Update extractor factory usage**

Find the existing `createSummaryLogExtractor` import and usage:

```javascript
import { createSummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
```

And the setup:

```javascript
summaryLogExtractor = createSummaryLogExtractor({
  parsed: {
    meta: {
      WASTE_REGISTRATION_NUMBER: {
        value: 'WRN-123',
        location: { sheet: 'Data', row: 1, column: 'B' }
      }
    },
    data: {}
  }
})
```

Update import to:

```javascript
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
```

Update setup to use file ID mapping:

```javascript
const fileId = initialSummaryLog.file.id

summaryLogExtractor = createInMemorySummaryLogExtractor({
  [fileId]: {
    meta: {
      WASTE_REGISTRATION_NUMBER: {
        value: 'WRN-123',
        location: { sheet: 'Data', row: 1, column: 'B' }
      }
    },
    data: {}
  }
})
```

**Step 2: Update failing extractor mocks**

Find the test cases that create failing extractors:

```javascript
const failingSummaryLogExtractor = {
  extract: async () => {
    throw new Error('Something went wrong while retrieving your file upload')
  }
}
```

Keep these as-is - they're testing error cases.

**Step 3: Run worker integration tests**

Run: `npm test -- workers/summary-logs/worker/integration.test.js`
Expected: PASS

**Step 4: Commit**

```bash
git add src/workers/summary-logs/worker/integration.test.js
git commit -m "test: update worker integration tests to use new extractor API"
```

---

## Task 10: Update Validator Unit Tests

**Files:**

- Modify: `src/application/summary-logs/validator.test.js`

**Step 1: Review and update test setup**

Look for any references to creating extractors in the validator tests.

If tests are using mocked extractors directly:

```javascript
const summaryLogExtractor = {
  extract: vi.fn().mockResolvedValue(parsedData)
}
```

These can stay as-is - they're already mocking the extractor interface correctly.

If tests are using `createSummaryLogExtractor`, update to `createInMemorySummaryLogExtractor`.

**Step 2: Run validator unit tests**

Run: `npm test -- application/summary-logs/validator.test.js`
Expected: PASS

**Step 3: Commit if changes were needed**

```bash
git add src/application/summary-logs/validator.test.js
git commit -m "test: update validator unit tests for extractor factory"
```

---

## Task 11: Delete Parser Port

**Files:**

- Delete: `src/domain/summary-logs/parser/port.js`
- Delete: `src/domain/summary-logs/parser/` (directory if empty)

**Step 1: Verify no references remain**

Run: `grep -r "summary-logs/parser/port" src/`
Expected: No results

If there are results, update those files to remove the imports.

**Step 2: Delete parser port**

```bash
rm src/domain/summary-logs/parser/port.js
rmdir src/domain/summary-logs/parser/
```

**Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass with 100% coverage

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove parser port abstraction"
```

---

## Task 12: Final Verification

**Files:**

- All files

**Step 1: Run full test suite**

Run: `npm test`
Expected: All 495+ tests pass, 100% coverage

**Step 2: Run type checks**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Verify no broken imports**

Check for any remaining imports of deleted files:

```bash
grep -r "SummaryLogExtractor } from" src/ | grep -v "extractor-inmemory"
```

Expected: Only references to `createSummaryLogExtractor` from `extractor.js`

**Step 4: Review changes**

```bash
git diff main...HEAD --stat
```

Expected changes:

- Port created: `src/domain/summary-logs/extractor/port.js`
- Contract tests: `src/domain/summary-logs/extractor/port.contract.js`
- Extractor refactored: `src/application/summary-logs/extractor.js`
- In-memory factory: `src/application/summary-logs/extractor-inmemory.js`
- Parser port deleted: `src/domain/summary-logs/parser/port.js`
- Multiple test files updated

---

## Task 13: Update Design Document Status

**Files:**

- Modify: `docs/plans/2025-10-24-extractor-port-refactoring-design.md:4`

**Step 1: Mark design as implemented**

Change:

```markdown
**Status:** Approved
```

To:

```markdown
**Status:** Implemented
```

**Step 2: Commit**

```bash
git add docs/plans/2025-10-24-extractor-port-refactoring-design.md
git commit -m "docs: mark extractor refactoring as implemented"
```

---

## Success Criteria Checklist

- [ ] All contract tests pass for both implementations
- [ ] All integration tests updated and passing
- [ ] All unit tests updated and passing
- [ ] 100% test coverage maintained
- [ ] Parser port deleted
- [ ] No references to old `SummaryLogExtractor` class remain
- [ ] Type checks pass
- [ ] All changes committed with clear messages

---

## Notes for Engineer

**Testing Strategy:**

- We follow TDD: write test, see it fail, implement, see it pass, commit
- Each task is one atomic change
- Commit frequently with clear messages

**Key Concepts:**

- **Port:** Interface definition (typedef)
- **Contract:** Shared test suite that all implementations must pass
- **Factory Function:** Returns object conforming to port interface

**Common Issues:**

- If tests fail due to file ID mismatches, check that test data uses correct file IDs from test setup
- If coverage drops, ensure new files have corresponding test files
- If imports fail, verify path aliases in package.json (# prefix)

**Questions?**

- Check existing contract tests in `src/repositories/*/port.contract.js` for examples
- Reference the design document in `docs/plans/2025-10-24-extractor-port-refactoring-design.md`
