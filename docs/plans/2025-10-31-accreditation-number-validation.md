# Accreditation Number Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate that summary log accreditation numbers match the registration's linked accreditation, or are absent when no accreditation exists.

**Architecture:** Modify `findRegistrationById` to hydrate registrations with linked accreditation data. Create new validator `validateAccreditationNumber` that checks spreadsheet accreditation number against `registration.accreditation.accreditationNumber`. Add to existing validation pipeline.

**Tech Stack:** Node.js, Vitest, MongoDB, Joi

---

## Task 1: Add Contract Tests for Registration Hydration

**Files:**

- Modify: `src/repositories/organisations/contract/find-registration-by-id.contract.js:52-end`

**Step 1: Write test for registration with hydrated accreditation**

Add this test after line 52 (after existing "returns registration when both organisation ID and registration ID are valid" test):

```javascript
it('returns registration with hydrated accreditation when accreditationId exists', async () => {
  const accreditation = {
    id: new ObjectId().toString(),
    accreditationNumber: 87654321,
    material: 'glass',
    wasteProcessingType: 'reprocessor',
    formSubmissionTime: '2025-08-19T19:34:44.944Z',
    submittedToRegulator: 'ea'
  }

  const registration = {
    id: new ObjectId().toString(),
    orgName: 'Test Org',
    material: 'glass',
    wasteProcessingType: 'reprocessor',
    wasteRegistrationNumber: 'CBDU111111',
    accreditationId: accreditation.id,
    formSubmissionTime: '2025-08-20T19:34:44.944Z',
    submittedToRegulator: 'ea'
  }

  const org = buildOrganisation({
    registrations: [registration],
    accreditations: [accreditation]
  })

  await repository.insert(org)

  const result = await repository.findRegistrationById(org.id, registration.id)

  expect(result).toMatchObject({
    id: registration.id,
    orgName: registration.orgName,
    material: registration.material,
    wasteProcessingType: registration.wasteProcessingType,
    wasteRegistrationNumber: registration.wasteRegistrationNumber,
    accreditationId: accreditation.id,
    accreditation: {
      id: accreditation.id,
      accreditationNumber: accreditation.accreditationNumber,
      material: accreditation.material,
      wasteProcessingType: accreditation.wasteProcessingType
    }
  })
})
```

**Step 2: Write test for registration without accreditation**

Add this test after the previous test:

```javascript
it('returns registration without accreditation field when accreditationId is undefined', async () => {
  const registration = {
    id: new ObjectId().toString(),
    orgName: 'Test Org',
    material: 'plastic',
    wasteProcessingType: 'exporter',
    wasteRegistrationNumber: 'CBDU222222',
    formSubmissionTime: '2025-08-20T19:34:44.944Z',
    submittedToRegulator: 'ea'
  }

  const org = buildOrganisation({
    registrations: [registration]
  })

  await repository.insert(org)

  const result = await repository.findRegistrationById(org.id, registration.id)

  expect(result).toMatchObject({
    id: registration.id,
    orgName: registration.orgName,
    material: registration.material,
    wasteProcessingType: registration.wasteProcessingType,
    wasteRegistrationNumber: registration.wasteRegistrationNumber
  })
  expect(result.accreditation).toBeUndefined()
})
```

**Step 3: Run tests to verify they fail**

```bash
npm test src/repositories/organisations/inmemory.test.js src/repositories/organisations/mongodb.test.js
```

Expected: Both test suites fail with "registration.accreditation is undefined" or similar

**Step 4: Commit the failing tests**

```bash
git add src/repositories/organisations/contract/find-registration-by-id.contract.js
git commit -m "test: add contract tests for registration accreditation hydration"
```

---

## Task 2: Update Repository Port Typedef

**Files:**

- Modify: `src/repositories/organisations/port.js:7`

**Step 1: Update the findRegistrationById typedef**

Replace line 7 with:

```javascript
 * @property {(organisationId: string, registrationId: string) => Promise<Object|null>} findRegistrationById - Returns registration with hydrated accreditation field if accreditationId exists
```

**Step 2: Commit the typedef update**

```bash
git add src/repositories/organisations/port.js
git commit -m "docs: update findRegistrationById typedef for accreditation hydration"
```

---

## Task 3: Implement Hydration in In-Memory Repository

**Files:**

- Modify: `src/repositories/organisations/inmemory.js:60-80`

**Step 1: Locate the findRegistrationById method**

The method starts around line 60. Current implementation:

