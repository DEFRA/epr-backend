# Summary Log Registration Number Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate that uploaded summary log spreadsheets contain a waste registration number matching the registration entity's wasteRegistrationNumber field, preventing data corruption from mismatched uploads.

**Architecture:** Add `findRegistrationById()` method to organisations repository, add `fetchRegistration()` and `validateRegistrationNumber()` helper functions to the validator, integrate validation into the main flow between parsing and status update.

**Tech Stack:** Node.js, Vitest, MongoDB, existing repository pattern

---

## Task 1: Add findRegistrationById Port Definition

**Files:**

- Modify: `src/repositories/organisations/port.js`

**Step 1: Add method to port typedef**

In `src/repositories/organisations/port.js`, update the typedef (after line 5):

```javascript
/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {() => Promise<Object[]>} findAll
 * @property {(id: string) => Promise<Object|null>} findById
 * @property {(organisationId: string, registrationId: string) => Promise<Object|null>} findRegistrationById
 */
```

**Step 2: Run type checking**

Run: `npx tsc --noEmit`
Expected: No errors (this is just a typedef)

**Step 3: Commit**

```bash
git add src/repositories/organisations/port.js
git commit -m "feat(organisations): add findRegistrationById to port definition"
```

---

## Task 2: Implement findRegistrationById in In-Memory Adapter

**Files:**

- Modify: `src/repositories/organisations/inmemory.js`
- Test: `src/repositories/organisations/inmemory.test.js`

**Step 1: Write failing test**

Add to `src/repositories/organisations/inmemory.test.js` after existing tests:

```javascript
describe('findRegistrationById', () => {
  it('returns registration when found', async () => {
    const repo = createInMemoryOrganisationsRepository()
    const org = {
      id: 'org-123',
      companyDetails: { name: 'Test Org' },
      registrations: [
        {
          id: 'reg-456',
          wasteRegistrationNumber: 'WRN12345',
          material: 'Paper and board',
          wasteProcessingType: 'REPROCESSOR',
          formSubmissionTime: new Date(),
          submittedToRegulator: 'EA'
        }
      ]
    }

    await repo.insert(org)

    const result = await repo.findRegistrationById('org-123', 'reg-456')

    expect(result).toBeDefined()
    expect(result.id).toBe('reg-456')
    expect(result.wasteRegistrationNumber).toBe('WRN12345')
  })

  it('returns null when organisation not found', async () => {
    const repo = createInMemoryOrganisationsRepository()

    const result = await repo.findRegistrationById('not-exist', 'reg-456')

    expect(result).toBeNull()
  })

  it('returns null when registration not found in organisation', async () => {
    const repo = createInMemoryOrganisationsRepository()
    const org = {
      id: 'org-123',
      companyDetails: { name: 'Test Org' },
      registrations: [
        {
          id: 'reg-456',
          wasteRegistrationNumber: 'WRN12345',
          material: 'Paper and board',
          wasteProcessingType: 'REPROCESSOR',
          formSubmissionTime: new Date(),
          submittedToRegulator: 'EA'
        }
      ]
    }

    await repo.insert(org)

    const result = await repo.findRegistrationById('org-123', 'not-exist')

    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- inmemory.test.js`
Expected: FAIL with "findRegistrationById is not a function"

**Step 3: Implement findRegistrationById in inmemory adapter**

In `src/repositories/organisations/inmemory.js`, add method to the return object (around line 100, after `findById`):

```javascript
findRegistrationById: async (organisationId, registrationId) => {
  const org = organisations.get(organisationId)
  if (!org) return null

  const registration = org.registrations?.find((r) => r.id === registrationId)
  return registration || null
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- inmemory.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/repositories/organisations/inmemory.js src/repositories/organisations/inmemory.test.js
git commit -m "feat(organisations): implement findRegistrationById in inmemory adapter"
```

---

## Task 3: Implement findRegistrationById in MongoDB Adapter

**Files:**

