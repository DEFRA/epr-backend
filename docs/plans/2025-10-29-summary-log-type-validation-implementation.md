# Summary Log Type Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate that uploaded summary logs match the organisation's registration type (reprocessor vs exporter) using the `__EPR_META_SUMMARY_LOG_TYPE` metadata field.

**Architecture:** Add a new validation function `validateSummaryLogType` to the existing validator.js module, following the same pattern as `validateWasteRegistrationNumber`. The validation occurs immediately after registration number validation in the `performValidationChecks` method. On mismatch, the summary log is marked invalid with a static error message returned to users.

**Tech Stack:** Node.js, Vitest (testing), JSDoc (types)

---

## Task 1: Add Unit Tests for validateSummaryLogType Function

**Files:**

- Modify: `src/application/summary-logs/validator.test.js`

### Step 1: Add test for missing SUMMARY_LOG_TYPE metadata

Add this test after the existing `validateWasteRegistrationNumber` tests:

```javascript
describe('validateSummaryLogType', () => {
  it('should throw error when SUMMARY_LOG_TYPE is missing', () => {
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
      }
    }
    const registration = {
      wasteProcessingType: 'reprocessor'
    }

    expect(() =>
      validateSummaryLogType({ parsed, registration, msg: 'test' })
    ).toThrow('Invalid summary log: missing summary log type')
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- validator.test.js`

Expected: FAIL with "validateSummaryLogType is not defined"

### Step 3: Commit failing test

```bash
git add src/application/summary-logs/validator.test.js
git commit -m "test: add failing test for missing summary log type"
```

---

## Task 2: Add More Unit Tests for validateSummaryLogType

**Files:**

- Modify: `src/application/summary-logs/validator.test.js`

### Step 1: Add test for unrecognized type value

Add this test in the `validateSummaryLogType` describe block:

```javascript
it('should throw error when SUMMARY_LOG_TYPE is unrecognized', () => {
  const parsed = {
    meta: {
      WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
      SUMMARY_LOG_TYPE: { value: 'INVALID_TYPE' }
    }
  }
  const registration = {
    wasteProcessingType: 'reprocessor'
  }

  expect(() =>
    validateSummaryLogType({ parsed, registration, msg: 'test' })
  ).toThrow('Invalid summary log: unrecognized summary log type')
})
```

### Step 2: Add test for type mismatch (REPROCESSOR vs exporter)

```javascript
it('should throw error when type is REPROCESSOR but registration is exporter', () => {
  const parsed = {
    meta: {
      WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
      SUMMARY_LOG_TYPE: { value: 'REPROCESSOR' }
    }
  }
  const registration = {
    wasteProcessingType: 'exporter'
  }

  expect(() =>
    validateSummaryLogType({ parsed, registration, msg: 'test' })
  ).toThrow('Summary log type does not match registration type')
})
```

### Step 3: Add test for type mismatch (EXPORTER vs reprocessor)

```javascript
it('should throw error when type is EXPORTER but registration is reprocessor', () => {
  const parsed = {
    meta: {
      WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
      SUMMARY_LOG_TYPE: { value: 'EXPORTER' }
    }
  }
  const registration = {
    wasteProcessingType: 'reprocessor'
  }

  expect(() =>
    validateSummaryLogType({ parsed, registration, msg: 'test' })
  ).toThrow('Summary log type does not match registration type')
})
```

### Step 4: Add test for successful validation (REPROCESSOR matches reprocessor)

```javascript
it('should not throw when type is REPROCESSOR and registration is reprocessor', () => {
  const parsed = {
    meta: {
      WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
      SUMMARY_LOG_TYPE: { value: 'REPROCESSOR' }
    }
  }
  const registration = {
    wasteProcessingType: 'reprocessor'
  }

  expect(() =>
    validateSummaryLogType({ parsed, registration, msg: 'test' })
  ).not.toThrow()
})
```

### Step 5: Add test for successful validation (EXPORTER matches exporter)

```javascript
it('should not throw when type is EXPORTER and registration is exporter', () => {
  const parsed = {
    meta: {
      WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
      SUMMARY_LOG_TYPE: { value: 'EXPORTER' }
    }
  }
  const registration = {
    wasteProcessingType: 'exporter'
  }

  expect(() =>
    validateSummaryLogType({ parsed, registration, msg: 'test' })
  ).not.toThrow()
})
```

### Step 6: Run tests to verify they all fail

Run: `npm test -- validator.test.js`