```javascript
findRegistrationById: async (organisationId, registrationId) => {
  const organisation = await findById(organisationId)
  if (!organisation) {
    return null
  }

  const registration = organisation.registrations?.find(
    (r) => r.id === registrationId
  )

  return registration ?? null
}
```

**Step 2: Add accreditation hydration logic**

Replace the method (around lines 60-72) with:

```javascript
findRegistrationById: async (organisationId, registrationId) => {
  const organisation = await findById(organisationId)
  if (!organisation) {
    return null
  }

  const registration = organisation.registrations?.find(
    (r) => r.id === registrationId
  )

  if (!registration) {
    return null
  }

  // Hydrate with accreditation if accreditationId exists
  if (registration.accreditationId) {
    const accreditation = organisation.accreditations?.find(
      (a) => a.id === registration.accreditationId
    )
    if (accreditation) {
      return {
        ...registration,
        accreditation
      }
    }
  }

  return registration
}
```

**Step 3: Run in-memory repository tests**

```bash
npm test src/repositories/organisations/inmemory.test.js
```

Expected: All tests pass including the new contract tests

**Step 4: Commit the in-memory implementation**

```bash
git add src/repositories/organisations/inmemory.js
git commit -m "feat: add accreditation hydration to in-memory repository"
```

---

## Task 4: Implement Hydration in MongoDB Repository

**Files:**

- Modify: `src/repositories/organisations/mongodb.js:80-105`

**Step 1: Locate the findRegistrationById method**

The method starts around line 80. Current implementation uses MongoDB aggregation.

**Step 2: Add accreditation hydration logic**

Replace the method (around lines 80-105) with:

```javascript
findRegistrationById: async (organisationId, registrationId) => {
  if (!ObjectId.isValid(organisationId)) {
    return null
  }

  const result = await collection
    .aggregate([
      { $match: { _id: new ObjectId(organisationId) } },
      {
        $unwind: { path: '$registrations', preserveNullAndEmptyArrays: false }
      },
      { $match: { 'registrations.id': registrationId } },
      {
        $project: {
          registration: '$registrations',
          accreditations: 1
        }
      }
    ])
    .toArray()

  if (result.length === 0) {
    return null
  }

  const { registration, accreditations } = result[0]

  // Hydrate with accreditation if accreditationId exists
  if (registration.accreditationId && accreditations) {
    const accreditation = accreditations.find(
      (a) => a.id === registration.accreditationId
    )
    if (accreditation) {
      return {
        ...registration,
        accreditation
      }
    }
  }

  return registration
}
```

**Step 3: Run MongoDB repository tests**

```bash
npm test src/repositories/organisations/mongodb.test.js
```

Expected: All tests pass including the new contract tests

**Step 4: Run all repository tests to ensure nothing broke**

```bash
npm test src/repositories/organisations/
```

Expected: All 98 tests pass (48 inmemory + 50 mongodb)

**Step 5: Commit the MongoDB implementation**

```bash
git add src/repositories/organisations/mongodb.js
git commit -m "feat: add accreditation hydration to MongoDB repository"
```

---

## Task 5: Create Accreditation Number Validator with Tests

**Files:**

- Create: `src/application/summary-logs/validations/validate-accreditation-number.test.js`
- Create: `src/application/summary-logs/validations/validate-accreditation-number.js`

**Step 1: Write the validator test file**

Create `src/application/summary-logs/validations/validate-accreditation-number.test.js`:

```javascript
import { validateAccreditationNumber } from './validate-accreditation-number.js'

const mockLoggerInfo = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args)
  }
}))

describe('validateAccreditationNumber', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('throws error when registration has accreditation but spreadsheet is missing', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: 12345678
      }
    }
    const parsed = {
      meta: {}
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing accreditation number')
  })

  it('throws error when registration has accreditation but spreadsheet value is undefined', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: 12345678
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: undefined
        }
      }
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing accreditation number')
  })

  it('throws error when accreditation numbers do not match', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: 12345678
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: 99999999
        }
      }
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).toThrow(
      "Summary log's accreditation number does not match this registration"
    )
  })

  it('throws error when registration has no accreditation but spreadsheet has value', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: 12345678
        }
      }
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).toThrow(
      'Invalid summary log: accreditation number provided but registration has no accreditation'
    )
  })

  it('does not throw when accreditation numbers match', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: 12345678
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: 12345678
        }
      }
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).not.toThrow()

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Accreditation number validated: test-msg',
      event: {
        category: 'server',
        action: 'process_success'
      }
    })
  })

  it('does not throw when registration has no accreditation and spreadsheet is blank', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {}
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).not.toThrow()

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Accreditation number validated: test-msg',
      event: {
        category: 'server',
        action: 'process_success'
      }
    })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test src/application/summary-logs/validations/validate-accreditation-number.test.js
```