- Modify: `src/repositories/organisations/mongodb.js`
- Test: `src/repositories/organisations/mongodb.test.js`

**Step 1: Write failing test**

Add to `src/repositories/organisations/mongodb.test.js` after existing tests:

```javascript
describe('findRegistrationById', () => {
  it('returns registration when found', async () => {
    const org = {
      id: 'org-123',
      companyDetails: { name: 'Test Org' },
      registrations: [
        {
          id: 'reg-456',
          wasteRegistrationNumber: 'WRN12345',
          material: 'Paper and board',
          wasteProcessingType: 'REPROCESSOR',
          formSubmissionTime: new Date(),
          submittedToRegulator: 'EA'
        }
      ]
    }

    await repository.insert(org)

    const result = await repository.findRegistrationById('org-123', 'reg-456')

    expect(result).toBeDefined()
    expect(result.id).toBe('reg-456')
    expect(result.wasteRegistrationNumber).toBe('WRN12345')
  })

  it('returns null when organisation not found', async () => {
    const result = await repository.findRegistrationById('not-exist', 'reg-456')

    expect(result).toBeNull()
  })

  it('returns null when registration not found in organisation', async () => {
    const org = {
      id: 'org-123',
      companyDetails: { name: 'Test Org' },
      registrations: [
        {
          id: 'reg-456',
          wasteRegistrationNumber: 'WRN12345',
          material: 'Paper and board',
          wasteProcessingType: 'REPROCESSOR',
          formSubmissionTime: new Date(),
          submittedToRegulator: 'EA'
        }
      ]
    }

    await repository.insert(org)

    const result = await repository.findRegistrationById('org-123', 'not-exist')

    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- mongodb.test.js`
Expected: FAIL with "findRegistrationById is not a function"

**Step 3: Implement findRegistrationById in mongodb adapter**

In `src/repositories/organisations/mongodb.js`, add method to the return object (after `findById`):

```javascript
findRegistrationById: async (organisationId, registrationId) => {
  const org = await db
    .collection('organisations')
    .findOne({ id: organisationId })
  if (!org) return null

  const registration = org.registrations?.find((r) => r.id === registrationId)
  return registration || null
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- mongodb.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/repositories/organisations/mongodb.js src/repositories/organisations/mongodb.test.js
git commit -m "feat(organisations): implement findRegistrationById in mongodb adapter"
```

---

## Task 4: Add Contract Tests for findRegistrationById

**Files:**

- Create: `src/repositories/organisations/contract/find-registration-by-id.contract.js`
- Modify: `src/repositories/organisations/contract/index.js`

**Step 1: Create contract test file**

Create `src/repositories/organisations/contract/find-registration-by-id.contract.js`:

```javascript
import { beforeEach, describe, expect, it } from 'vitest'
import { organisation } from './test-data.js'

/**
 * @param {import('../port.js').OrganisationsRepository} repository
 */
export const findRegistrationByIdContract = (repository) => {
  describe('findRegistrationById contract', () => {
    let insertedOrg

    beforeEach(async () => {
      insertedOrg = await repository.insert(organisation)
    })

    describe('when organisation and registration exist', () => {
      it('returns the registration', async () => {
        const registrationId = insertedOrg.registrations[0].id

        const result = await repository.findRegistrationById(
          insertedOrg.id,
          registrationId
        )

        expect(result).toBeDefined()
        expect(result.id).toBe(registrationId)
        expect(result.wasteRegistrationNumber).toBe(
          insertedOrg.registrations[0].wasteRegistrationNumber
        )
      })
    })

    describe('when organisation does not exist', () => {
      it('returns null', async () => {
        const result = await repository.findRegistrationById(
          'non-existent-org',
          'some-reg-id'
        )

        expect(result).toBeNull()
      })
    })

    describe('when registration does not exist in organisation', () => {
      it('returns null', async () => {
        const result = await repository.findRegistrationById(
          insertedOrg.id,
          'non-existent-reg'
        )

        expect(result).toBeNull()
      })
    })
  })
}
```