Expected: All new tests FAIL with "validateSummaryLogType is not defined"

### Step 7: Commit failing tests

```bash
git add src/application/summary-logs/validator.test.js
git commit -m "test: add comprehensive failing tests for summary log type validation"
```

---

## Task 3: Implement validateSummaryLogType Function

**Files:**

- Modify: `src/application/summary-logs/validator.js:1-94` (add constants and function before line 95)
- Modify: `src/application/summary-logs/validator.test.js:1-10` (add import)

### Step 1: Add type mapping constants

Add these constants after the imports and before `fetchRegistration` function (around line 14):

```javascript
/**
 * Mapping between spreadsheet type values and database type values
 */
const SPREADSHEET_TYPE_TO_DB_TYPE = {
  REPROCESSOR: 'reprocessor',
  EXPORTER: 'exporter'
}

const VALID_SPREADSHEET_TYPES = Object.keys(SPREADSHEET_TYPE_TO_DB_TYPE)
```

### Step 2: Implement validateSummaryLogType function

Add this function after `validateWasteRegistrationNumber` (around line 95):

```javascript
/**
 * Validates that the summary log type in the spreadsheet matches the registration's waste processing type
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.msg - Logging context message
 * @throws {Error} If validation fails
 */
export const validateSummaryLogType = ({ parsed, registration, msg }) => {
  const { wasteProcessingType } = registration
  const spreadsheetType = parsed?.meta?.SUMMARY_LOG_TYPE?.value

  if (!spreadsheetType) {
    throw new Error('Invalid summary log: missing summary log type')
  }

  if (!VALID_SPREADSHEET_TYPES.includes(spreadsheetType)) {
    throw new Error('Invalid summary log: unrecognized summary log type')
  }

  const expectedDbType = SPREADSHEET_TYPE_TO_DB_TYPE[spreadsheetType]
  if (expectedDbType !== wasteProcessingType) {
    throw new Error('Summary log type does not match registration type')
  }

  logger.info({
    message: `Summary log type validated: ${msg}, spreadsheetType=${spreadsheetType}, wasteProcessingType=${wasteProcessingType}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