Expected: FAIL with "Cannot find module" error

**Step 3: Write the validator implementation**

Create `src/application/summary-logs/validations/validate-accreditation-number.js`:

```javascript
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Validates that the accreditation number in the spreadsheet matches the registration's accreditation number
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @throws {Error} If validation fails
 */
export const validateAccreditationNumber = ({
  parsed,
  registration,
  loggingContext
}) => {
  const accreditationNumber = registration.accreditation?.accreditationNumber
  const spreadsheetAccreditationNumber =
    parsed?.meta?.ACCREDITATION_NUMBER?.value

  // Case 1: Registration has accreditation → spreadsheet MUST match
  if (accreditationNumber) {
    if (!spreadsheetAccreditationNumber) {
      throw new Error('Invalid summary log: missing accreditation number')
    }

    if (spreadsheetAccreditationNumber !== accreditationNumber) {
      throw new Error(
        "Summary log's accreditation number does not match this registration"
      )
    }
  }

  // Case 2: Registration has NO accreditation → spreadsheet MUST be blank
  if (!accreditationNumber && spreadsheetAccreditationNumber) {
    throw new Error(
      'Invalid summary log: accreditation number provided but registration has no accreditation'
    )
  }

  logger.info({
    message: `Accreditation number validated: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
```

**Step 4: Run test to verify it passes**

```bash
npm test src/application/summary-logs/validations/validate-accreditation-number.test.js
```

Expected: All 6 tests pass

**Step 5: Commit the validator**

```bash
git add src/application/summary-logs/validations/validate-accreditation-number.js src/application/summary-logs/validations/validate-accreditation-number.test.js
git commit -m "feat: add accreditation number validator"
```

---

## Task 6: Add Validator to Pipeline

**Files:**

- Modify: `src/application/summary-logs/validate.js:1,68-72`

**Step 1: Add import statement**

At line 8 (after the other validation imports), add:

```javascript
import { validateAccreditationNumber } from './validations/validate-accreditation-number.js'
```

**Step 2: Add validator to pipeline**

Around line 68-72, update the validators array:

```javascript
const validators = [
  validateWasteRegistrationNumber,
  validateSummaryLogType,
  validateSummaryLogMaterialType,
  validateAccreditationNumber
]
```

**Step 3: Run validation tests**

```bash
npm test src/application/summary-logs/validate.test.js
```

Expected: All 12 tests pass

**Step 4: Commit the pipeline update**

```bash
git add src/application/summary-logs/validate.js
git commit -m "feat: add accreditation number validator to pipeline"
```

---

## Task 7: Add Integration Tests

**Files:**

- Modify: `src/workers/summary-logs/worker/integration.test.js:96-end`

**Step 1: Add test helper for accreditation scenarios**

After the existing tests (around line 260), add these integration tests:

```javascript
describe('accreditation number validation', () => {
  it('should validate successfully when registration has accreditation and numbers match', async () => {
    const accreditationNumber = 87654321

    const { updated, summaryLog } = await runValidation({
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      accreditationNumber,
      metadata: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-123',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'REPROCESSOR',
          location: { sheet: 'Data', row: 2, column: 'B' }
        },
        MATERIAL: {
          value: 'aluminium',
          location: { sheet: 'Data', row: 3, column: 'B' }
        },
        ACCREDITATION_NUMBER: {
          value: accreditationNumber,
          location: { sheet: 'Data', row: 4, column: 'B' }
        }
      }
    })

    expect(updated).toBe(true)
    expect(summaryLog.status).toBe('validated')
    expect(summaryLog.failureReason).toBeUndefined()
  })

  it('should fail validation when registration has accreditation but spreadsheet number does not match', async () => {
    const { updated, summaryLog } = await runValidation({
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      accreditationNumber: 87654321,
      metadata: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-123',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'REPROCESSOR',
          location: { sheet: 'Data', row: 2, column: 'B' }
        },
        MATERIAL: {
          value: 'aluminium',
          location: { sheet: 'Data', row: 3, column: 'B' }
        },
        ACCREDITATION_NUMBER: {
          value: 99999999,
          location: { sheet: 'Data', row: 4, column: 'B' }
        }
      }
    })

    expect(updated).toBe(true)
    expect(summaryLog.status).toBe('invalid')
    expect(summaryLog.failureReason).toBe(
      "Summary log's accreditation number does not match this registration"
    )
  })

  it('should fail validation when registration has accreditation but spreadsheet is missing accreditation number', async () => {
    const { updated, summaryLog } = await runValidation({
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      accreditationNumber: 87654321,
      metadata: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-123',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'REPROCESSOR',
          location: { sheet: 'Data', row: 2, column: 'B' }
        },
        MATERIAL: {
          value: 'aluminium',
          location: { sheet: 'Data', row: 3, column: 'B' }
        }
      }
    })

    expect(updated).toBe(true)
    expect(summaryLog.status).toBe('invalid')
    expect(summaryLog.failureReason).toBe(
      'Invalid summary log: missing accreditation number'
    )
  })

  it('should validate successfully when registration has no accreditation and spreadsheet is blank', async () => {
    const { updated, summaryLog } = await runValidation({
      registrationType: 'exporter',
      registrationWRN: 'WRN-456',
      metadata: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-456',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'EXPORTER',
          location: { sheet: 'Data', row: 2, column: 'B' }
        },
        MATERIAL: {
          value: 'plastic',
          location: { sheet: 'Data', row: 3, column: 'B' }
        }
      }
    })

    expect(updated).toBe(true)
    expect(summaryLog.status).toBe('validated')
    expect(summaryLog.failureReason).toBeUndefined()
  })

  it('should fail validation when registration has no accreditation but spreadsheet provides number', async () => {
    const { updated, summaryLog } = await runValidation({
      registrationType: 'exporter',
      registrationWRN: 'WRN-456',
      metadata: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-456',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'EXPORTER',
          location: { sheet: 'Data', row: 2, column: 'B' }
        },
        MATERIAL: {
          value: 'plastic',
          location: { sheet: 'Data', row: 3, column: 'B' }
        },
        ACCREDITATION_NUMBER: {
          value: 12345678,
          location: { sheet: 'Data', row: 4, column: 'B' }
        }
      }
    })

    expect(updated).toBe(true)
    expect(summaryLog.status).toBe('invalid')
    expect(summaryLog.failureReason).toBe(
      'Invalid summary log: accreditation number provided but registration has no accreditation'
    )
  })
})
```

**Step 2: Update runValidation helper to support accreditation**

Find the `runValidation` function (around line 30-90) and modify it to handle accreditation numbers:

In the organisation setup (around line 50), update the registration to include accreditation when provided:

```javascript
const accreditation = accreditationNumber
  ? {
      id: new ObjectId().toString(),
      accreditationNumber,
      material: registrationType === 'reprocessor' ? 'aluminium' : 'plastic',
      wasteProcessingType: registrationType,
      formSubmissionTime: '2025-08-19T19:34:44.944Z',
      submittedToRegulator: 'ea'
    }
  : undefined