**Step 2: Add to contract index**

In `src/repositories/organisations/contract/index.js`, add import and export:

```javascript
import { findRegistrationByIdContract } from './find-registration-by-id.contract.js'

export const organisationsRepositoryContract = (repository) => {
  findByIdContract(repository)
  insertContract(repository)
  updateContract(repository)
  findRegistrationByIdContract(repository) // NEW
}
```

**Step 3: Run contract tests**

Run: `npm test -- contract`
Expected: PASS (both in-memory and mongodb tests)

**Step 4: Commit**

```bash
git add src/repositories/organisations/contract/find-registration-by-id.contract.js src/repositories/organisations/contract/index.js
git commit -m "test(organisations): add contract tests for findRegistrationById"
```

---

## Task 5: Add fetchRegistration Helper to Validator

**Files:**

- Modify: `src/application/summary-logs/validator.js`
- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write failing test**

Add to `src/application/summary-logs/validator.test.js` after existing tests:

```javascript
describe('fetchRegistration', () => {
  it('returns registration when found', async () => {
    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: 'reg-123',
        wasteRegistrationNumber: 'WRN12345'
      })
    }

    const result = await fetchRegistration({
      organisationsRepository: mockOrganisationsRepository,
      organisationId: 'org-123',
      registrationId: 'reg-123',
      msg: 'test-msg'
    })

    expect(result).toBeDefined()
    expect(result.id).toBe('reg-123')
    expect(result.wasteRegistrationNumber).toBe('WRN12345')
  })

  it('throws error when registration not found', async () => {
    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue(null)
    }

    await expect(
      fetchRegistration({
        organisationsRepository: mockOrganisationsRepository,
        organisationId: 'org-123',
        registrationId: 'reg-123',
        msg: 'test-msg'
      })
    ).rejects.toThrow(
      'Registration not found: organisationId=org-123, registrationId=reg-123'
    )
  })
})
```

**Step 2: Import fetchRegistration in test file**

At the top of `src/application/summary-logs/validator.test.js`, update the import:

```javascript
import { summaryLogsValidator, fetchRegistration } from './validator.js'
```

**Step 3: Run test to verify it fails**

Run: `npm test -- validator.test.js`
Expected: FAIL with "fetchRegistration is not defined"

**Step 4: Implement fetchRegistration helper**

In `src/application/summary-logs/validator.js`, add after the `parseSummaryLog` function (around line 77):

