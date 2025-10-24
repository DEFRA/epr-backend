# Summary Log Extractor Port Refactoring

**Date:** 2025-10-24
**Status:** Approved
**Context:** PAE-415 - Validate summary log registration number

## Problem Statement

The current architecture has abstraction boundaries at the wrong level. We abstract the parser (`SummaryLogsParser` port) and uploads repository separately, but tests need to mock both to inject test data. This creates unnecessary coupling and verbose test setup.

The real boundary should be at the **extractor level** - the component responsible for "get me parsed data from a summary log". Everything inside (S3 fetching, Excel parsing) is an implementation detail.

## Goals

1. Move abstraction boundary from parser/uploads to extractor
2. Simplify integration test setup (one mock instead of two)
3. Remove unnecessary parser port abstraction
4. Keep uploads repository port (legitimate infrastructure concern)
5. Add contract tests for extractor implementations

## Design

### Port Definition

**New file:** `src/domain/summary-logs/extractor/port.js`

```javascript
/**
 * @typedef {Object} SummaryLogExtractor
 * @property {(summaryLog: SummaryLog) => Promise<ParsedSummaryLog>} extract
 */
```

The extractor port defines a single operation: given a `SummaryLog` domain object, return the parsed structure containing metadata and data.

### Contract Tests

**New file:** `src/domain/summary-logs/extractor/port.contract.js`

The contract test suite verifies that all extractor implementations:

1. **Success case**: Return parsed structure with `meta.WASTE_REGISTRATION_NUMBER` for valid files
2. **Missing file**: Throw error when file doesn't exist
3. **Corrupt file**: Throw error with helpful message when file can't be parsed
4. **Infrastructure failure**: Throw error when underlying systems (S3, etc) fail

Contract tests receive an `extractorFactory(testData)` function that returns a configured extractor implementation.

### Production Implementation

**Replaced file:** `src/application/summary-logs/extractor.js`

Changes from class-based implementation to factory function:

```javascript
import { ExcelJSSummaryLogsParser } from '#adapters/parsers/summary-logs/exceljs-parser.js'

export const createSummaryLogExtractor = ({ uploadsRepository }) => {
  const parser = new ExcelJSSummaryLogsParser()

  return {
    extract: async (summaryLog) => {
      const {
        file: {
          s3: { bucket, key }
        }
      } = summaryLog

      const buffer = await uploadsRepository.findByLocation({ bucket, key })
      if (!buffer) {
        throw new Error(
          'Something went wrong while retrieving your file upload'
        )
      }

      return parser.parse(buffer)
    }
  }
}
```

**Key changes:**

- Factory function instead of class
- Parser instantiated internally (implementation detail)
- Only exposes uploads repository dependency

### Test Implementation

**New file:** `src/application/summary-logs/extractor-inmemory.js`

```javascript
export const createInMemorySummaryLogExtractor = (testDataMap) => {
  return {
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

**API:** Accepts a map of `fileId -> parsedData`, allowing tests to configure different responses for different files.

**Usage example:**

```javascript
const extractor = createInMemorySummaryLogExtractor({
  'file-123': {
    meta: { WASTE_REGISTRATION_NUMBER: { value: 'WRN-123', location: {...} } },
    data: {}
  },
  'file-456': {
    meta: { WASTE_REGISTRATION_NUMBER: { value: 'WRN-456', location: {...} } },
    data: {}
  }
})
```

## Production Code Updates

### Worker Thread

**File:** `src/workers/summary-logs/worker/worker-thread.js`

**Before:**

```javascript
const uploadsRepository = createUploadsRepository(s3Client)
const summaryLogsParser = new ExcelJSSummaryLogsParser()
const summaryLogExtractor = new SummaryLogExtractor({
  uploadsRepository,
  summaryLogsParser
})
```

**After:**

```javascript
const uploadsRepository = createUploadsRepository(s3Client)
const summaryLogExtractor = createSummaryLogExtractor({
  uploadsRepository
})
```

### Inline Validator

**File:** `src/adapters/validators/summary-logs/inline.js`

**Before:**

```javascript
export const createInlineSummaryLogsValidator = (
  uploadsRepository,
  summaryLogsParser,
  summaryLogsRepository,
  organisationsRepository
) => {
  const summaryLogExtractor = new SummaryLogExtractor({
    uploadsRepository,
    summaryLogsParser
  })
  // ...
}
```

**After:**

```javascript
export const createInlineSummaryLogsValidator = (
  uploadsRepository,
  summaryLogsRepository,
  organisationsRepository
) => {
  const summaryLogExtractor = createSummaryLogExtractor({
    uploadsRepository
  })
  // ...
}
```

## Test Updates

### Route Integration Test

**File:** `src/routes/v1/organisations/registrations/summary-logs/integration.test.js`

**Before:** Mocked parser separately

```javascript
const summaryLogsParser = {
  parse: async () => ({
    meta: { WASTE_REGISTRATION_NUMBER: { value: 'WRN-123', ... } },
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

**After:** Use in-memory extractor

```javascript
const summaryLogExtractor = createInMemorySummaryLogExtractor({
  'file-123': {
    meta: { WASTE_REGISTRATION_NUMBER: { value: 'WRN-123', ... } },
    data: {}
  }
})
const summaryLogsValidator = new SummaryLogsValidator({
  summaryLogsRepository,
  organisationsRepository,
  summaryLogExtractor,
  summaryLogUpdater
})
```

### Worker Integration Test

**File:** `src/workers/summary-logs/worker/integration.test.js`

Already uses an in-memory extractor factory. Update to align with new API that accepts a map of `fileId -> parsedData` instead of a single `parsed` object.

### Unit Tests

**Files:**

- `src/adapters/validators/summary-logs/inline.test.js`
- `src/application/summary-logs/validator.test.js`

Update to use `createInMemorySummaryLogExtractor` instead of mocking parser/uploads separately.

## File Changes

### Files to DELETE

- `src/domain/summary-logs/parser/port.js` - Parser port no longer needed
- Old `src/application/summary-logs/extractor.js` class - Replaced by factory

### Files to KEEP

- `src/adapters/parsers/summary-logs/exceljs-parser.js` - Becomes internal implementation detail
- `src/domain/uploads/repository/port.js` - Still needed by extractor

### Files to CREATE

- `src/domain/summary-logs/extractor/port.js` - Extractor port typedef
- `src/domain/summary-logs/extractor/port.contract.js` - Contract test suite
- `src/application/summary-logs/extractor.js` - Production factory (replaces old class)
- `src/application/summary-logs/extractor-inmemory.js` - Test factory

## Benefits

1. **Simpler tests**: One mock instead of two (parser + uploads)
2. **Better abstraction**: Boundary at the right level (what vs how)
3. **Clearer intent**: "Give me parsed data" is clearer than "parse this buffer"
4. **Less coupling**: Tests don't know about S3 or ExcelJS
5. **Contract enforcement**: Both implementations must handle same error cases

## Trade-offs

- **More indirection**: Another layer between validator and parser
- **Mitigation**: The indirection is intentional - it's the correct abstraction boundary

## Migration Strategy

1. Create port definition and contract tests
2. Create production factory (replacing old class)
3. Create in-memory factory
4. Update production code (worker thread, inline validator)
5. Update all test files
6. Delete old parser port and class-based extractor
7. Run full test suite to verify
8. Update any remaining references

## Success Criteria

- [ ] All contract tests pass for both implementations
- [ ] All integration tests updated and passing
- [ ] All unit tests updated and passing
- [ ] 100% test coverage maintained
- [ ] Parser port deleted
- [ ] No references to old `SummaryLogExtractor` class remain