const registration = {
  id: registrationId,
  material: registrationType === 'reprocessor' ? 'aluminium' : 'plastic',
  wasteProcessingType: registrationType,
  wasteRegistrationNumber: registrationWRN,
  accreditationId: accreditation?.id,
  formSubmissionTime: '2025-08-20T19:34:44.944Z',
  submittedToRegulator: 'ea'
}

const organisation = buildOrganisation({
  registrations: [registration],
  accreditations: accreditation ? [accreditation] : []
})
```

**Step 3: Run integration tests**

```bash
npm test src/workers/summary-logs/worker/integration.test.js
```

Expected: All 13 tests pass (8 original + 5 new)

**Step 4: Run full test suite to ensure everything passes**

```bash
npm test
```

Expected: All 548 tests pass with 100% coverage

**Step 5: Commit the integration tests**

```bash
git add src/workers/summary-logs/worker/integration.test.js
git commit -m "test: add integration tests for accreditation number validation"
```

---

## Task 8: Final Verification

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass with 100% coverage

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No type errors

**Step 3: Verify git status is clean**

```bash
git status
```

Expected: Working tree clean, all changes committed

**Step 4: Review commit history**

```bash
git log --oneline -10
```

Expected: 8 commits following conventional format

---

## Completion Checklist

- [ ] Contract tests added and passing
- [ ] Repository port typedef updated
- [ ] In-memory repository hydration implemented
- [ ] MongoDB repository hydration implemented
- [ ] Validator created with comprehensive tests
- [ ] Validator added to pipeline
- [ ] Integration tests added and passing
- [ ] All tests pass with 100% coverage
- [ ] Type check passes
- [ ] All changes committed with conventional format

**Acceptance Criteria Coverage:**

- AC1: ✅ Validation triggers on upload (already implemented)
- AC2: ✅ Both numbers match → validated
- AC3: ✅ One matches, one doesn't → invalid
- AC4: ✅ One or both missing when expected → invalid