```javascript
/**
 * Fetches a registration from the organisations repository
 *
 * @param {Object} params
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} params.organisationsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.msg
 * @returns {Promise<Object>}
 */
const fetchRegistration = async ({
  organisationsRepository,
  organisationId,
  registrationId,
  msg
}) => {
  const registration = await organisationsRepository.findRegistrationById(
    organisationId,
    registrationId
  )

  if (!registration) {
    throw new Error(
      `Registration not found: organisationId=${organisationId}, registrationId=${registrationId}`
    )
  }

  logger.info({
    message: `Fetched registration: ${msg}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return registration
}
```

**Step 5: Export fetchRegistration for testing**

At the bottom of `src/application/summary-logs/validator.js`, update the exports:

```javascript
export { summaryLogsValidator, fetchRegistration }
```

**Step 6: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS

**Step 7: Commit**

```bash
git add src/application/summary-logs/validator.js src/application/summary-logs/validator.test.js
git commit -m "feat(summary-logs): add fetchRegistration helper"
```

---

## Task 6: Add validateRegistrationNumber Helper to Validator

**Files:**

- Modify: `src/application/summary-logs/validator.js`
- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write failing tests**

Add to `src/application/summary-logs/validator.test.js`:

```javascript
describe('validateRegistrationNumber', () => {
  it('throws error when registration has no wasteRegistrationNumber', () => {
    const registration = {
      id: 'reg-123'
      // wasteRegistrationNumber missing
    }
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN12345'
        }
      }
    }

    expect(() =>
      validateRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).toThrow(
      'Invalid summary log: registration has no waste registration number'
    )
  })

  it('throws error when spreadsheet missing registration number', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {}
      // WASTE_REGISTRATION_NUMBER missing
    }

    expect(() =>
      validateRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing registration number')
  })

  it('throws error when spreadsheet registration number value is undefined', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: undefined
        }
      }
    }

    expect(() =>
      validateRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing registration number')
  })

  it('throws error when registration numbers do not match', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN99999'
        }
      }
    }

    expect(() =>
      validateRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).toThrow(
      'Registration number mismatch: spreadsheet contains WRN99999 but registration is WRN12345'
    )
  })

  it('does not throw when registration numbers match', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN12345'
        }
      }
    }

    expect(() =>
      validateRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).not.toThrow()
  })
})
```

**Step 2: Import validateRegistrationNumber in test file**

Update the import at the top of `src/application/summary-logs/validator.test.js`:

```javascript
import {
  summaryLogsValidator,
  fetchRegistration,
  validateRegistrationNumber
} from './validator.js'
```

**Step 3: Run test to verify it fails**

Run: `npm test -- validator.test.js`
Expected: FAIL with "validateRegistrationNumber is not defined"

**Step 4: Implement validateRegistrationNumber helper**

In `src/application/summary-logs/validator.js`, add after the `fetchRegistration` function:

```javascript
/**
 * Validates that the registration number in the spreadsheet matches the registration's waste registration number
 *
 * @param {Object} params
 * @param {Object} params.parsed
 * @param {Object} params.registration
 * @param {string} params.msg
 * @throws {Error} If validation fails
 */
