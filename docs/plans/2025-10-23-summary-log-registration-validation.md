# Summary Log Registration Number Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate that uploaded summary log spreadsheets contain a registration number matching the registration ID from the upload URL, preventing data corruption from mismatched uploads.

**Architecture:** Add a `validateRegistrationNumber()` helper function in the existing validator module that checks the parsed metadata against the expected registration ID. Integrate it into the `summaryLogsValidator()` flow between parsing and status update. Leverage existing error handling to surface validation failures to users.

**Tech Stack:** Node.js, Vitest, existing validator pattern from `src/application/summary-logs/validator.js`

---

## Task 1: Write Validation Function Tests

**Files:**

- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write failing test for missing registration number**

Add to `src/application/summary-logs/validator.test.js` after the existing tests:

```javascript
describe('validateRegistrationNumber', () => {
  it('throws error when registration number is missing', () => {
    const parsed = {
      meta: {},
      data: {}
    }

    expect(() =>
      validateRegistrationNumber({
        parsed,
        expectedRegistrationId: 'REG12345',
        msg: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing registration number')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- validator.test.js`
Expected: FAIL with "validateRegistrationNumber is not defined"

**Step 3: Export validateRegistrationNumber for testing**

In `src/application/summary-logs/validator.js`, add before the existing `summaryLogsValidator` export:

```javascript
/**
 * Validates that the registration number in the spreadsheet matches the expected registration ID
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {string} params.expectedRegistrationId - The registration ID from the upload URL
 * @param {string} params.msg - Logging context message
 * @throws {Error} If registration number is missing or mismatched
 */
export const validateRegistrationNumber = ({
  parsed,
  expectedRegistrationId,
  msg
}) => {
  const registrationNumber = parsed?.meta?.REGISTRATION_NUMBER?.value

  if (!registrationNumber) {
    throw new Error('Invalid summary log: missing registration number')
  }

  if (registrationNumber !== expectedRegistrationId) {
    throw new Error(
      `Registration number mismatch: spreadsheet contains ${registrationNumber} but was uploaded to ${expectedRegistrationId}`
    )
  }

  logger.info({
    message: `Registration number validated: ${msg}, registrationId=${expectedRegistrationId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
```

**Step 4: Import validateRegistrationNumber in tests**

In `src/application/summary-logs/validator.test.js`, update the import at the top:

```javascript
import {
  summaryLogsValidator,
  validateRegistrationNumber
} from './validator.js'
```

**Step 5: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add src/application/summary-logs/validator.js src/application/summary-logs/validator.test.js
git commit -m "feat(summary-logs): add validateRegistrationNumber with missing test"
```

---

## Task 2: Test Registration Number Mismatch

**Files:**

- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write test for mismatched registration number**

Add to the `validateRegistrationNumber` describe block:

```javascript
it('throws error when registration numbers do not match', () => {
  const parsed = {
    meta: {
      REGISTRATION_NUMBER: {
        value: 'REG99999',
        location: { sheet: 'Data', row: 1, column: 'B' }
      }
    },
    data: {}
  }

  expect(() =>
    validateRegistrationNumber({
      parsed,
      expectedRegistrationId: 'REG12345',
      msg: 'test-msg'
    })
  ).toThrow(
    'Registration number mismatch: spreadsheet contains REG99999 but was uploaded to REG12345'
  )
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS (implementation already handles this case)

**Step 3: Commit**

```bash
git add src/application/summary-logs/validator.test.js
git commit -m "test(summary-logs): add registration mismatch test"
```

---

## Task 3: Test Successful Validation

**Files:**

- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write test for successful validation**

Add to the `validateRegistrationNumber` describe block:

```javascript
it('does not throw when registration numbers match', () => {
  const parsed = {
    meta: {
      REGISTRATION_NUMBER: {
        value: 'REG12345',
        location: { sheet: 'Data', row: 1, column: 'B' }
      }
    },
    data: {}
  }

  expect(() =>
    validateRegistrationNumber({
      parsed,
      expectedRegistrationId: 'REG12345',
      msg: 'test-msg'
    })
  ).not.toThrow()
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add src/application/summary-logs/validator.test.js
git commit -m "test(summary-logs): add successful validation test"
```

---

## Task 4: Test Undefined Registration Number Value

**Files:**

- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write test for undefined registration number value**

Add to the `validateRegistrationNumber` describe block:

```javascript
it('throws error when registration number value is undefined', () => {
  const parsed = {
    meta: {
      REGISTRATION_NUMBER: {
        value: undefined,
        location: { sheet: 'Data', row: 1, column: 'B' }
      }
    },
    data: {}
  }

  expect(() =>
    validateRegistrationNumber({
      parsed,
      expectedRegistrationId: 'REG12345',
      msg: 'test-msg'
    })
  ).toThrow('Invalid summary log: missing registration number')
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add src/application/summary-logs/validator.test.js
git commit -m "test(summary-logs): add undefined registration value test"
```

---

## Task 5: Integration Test - Missing Registration Number

**Files:**

- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write failing integration test for missing registration**

Add a new test in the main `summaryLogsValidator` describe block:

```javascript
it('sets status to INVALID when registration number is missing', async () => {
  const summaryLogId = 'test-summary-log-id'
  const fileId = 'test-file-id'
  const filename = 'test.xlsx'
  const registrationId = 'REG12345'

  const summaryLog = {
    file: {
      id: fileId,
      name: filename,
      s3: {
        bucket: 'test-bucket',
        key: 'test-key'
      }
    },
    registrationId
  }

  const mockUploadsRepository = {
    findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
  }

  const mockSummaryLogsRepository = {
    findById: vi.fn().mockResolvedValue({
      version: 1,
      summaryLog
    }),
    update: vi.fn().mockResolvedValue()
  }

  const mockSummaryLogsParser = {
    parse: vi.fn().mockResolvedValue({
      meta: {}, // Missing REGISTRATION_NUMBER
      data: {}
    })
  }

  await expect(
    summaryLogsValidator({
      uploadsRepository: mockUploadsRepository,
      summaryLogsRepository: mockSummaryLogsRepository,
      summaryLogsParser: mockSummaryLogsParser,
      summaryLogId
    })
  ).rejects.toThrow('Invalid summary log: missing registration number')

  expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
    summaryLogId,
    1,
    {
      status: 'invalid',
      failureReason: 'Invalid summary log: missing registration number'
    }
  )
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- validator.test.js`
Expected: FAIL because validation is not yet integrated into the main flow

**Step 3: Integrate validation into summaryLogsValidator**

In `src/application/summary-logs/validator.js`, modify the `summaryLogsValidator` function's try block. After the `parseSummaryLog` call (around line 164), add:

```javascript
const parsed = await parseSummaryLog({
  summaryLogsParser,
  summaryLogBuffer,
  msg
})

validateRegistrationNumber({
  parsed,
  expectedRegistrationId: summaryLog.registrationId,
  msg
})
```

**Step 4: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/application/summary-logs/validator.js src/application/summary-logs/validator.test.js
git commit -m "feat(summary-logs): integrate registration validation in main flow"
```

---

## Task 6: Integration Test - Mismatched Registration Number

**Files:**

- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write test for registration mismatch**

Add to the main `summaryLogsValidator` describe block:

```javascript
it('sets status to INVALID when registration numbers do not match', async () => {
  const summaryLogId = 'test-summary-log-id'
  const fileId = 'test-file-id'
  const filename = 'test.xlsx'
  const registrationId = 'REG12345'

  const summaryLog = {
    file: {
      id: fileId,
      name: filename,
      s3: {
        bucket: 'test-bucket',
        key: 'test-key'
      }
    },
    registrationId
  }

  const mockUploadsRepository = {
    findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
  }

  const mockSummaryLogsRepository = {
    findById: vi.fn().mockResolvedValue({
      version: 1,
      summaryLog
    }),
    update: vi.fn().mockResolvedValue()
  }

  const mockSummaryLogsParser = {
    parse: vi.fn().mockResolvedValue({
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG99999',
          location: { sheet: 'Data', row: 1, column: 'B' }
        }
      },
      data: {}
    })
  }

  await expect(
    summaryLogsValidator({
      uploadsRepository: mockUploadsRepository,
      summaryLogsRepository: mockSummaryLogsRepository,
      summaryLogsParser: mockSummaryLogsParser,
      summaryLogId
    })
  ).rejects.toThrow(
    'Registration number mismatch: spreadsheet contains REG99999 but was uploaded to REG12345'
  )

  expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
    summaryLogId,
    1,
    {
      status: 'invalid',
      failureReason:
        'Registration number mismatch: spreadsheet contains REG99999 but was uploaded to REG12345'
    }
  )
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS (implementation already integrated)

**Step 3: Commit**

```bash
git add src/application/summary-logs/validator.test.js
git commit -m "test(summary-logs): add integration test for registration mismatch"
```

---

## Task 7: Integration Test - Successful Validation

**Files:**

- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write test for successful validation flow**

Add to the main `summaryLogsValidator` describe block:

```javascript
it('sets status to VALIDATED when registration numbers match', async () => {
  const summaryLogId = 'test-summary-log-id'
  const fileId = 'test-file-id'
  const filename = 'test.xlsx'
  const registrationId = 'REG12345'

  const summaryLog = {
    file: {
      id: fileId,
      name: filename,
      s3: {
        bucket: 'test-bucket',
        key: 'test-key'
      }
    },
    registrationId
  }

  const mockUploadsRepository = {
    findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
  }

  const mockSummaryLogsRepository = {
    findById: vi.fn().mockResolvedValue({
      version: 1,
      summaryLog
    }),
    update: vi.fn().mockResolvedValue()
  }

  const mockSummaryLogsParser = {
    parse: vi.fn().mockResolvedValue({
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG12345',
          location: { sheet: 'Data', row: 1, column: 'B' }
        }
      },
      data: {}
    })
  }

  await summaryLogsValidator({
    uploadsRepository: mockUploadsRepository,
    summaryLogsRepository: mockSummaryLogsRepository,
    summaryLogsParser: mockSummaryLogsParser,
    summaryLogId
  })

  expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
    summaryLogId,
    1,
    {
      status: 'validated',
      failureReason: undefined
    }
  )
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add src/application/summary-logs/validator.test.js
git commit -m "test(summary-logs): add integration test for successful validation"
```

---

## Task 8: Run Full Test Suite

**Files:**

- All test files

**Step 1: Run complete test suite**

Run: `npm test`
Expected: All tests PASS with 100% coverage

**Step 2: Fix any coverage gaps**

If coverage is below 100%, identify uncovered lines:

- Check coverage report
- Add missing test cases
- Re-run `npm test`

**Step 3: Run type checking**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit any additional tests**

```bash
git add .
git commit -m "test(summary-logs): achieve 100% coverage"
```

---

## Task 9: Copy Design Document to Worktree

**Files:**

- Create: `docs/plans/2025-10-23-summary-log-registration-validation-design.md`

**Step 1: Copy design doc from main worktree**

Run:

```bash
cp ../main/docs/plans/2025-10-23-summary-log-registration-validation-design.md docs/plans/
```

**Step 2: Verify file exists**

Run: `ls -la docs/plans/2025-10-23-summary-log-registration-validation-design.md`
Expected: File exists

**Step 3: Commit design document**

```bash
git add docs/plans/2025-10-23-summary-log-registration-validation-design.md
git commit -m "docs(summary-logs): add PAE-415 design document"
```

---

## Verification

**All tests must pass:**

```bash
npm test
```

**Type checking must pass:**

```bash
npx tsc --noEmit
```

**Coverage must be 100%:**

- Check output of `npm test`
- All new code must be covered

---

## References

- **Design Document:** `docs/plans/2025-10-23-summary-log-registration-validation-design.md`
- **ADR 0017:** `docs/architecture/decisions/0017-decouple-spreadsheet-data-extraction-from-layout-using-markers.md`
- **Existing Validator:** `src/application/summary-logs/validator.js`
- **Ticket:** [PAE-415](https://eaflood.atlassian.net/browse/PAE-415)