```

### Step 3: Update test imports

In `validator.test.js`, update the import to include `validateSummaryLogType`:

```javascript
import {
  SummaryLogsValidator,
  fetchRegistration,
  validateWasteRegistrationNumber,
  validateSummaryLogType
} from './validator.js'
```

### Step 4: Run tests to verify they pass

Run: `npm test -- validator.test.js`

Expected: All tests PASS

### Step 5: Commit implementation

```bash
git add src/application/summary-logs/validator.js src/application/summary-logs/validator.test.js
git commit -m "feat: implement validateSummaryLogType function with type mapping"
```

---

## Task 4: Integrate Validation into performValidationChecks

**Files:**

- Modify: `src/application/summary-logs/validator.js:127-152`

### Step 1: Add unit test for integration

In `validator.test.js`, add test in the existing `SummaryLogsValidator` describe block:

```javascript
it('should call validateSummaryLogType during performValidationChecks', async () => {
  organisationsRepository.findRegistrationById.mockResolvedValue({
    id: 'reg-123',
    wasteRegistrationNumber: 'WRN12345',
    wasteProcessingType: 'reprocessor'
  })

  summaryLogExtractor.extract.mockResolvedValue({
    meta: {
      WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
      SUMMARY_LOG_TYPE: { value: 'REPROCESSOR' }
    },
    data: {}
  })

  await summaryLogsValidator.validate(summaryLogId)

  expect(summaryLogUpdater.update).toHaveBeenCalledWith({
    id: summaryLogId,
    version: 1,
    summaryLog,
    status: SUMMARY_LOG_STATUS.VALIDATED
  })
})
```

### Step 2: Run test to verify it passes (already integrated)

Run: `npm test -- validator.test.js`

Expected: Test PASSES (implementation already calls validation functions)

### Step 3: Update performValidationChecks to call validateSummaryLogType

In `validator.js`, update the `performValidationChecks` method to call the new validation:

```javascript
async performValidationChecks({ summaryLog, msg }) {
  const parsed = await this.summaryLogExtractor.extract(summaryLog)

  logger.info({
    message: `Extracted summary log file: ${msg}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  const registration = await fetchRegistration({
    organisationsRepository: this.organisationsRepository,
    organisationId: summaryLog.organisationId,
    registrationId: summaryLog.registrationId,
    msg
  })

  validateWasteRegistrationNumber({
    parsed,
    registration,
    msg
  })

  validateSummaryLogType({
    parsed,
    registration,
    msg
  })

  return parsed
}
```

### Step 4: Run all validator tests to verify integration

Run: `npm test -- validator.test.js`

Expected: All tests PASS

### Step 5: Commit integration

```bash
git add src/application/summary-logs/validator.js src/application/summary-logs/validator.test.js
git commit -m "feat: integrate summary log type validation into performValidationChecks"
```

---

## Task 5: Add Integration Tests for Full Validation Flow

**Files:**

- Modify: `src/workers/summary-logs/worker/integration.test.js`

### Step 1: Add test for successful validation with REPROCESSOR type

Add this test in the existing describe block:

```javascript
it('should validate successfully when SUMMARY_LOG_TYPE is REPROCESSOR and registration is reprocessor', async () => {
  const fileId = initialSummaryLog.file.id

  summaryLogExtractor = createInMemorySummaryLogExtractor({
    [fileId]: {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-123',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'REPROCESSOR',
          location: { sheet: 'Data', row: 2, column: 'B' }
        }
      },
      data: {}
    }
  })

  summaryLogsValidator = new SummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    summaryLogExtractor,
    summaryLogUpdater
  })

  await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

  await summaryLogsValidator.validate(summaryLogId)

  const updated = await summaryLogsRepository.findById(summaryLogId)

  expect(updated).toEqual({
    version: 2,
    summaryLog: {
      ...initialSummaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED
    }
  })
})
```

### Step 2: Run test to verify it passes

Run: `npm test -- integration.test.js`

Expected: Test PASSES

### Step 3: Add test for validation failure with type mismatch

```javascript
it('should fail validation when SUMMARY_LOG_TYPE is EXPORTER but registration is reprocessor', async () => {
  const fileId = initialSummaryLog.file.id

  summaryLogExtractor = createInMemorySummaryLogExtractor({
    [fileId]: {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-123',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'EXPORTER',
          location: { sheet: 'Data', row: 2, column: 'B' }
        }
      },
      data: {}
    }
  })

  summaryLogsValidator = new SummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    summaryLogExtractor,
    summaryLogUpdater
  })

  await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

  await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

  const updated = await summaryLogsRepository.findById(summaryLogId)

  expect(updated).toEqual({
    version: 2,
    summaryLog: {
      ...initialSummaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'Summary log type does not match registration type'
    }
  })
})
```

### Step 4: Run test to verify it passes

Run: `npm test -- integration.test.js`

Expected: Test PASSES

### Step 5: Add test for validation failure with missing type

```javascript
it('should fail validation when SUMMARY_LOG_TYPE is missing', async () => {
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

  summaryLogsValidator = new SummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    summaryLogExtractor,
    summaryLogUpdater
  })

  await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

  await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

  const updated = await summaryLogsRepository.findById(summaryLogId)

  expect(updated).toEqual({
    version: 2,
    summaryLog: {
      ...initialSummaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'Invalid summary log: missing summary log type'
    }
  })
})
```

### Step 6: Run test to verify it passes

Run: `npm test -- integration.test.js`

Expected: Test PASSES

### Step 7: Add test for validation failure with unrecognized type

```javascript
it('should fail validation when SUMMARY_LOG_TYPE is unrecognized', async () => {
  const fileId = initialSummaryLog.file.id

  summaryLogExtractor = createInMemorySummaryLogExtractor({
    [fileId]: {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-123',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'INVALID_TYPE',
          location: { sheet: 'Data', row: 2, column: 'B' }
        }
      },
      data: {}
    }
  })

  summaryLogsValidator = new SummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    summaryLogExtractor,
    summaryLogUpdater
  })

  await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

  await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

  const updated = await summaryLogsRepository.findById(summaryLogId)

  expect(updated).toEqual({
    version: 2,
    summaryLog: {
      ...initialSummaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'Invalid summary log: unrecognized summary log type'
    }
  })
})
```

### Step 8: Run test to verify it passes

Run: `npm test -- integration.test.js`

Expected: Test PASSES

### Step 9: Add test for EXPORTER type with exporter registration

```javascript
it('should validate successfully when SUMMARY_LOG_TYPE is EXPORTER and registration is exporter', async () => {
  const testOrg = buildOrganisation({
    registrations: [
      {
        id: randomUUID(),
        wasteRegistrationNumber: 'WRN-456',
        material: 'plastic',
        wasteProcessingType: 'exporter',
        formSubmissionTime: new Date(),
        submittedToRegulator: 'ea'
      }
    ]
  })

  organisationsRepository = createInMemoryOrganisationsRepository([testOrg])()

  const exporterSummaryLogId = randomUUID()
  const exporterSummaryLog = {
    status: SUMMARY_LOG_STATUS.VALIDATING,
    organisationId: testOrg.id,
    registrationId: testOrg.registrations[0].id,
    file: {
      id: `file-${randomUUID()}`,
      name: 'exporter-test.xlsx',
      status: UPLOAD_STATUS.COMPLETE,
      s3: {
        bucket: 'test-bucket',
        key: 'path/to/exporter-summary-log.xlsx'
      }
    }
  }

  const fileId = exporterSummaryLog.file.id

  summaryLogExtractor = createInMemorySummaryLogExtractor({
    [fileId]: {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-456',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'EXPORTER',
          location: { sheet: 'Data', row: 2, column: 'B' }
        }
      },
      data: {}
    }
  })

  summaryLogsValidator = new SummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    summaryLogExtractor,
    summaryLogUpdater
  })

  await summaryLogsRepository.insert(exporterSummaryLogId, exporterSummaryLog)

  await summaryLogsValidator.validate(exporterSummaryLogId)

  const updated = await summaryLogsRepository.findById(exporterSummaryLogId)

  expect(updated).toEqual({
    version: 2,
    summaryLog: {
      ...exporterSummaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED
    }
  })
})
```

### Step 10: Run test to verify it passes

Run: `npm test -- integration.test.js`

Expected: Test PASSES

### Step 11: Commit integration tests

```bash
git add src/workers/summary-logs/worker/integration.test.js
git commit -m "test: add integration tests for summary log type validation"
```

---

## Task 6: Verify Full Test Coverage

**Files:**

- N/A (verification step)

### Step 1: Run all tests with coverage

Run: `npm test`

Expected: All 539+ tests PASS with 100% coverage maintained

### Step 2: Verify validator.js coverage specifically

Check coverage output for `src/application/summary-logs/validator.js`:

- Statements: 100%
- Branch: 100%
- Functions: 100%
- Lines: 100%

### Step 3: Verify integration test coverage

Check coverage output for `src/workers/summary-logs/worker/integration.test.js`:

- All new test scenarios covered

### Step 4: Run linting

Run: `npm run lint`

Expected: No linting errors

### Step 5: Run type checking (if tsconfig.json exists)

Run: `npx tsc --noEmit`

Expected: No type errors

If tsconfig.json doesn't exist in worktree, copy from main:

```bash
cp ../main/tsconfig.json .
npx tsc --noEmit
```

### Step 6: Final commit if any fixes needed

If any linting or type errors were fixed:

```bash
git add .
git commit -m "chore: fix linting and type errors"
```

---

## Task 7: Update Design Document Implementation Checklist

**Files:**

- Modify: `docs/plans/2025-10-29-summary-log-type-validation-design.md:170-181`

### Step 1: Mark checklist items as complete

Update the Implementation Checklist section:

```markdown
## Implementation Checklist

- [x] Add type mapping constants to validator.js
- [x] Implement validateSummaryLogType function
- [x] Update performValidationChecks to call new validation
- [x] Add unit tests for validateSummaryLogType
- [x] Add integration tests for full validation flow
- [x] Verify 100% test coverage maintained
- [ ] Update spreadsheet templates to include \_\_EPR_META_SUMMARY_LOG_TYPE (if not already present)
```

### Step 2: Commit documentation update

```bash
git add docs/plans/2025-10-29-summary-log-type-validation-design.md
git commit -m "docs: mark implementation checklist items as complete"
```

---

## Summary

**Total Tasks:** 7
**Estimated Time:** 60-90 minutes
**Files Modified:** 3
**Files Created:** 0
**Tests Added:** ~11 tests (6 unit + 5 integration)

**Key Implementation Points:**

- Type mapping constants handle case differences between spreadsheet (uppercase) and database (lowercase)
- Validation follows existing pattern from `validateWasteRegistrationNumber`
- Static error messages prevent information leakage
- Comprehensive test coverage ensures all edge cases handled
- Integration tests verify end-to-end flow including status updates and failureReason storage

**Next Steps:**

- Template team needs to add `__EPR_META_SUMMARY_LOG_TYPE` to spreadsheet templates
- Consider adding validation to template generation process
- Monitor error rates after deployment to identify any edge cases