const validateRegistrationNumber = ({ parsed, registration, msg }) => {
  const { wasteRegistrationNumber } = registration
  const spreadsheetRegistrationNumber =
    parsed?.meta?.WASTE_REGISTRATION_NUMBER?.value

  if (!wasteRegistrationNumber) {
    throw new Error(
      'Invalid summary log: registration has no waste registration number'
    )
  }

  if (!spreadsheetRegistrationNumber) {
    throw new Error('Invalid summary log: missing registration number')
  }

  if (spreadsheetRegistrationNumber !== wasteRegistrationNumber) {
    throw new Error(
      `Registration number mismatch: spreadsheet contains ${spreadsheetRegistrationNumber} but registration is ${wasteRegistrationNumber}`
    )
  }

  logger.info({
    message: `Registration number validated: ${msg}, registrationNumber=${wasteRegistrationNumber}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
```

**Step 5: Export validateRegistrationNumber for testing**

Update exports at the bottom of `src/application/summary-logs/validator.js`:

```javascript
export { summaryLogsValidator, fetchRegistration, validateRegistrationNumber }
```

**Step 6: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS

**Step 7: Commit**

```bash
git add src/application/summary-logs/validator.js src/application/summary-logs/validator.test.js
git commit -m "feat(summary-logs): add validateRegistrationNumber helper"
```

---

## Task 7: Integrate Validation into summaryLogsValidator

**Files:**

- Modify: `src/application/summary-logs/validator.js`
- Test: `src/application/summary-logs/validator.test.js`

**Step 1: Write failing integration test**

Add to the main `summaryLogsValidator` describe block in `src/application/summary-logs/validator.test.js`:

```javascript
it('sets status to INVALID when registration not found', async () => {
  const summaryLogId = 'test-summary-log-id'
  const organisationId = 'org-123'
  const registrationId = 'reg-456'

  const summaryLog = {
    file: {
      id: 'file-id',
      name: 'test.xlsx',
      s3: { bucket: 'test-bucket', key: 'test-key' }
    },
    organisationId,
    registrationId
  }

  const mockOrganisationsRepository = {
    findRegistrationById: vi.fn().mockResolvedValue(null)
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
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
      },
      data: {}
    })
  }

  await expect(
    summaryLogsValidator({
      uploadsRepository: mockUploadsRepository,
      summaryLogsRepository: mockSummaryLogsRepository,
      summaryLogsParser: mockSummaryLogsParser,
      organisationsRepository: mockOrganisationsRepository,
      summaryLogId
    })
  ).rejects.toThrow(
    `Registration not found: organisationId=${organisationId}, registrationId=${registrationId}`
  )

  expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
    summaryLogId,
    1,
    {
      status: 'invalid',
      failureReason: `Registration not found: organisationId=${organisationId}, registrationId=${registrationId}`
    }
  )
})

it('sets status to INVALID when registration has no wasteRegistrationNumber', async () => {
  const summaryLogId = 'test-summary-log-id'
  const organisationId = 'org-123'
  const registrationId = 'reg-456'

  const summaryLog = {
    file: {
      id: 'file-id',
      name: 'test.xlsx',
      s3: { bucket: 'test-bucket', key: 'test-key' }
    },
    organisationId,
    registrationId
  }

  const mockOrganisationsRepository = {
    findRegistrationById: vi.fn().mockResolvedValue({
      id: registrationId
      // wasteRegistrationNumber missing
    })
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
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
      },
      data: {}
    })
  }

  await expect(
    summaryLogsValidator({
      uploadsRepository: mockUploadsRepository,
      summaryLogsRepository: mockSummaryLogsRepository,
      summaryLogsParser: mockSummaryLogsParser,
      organisationsRepository: mockOrganisationsRepository,
      summaryLogId
    })
  ).rejects.toThrow(
    'Invalid summary log: registration has no waste registration number'
  )

  expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
    summaryLogId,
    1,
    {
      status: 'invalid',
      failureReason:
        'Invalid summary log: registration has no waste registration number'
    }
  )
})

it('sets status to INVALID when spreadsheet missing registration number', async () => {
  const summaryLogId = 'test-summary-log-id'
  const organisationId = 'org-123'
  const registrationId = 'reg-456'

  const summaryLog = {
    file: {
      id: 'file-id',
      name: 'test.xlsx',
      s3: { bucket: 'test-bucket', key: 'test-key' }
    },
    organisationId,
    registrationId
  }

  const mockOrganisationsRepository = {
    findRegistrationById: vi.fn().mockResolvedValue({
      id: registrationId,
      wasteRegistrationNumber: 'WRN12345'
    })
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
      meta: {},
      data: {}
    })
  }

  await expect(
    summaryLogsValidator({
      uploadsRepository: mockUploadsRepository,
      summaryLogsRepository: mockSummaryLogsRepository,
      summaryLogsParser: mockSummaryLogsParser,
      organisationsRepository: mockOrganisationsRepository,
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

it('sets status to INVALID when registration numbers mismatch', async () => {
  const summaryLogId = 'test-summary-log-id'
  const organisationId = 'org-123'
  const registrationId = 'reg-456'

  const summaryLog = {
    file: {
      id: 'file-id',
      name: 'test.xlsx',
      s3: { bucket: 'test-bucket', key: 'test-key' }
    },
    organisationId,
    registrationId
  }

  const mockOrganisationsRepository = {
    findRegistrationById: vi.fn().mockResolvedValue({
      id: registrationId,
      wasteRegistrationNumber: 'WRN12345'
    })
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
        WASTE_REGISTRATION_NUMBER: { value: 'WRN99999' }
      },
      data: {}
    })
  }

  await expect(
    summaryLogsValidator({
      uploadsRepository: mockUploadsRepository,
      summaryLogsRepository: mockSummaryLogsRepository,
      summaryLogsParser: mockSummaryLogsParser,
      organisationsRepository: mockOrganisationsRepository,
      summaryLogId
    })
  ).rejects.toThrow(
    'Registration number mismatch: spreadsheet contains WRN99999 but registration is WRN12345'
  )

  expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
    summaryLogId,
    1,
    {
      status: 'invalid',
      failureReason:
        'Registration number mismatch: spreadsheet contains WRN99999 but registration is WRN12345'
    }
  )
})

it('sets status to VALIDATED when registration numbers match', async () => {
  const summaryLogId = 'test-summary-log-id'
  const organisationId = 'org-123'
  const registrationId = 'reg-456'

  const summaryLog = {
    file: {
      id: 'file-id',
      name: 'test.xlsx',
      s3: { bucket: 'test-bucket', key: 'test-key' }
    },
    organisationId,
    registrationId
  }

  const mockOrganisationsRepository = {
    findRegistrationById: vi.fn().mockResolvedValue({
      id: registrationId,
      wasteRegistrationNumber: 'WRN12345'
    })
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
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
      },
      data: {}
    })
  }

  await summaryLogsValidator({
    uploadsRepository: mockUploadsRepository,
    summaryLogsRepository: mockSummaryLogsRepository,
    summaryLogsParser: mockSummaryLogsParser,
    organisationsRepository: mockOrganisationsRepository,
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

**Step 2: Run test to verify it fails**

Run: `npm test -- validator.test.js`
Expected: FAIL - validator doesn't accept organisationsRepository parameter yet

**Step 3: Update summaryLogsValidator function signature**

In `src/application/summary-logs/validator.js`, update the function signature and JSDoc (around line 118):

```javascript
/**
 * @param {Object} params
 * @param {UploadsRepository} params.uploadsRepository
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {SummaryLogsParser} params.summaryLogsParser
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} params.organisationsRepository
 * @param {string} params.summaryLogId
 * @returns {Promise<void>}
 */
export const summaryLogsValidator = async ({
  uploadsRepository,
  summaryLogsRepository,
  summaryLogsParser,
  organisationsRepository,
  summaryLogId
}) => {
```

**Step 4: Add validation calls to try block**

In `src/application/summary-logs/validator.js`, in the try block after `parseSummaryLog` (around line 164):

```javascript
const parsed = await parseSummaryLog({
  summaryLogsParser,
  summaryLogBuffer,
  msg
})

const registration = await fetchRegistration({
  organisationsRepository,
  organisationId: summaryLog.organisationId,
  registrationId: summaryLog.registrationId,
  msg
})

validateRegistrationNumber({
  parsed,
  registration,
  msg
})
```

**Step 5: Run test to verify it passes**

Run: `npm test -- validator.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add src/application/summary-logs/validator.js src/application/summary-logs/validator.test.js
git commit -m "feat(summary-logs): integrate registration validation into main flow"
```

---

## Task 8: Wire organisationsRepository to Inline Validator

**Files:**

- Modify: `src/adapters/validators/summary-logs/inline.js`
- Test: `src/adapters/validators/summary-logs/inline.test.js`

**Step 1: Write failing test**

Add to `src/adapters/validators/summary-logs/inline.test.js`:

```javascript
it('passes organisationsRepository to validator', async () => {
  const mockUploadsRepository = {}
  const mockSummaryLogsParser = {}
  const mockSummaryLogsRepository = {}
  const mockOrganisationsRepository = {}

  const validator = createInlineSummaryLogsValidator(
    mockUploadsRepository,
    mockSummaryLogsParser,
    mockSummaryLogsRepository,
    mockOrganisationsRepository
  )

  // Validator should be callable
  expect(validator.validate).toBeDefined()
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- inline.test.js`
Expected: FAIL - fourth parameter not accepted yet

**Step 3: Update createInlineSummaryLogsValidator signature**

In `src/adapters/validators/summary-logs/inline.js`, update the function (around line 13):

```javascript
export const createInlineSummaryLogsValidator = (
  uploadsRepository,
  summaryLogsParser,
  summaryLogsRepository,
  organisationsRepository
) => {
  return {
    validate: async (summaryLogId) => {
      summaryLogsValidator({
        uploadsRepository,
        summaryLogsRepository,
        summaryLogsParser,
        organisationsRepository,
        summaryLogId
      }).catch((error) => {
        logger.error({
          error,
          message: `Summary log validation worker failed: summaryLogId=${summaryLogId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
          }
        })
      })
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- inline.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/validators/summary-logs/inline.js src/adapters/validators/summary-logs/inline.test.js
git commit -m "feat(summary-logs): wire organisationsRepository to inline validator"
```

---

## Task 9: Wire organisationsRepository to Worker Thread Validator

**Files:**

- Modify: `src/workers/summary-logs/worker/worker-thread.js`

**Step 1: Find where inline validator is created**

In `src/workers/summary-logs/worker/worker-thread.js`, locate the validator creation (likely around line 30-40).

**Step 2: Add organisationsRepository parameter**

Update the validator creation to include organisationsRepository. The exact location depends on how the worker is wired, but it will look similar to:

```javascript
const validator = createInlineSummaryLogsValidator(
  uploadsRepository,
  summaryLogsParser,
  summaryLogsRepository,
  organisationsRepository // ADD THIS
)
```

**Step 3: Verify organisationsRepository is available**

Ensure the worker thread has access to organisationsRepository. It should be passed in during worker initialization or created in the worker setup.

**Step 4: Run worker integration tests**

Run: `npm test -- worker-thread.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/workers/summary-logs/worker/worker-thread.js
git commit -m "feat(summary-logs): wire organisationsRepository to worker thread validator"
```

---

## Task 10: Update Route Handler to Pass organisationsRepository

**Files:**

- Modify: `src/routes/v1/organisations/registrations/summary-logs/upload-completed/post.js` (or similar route files)

**Step 1: Locate route handler that triggers validation**

Search for where the summary logs validator is invoked in route handlers.

**Step 2: Ensure organisationsRepository is available**

Check if organisationsRepository is available in the request context or needs to be injected during server setup.

**Step 3: Update validator invocation**

Update any direct validator calls to include organisationsRepository parameter.

**Step 4: Run integration tests**

Run: `npm test -- integration.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/v1/organisations/registrations/summary-logs/**/*.js
git commit -m "feat(summary-logs): wire organisationsRepository to route handlers"
```

---

## Task 11: Run Full Test Suite and Verify Coverage

**Files:**

- All test files

**Step 1: Run complete test suite**

Run: `npm test`
Expected: All tests PASS with 100% coverage

**Step 2: Check for any missing coverage**

If coverage is below 100%, review the coverage report:

- Identify uncovered lines
- Add tests for uncovered scenarios
- Re-run tests

**Step 3: Run type checking**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit any additional tests**

```bash
git add .
git commit -m "test(summary-logs): achieve 100% coverage for registration validation"
```

---

## Task 12: Update Design Document and Commit

**Files:**

- Modify: `docs/plans/2025-10-23-summary-log-registration-validation-design.md`

**Step 1: Review design document for accuracy**

Ensure the design document matches the implementation:

- All function signatures correct
- All error messages match
- Data flow diagram accurate

**Step 2: Commit design document**

```bash
git add docs/plans/2025-10-23-summary-log-registration-validation-design.md
git commit -m "docs(summary-logs): add PAE-415 design document"
```

---

## Verification Checklist

Before considering this complete, verify:

- [ ] All tests pass: `npm test`
- [ ] 100% code coverage
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Contract tests pass for both adapters
- [ ] Integration tests cover all error scenarios
- [ ] Design document committed

---

## References

- **Design Document:** `docs/plans/2025-10-23-summary-log-registration-validation-design.md`
- **ADR 0017:** `docs/architecture/decisions/0017-decouple-spreadsheet-data-extraction-from-layout-using-markers.md`
- **Organisations Repository:** `src/repositories/organisations/`
- **Summary Logs Validator:** `src/application/summary-logs/validator.js`
- **Ticket:** [PAE-415](https://eaflood.atlassian.net/browse/PAE-415)
