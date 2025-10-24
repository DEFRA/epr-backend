# Summary Log Registration Number Validation Design

**Ticket:** PAE-415
**Date:** 2025-10-23
**Status:** Approved (Revised)

## Problem Statement

When operators upload summary log spreadsheets via CDP Uploader, the upload URL contains a `registrationId` (internal identifier) that identifies which registration the data should apply to. The spreadsheet itself contains a `__EPR_META_WASTE_REGISTRATION_NUMBER` marker (as per ADR 0017) that contains the user-facing waste registration number.

**Critical distinction:**

- **Internal ID** (`registrationId`): Used in URL paths, database keys
- **User-facing number** (`wasteRegistrationNumber`): Displayed to users, entered in spreadsheets

We must validate that the spreadsheet's registration number matches the registration entity's `wasteRegistrationNumber` field, preventing:

- Operators uploading the wrong file for a registration
- Operators attempting to submit data to the wrong registration
- Data corruption from mismatched uploads

## Goals

1. Fetch the registration entity using the internal `registrationId` from the URL
2. Validate that the registration has a `wasteRegistrationNumber`
3. Validate that the spreadsheet's `__EPR_META_WASTE_REGISTRATION_NUMBER` matches the registration's `wasteRegistrationNumber`
4. Provide clear error messages to operators when validation fails
5. Leverage existing error handling infrastructure

## Non-Goals

- Validating the format of registration numbers (handled by Joi schema)
- Validating registration status or other registration properties
- Handling multiple registration number markers (parser already throws during parse)

## Design

### High-Level Flow

The validation flow in `src/application/summary-logs/validator.js` will change from:

**Current:**

```
fetch summary log → parse → update status to VALIDATED
```

**New:**

```
fetch summary log → parse → fetch registration → validate registration number → update status to VALIDATED
```

### Data Model

**Organisation Repository Schema** (from `src/repositories/organisations/schema.js`):

```javascript
{
  id: string,
  registrations: [
    {
      id: string,                        // Internal identifier
      wasteRegistrationNumber: string,   // User-facing number (optional)
      material: string,
      wasteProcessingType: string,
      // ... other fields
    }
  ]
}
```

**Summary Log Domain Model** (from `src/domain/summary-logs/model.js`):

```javascript
{
  organisationId: string,   // Organisation containing the registration
  registrationId: string,   // Internal registration identifier
  file: { ... },
  status: string,
  failureReason?: string
}
```

**Parser Output Structure** (from ADR 0017):

```javascript
{
  meta: {
    WASTE_REGISTRATION_NUMBER: {
      value: 'REG12345',  // User-facing registration number
      location: { sheet: 'Data', row: 1, column: 'B' }
    }
  },
  data: { ... }
}
```

### Repository Layer Changes

**New method added to OrganisationsRepository port:**

```javascript
/**
 * Finds a specific registration within an organisation
 *
 * @param {string} organisationId - The organisation ID
 * @param {string} registrationId - The registration ID
 * @returns {Promise<Object|null>} The registration object or null if not found
 */
findRegistrationById(organisationId, registrationId)
```

**In-memory adapter implementation:**

```javascript
findRegistrationById: async (organisationId, registrationId) => {
  const org = organisations.get(organisationId)
  if (!org) return null

  const registration = org.registrations?.find((r) => r.id === registrationId)
  return registration || null
}
```

**MongoDB adapter implementation:**

- Query organisation by `organisationId`
- Find registration in `registrations` array by `registrationId`
- Return `null` if organisation or registration not found

**Why this approach:**

- Clean interface for validator - doesn't need to know how registrations are stored
- Testable in isolation via contract tests
- Consistent with repository pattern used elsewhere in codebase

### Validator Helper Functions

**1. fetchRegistration() - New helper function**

```javascript
/**
 * Fetches a registration from the organisations repository
 *
 * @param {Object} params
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.msg - Logging context message
 * @returns {Promise<Object>} The registration object
 * @throws {Error} If registration not found
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

**2. validateRegistrationNumber() - Enhanced validation function**

```javascript
/**
 * Validates that the registration number in the spreadsheet matches the registration's waste registration number
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration entity from the database
 * @param {string} params.msg - Logging context message
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

### Integration into Main Validator

**Updated function signature:**

```javascript
export const summaryLogsValidator = async({
  uploadsRepository,
  summaryLogsRepository,
  summaryLogsParser,
  organisationsRepository, // NEW PARAMETER
  summaryLogId
})
```

**Updated try block:**

```javascript
try {
  const summaryLogBuffer = await fetchSummaryLog({
    uploadsRepository,
    summaryLog,
    msg
  })

  if (!summaryLogBuffer) {
    throw new Error('Something went wrong while retrieving your file upload')
  }

  const parsed = await parseSummaryLog({
    summaryLogsParser,
    summaryLogBuffer,
    msg
  })

  // NEW: Fetch registration
  const registration = await fetchRegistration({
    organisationsRepository,
    organisationId: summaryLog.organisationId,
    registrationId: summaryLog.registrationId,
    msg
  })

  // NEW: Validate registration number
  validateRegistrationNumber({
    parsed,
    registration,
    msg
  })

  await updateSummaryLog({
    summaryLogsRepository,
    id: summaryLogId,
    version,
    summaryLog,
    status: SUMMARY_LOG_STATUS.VALIDATED,
    msg
  })
} catch (error) {
  // Existing error handler catches all validation errors
  logger.error({ ... })
  await updateSummaryLog({
    status: SUMMARY_LOG_STATUS.INVALID,
    failureReason: error.message
  })
  throw error
}
```

### Error Handling

The existing error handling in `summaryLogsValidator()` (lines 178-199) catches all thrown errors and:

- Sets status to `INVALID`
- Stores `error.message` as `failureReason`
- Frontend displays `failureReason` to the user

No changes needed to the error handling infrastructure.

### Acceptance Criteria Mapping

| AC  | Scenario                      | Implementation                                                                                      |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| AC1 | Registration number matches   | Validation passes, processing continues                                                             |
| AC2 | Registration number mismatch  | `validateRegistrationNumber()` throws mismatch error, status set to `INVALID`                       |
| AC3 | Registration number missing   | `validateRegistrationNumber()` throws missing error, status set to `INVALID`                        |
| AC4 | Multiple registration markers | Parser throws during `parseSummaryLog()`, caught by existing error handler                          |
| N/A | Registration not found        | `fetchRegistration()` throws not found error, status set to `INVALID`                               |
| N/A | Registration has no number    | `validateRegistrationNumber()` throws "no waste registration number" error, status set to `INVALID` |

### Error Messages

**Registration not found:**

```
Registration not found: organisationId={orgId}, registrationId={regId}
```

**Registration has no wasteRegistrationNumber:**

```
Invalid summary log: registration has no waste registration number
```

**Missing registration number in spreadsheet:**

```
Invalid summary log: missing registration number
```

**Mismatched registration numbers:**

```
Registration number mismatch: spreadsheet contains {spreadsheetValue} but registration is {dbValue}
```

**Multiple registration markers:**

```
[Parser error message - handled during parse phase]
```

## Data Flow

```
1. HTTP Request → /v1/organisations/{orgId}/registrations/{regId}/summary-logs/{summaryLogId}/validate
                   ↓
2. summaryLogsValidator receives: summaryLogId
                   ↓
3. summaryLogsRepository.findById(summaryLogId)
   → Returns: { summaryLog: { organisationId, registrationId, file: { s3: {...} } } }
                   ↓
4. uploadsRepository.findByLocation(s3Bucket, s3Key)
   → Returns: Buffer (spreadsheet file)
                   ↓
5. summaryLogsParser.parse(buffer)
   → Returns: { meta: { WASTE_REGISTRATION_NUMBER: { value: 'REG12345' } }, data: {...} }
                   ↓
6. organisationsRepository.findRegistrationById(organisationId, registrationId)
   → Returns: { id, wasteRegistrationNumber: 'REG12345', ... }
                   ↓
7. validateRegistrationNumber(parsed, registration)
   → Compares: parsed.meta.WASTE_REGISTRATION_NUMBER.value === registration.wasteRegistrationNumber
   → Throws if mismatch or either is missing
                   ↓
8. summaryLogsRepository.update(summaryLogId, { status: 'validated' })
```

## Testing Strategy

### Unit Tests

**For `fetchRegistration()` helper:**

1. Returns registration when found
2. Throws error when organisation not found
3. Throws error when registration not found
4. Logs success when found

**For `validateRegistrationNumber()` helper:**

1. Throws when `registration.wasteRegistrationNumber` is undefined
2. Throws when `registration.wasteRegistrationNumber` is null
3. Throws when `parsed.meta.WASTE_REGISTRATION_NUMBER` is missing
4. Throws when `parsed.meta.WASTE_REGISTRATION_NUMBER.value` is undefined
5. Throws when registration numbers don't match
6. Succeeds when registration numbers match
7. Logs success when validation passes

**For `summaryLogsValidator()` integration:**

1. Sets status to `INVALID` with correct `failureReason` when registration not found
2. Sets status to `INVALID` when registration has no wasteRegistrationNumber
3. Sets status to `INVALID` when spreadsheet missing registration number
4. Sets status to `INVALID` when registration numbers mismatch
5. Sets status to `VALIDATED` when registration numbers match
6. Error is propagated after setting status

### Repository Contract Tests

Update `src/repositories/organisations/contract/` tests:

**For `findRegistrationById()`:**

1. Returns registration when both IDs are valid
2. Returns `null` when organisation doesn't exist
3. Returns `null` when registration doesn't exist in organisation
4. Both in-memory and MongoDB adapters behave identically

**Existing tests ensure:**

- Registration objects have correct structure (id, wasteRegistrationNumber, etc.)
- Joi validation enforces schema constraints

### Integration Tests

**Summary logs integration tests** (`src/routes/v1/organisations/registrations/summary-logs/integration.test.js`):

- Full end-to-end validation flow
- Error responses contain correct status codes and messages

## Deployment Considerations

### Backward Compatibility

**Existing summary logs without `__EPR_META_WASTE_REGISTRATION_NUMBER`:**

- Will fail validation with "missing registration number" error
- This is correct behavior - only new template versions with markers should pass

**Registrations without `wasteRegistrationNumber`:**

- Will fail validation with "registration has no waste registration number" error
- This is correct behavior - registrations must have a number before accepting summary logs

### Parser Dependency

This feature depends on the parser returning the structured format from ADR 0017. If the parser is not yet fully implemented, a placeholder can be used that returns the expected structure.

### Wiring Changes

The validator needs to be wired with the organisations repository wherever it's instantiated:

**Likely locations to update:**

- `src/adapters/validators/summary-logs/inline.js` - Direct validator instantiation
- `src/workers/summary-logs/worker/worker-thread.js` - Worker thread validator
- Any route handlers that instantiate the validator

**Pattern to follow:**

```javascript
summaryLogsValidator({
  uploadsRepository,
  summaryLogsRepository,
  summaryLogsParser,
  organisationsRepository, // NEW
  summaryLogId
})
```

### No Migration Needed

This is a new validation - no existing data needs to be updated.

## Alternatives Considered

### 1. Fetch Entire Organisation and Filter in Validator

**Approach:** Use `findById(organisationId)` and filter registrations array in validator.

**Rejected because:**

- Exposes internal structure (registrations array) to validator
- Validator needs to know how registrations are stored
- Less testable - harder to mock just the registration
- Violates encapsulation

### 2. Create Separate Registrations Repository

**Approach:** New repository dedicated to registrations with its own collection/storage.

**Rejected because:**

- Registrations are inherently part of organisations
- Would require significant data model changes
- Over-engineered for current needs
- Breaks existing organisation aggregate

### 3. Validation Service Layer

**Approach:** Create `src/application/registrations/service.js` to abstract registration fetching.

**Rejected because:**

- Adds unnecessary abstraction layer
- Single method service is overkill
- Doesn't match existing codebase patterns (which use helpers in validators)

### 4. Parser Validates During Parsing

**Approach:** Pass expected registration number to parser, validate during extraction.

**Rejected because:**

- Parser should be pure extraction, not business logic validation
- Parser doesn't have access to database
- Violates separation of concerns (ADR 0017 explicitly makes parser schema-free)

## Future Considerations

- **Additional metadata validations** (e.g., material type, processing type) could follow the same pattern
- **Location data from parser** could be included in error messages for more precise feedback (e.g., "Error in sheet 'Data', row 1, column B")
- **Batch validation** if multiple summary logs need validation simultaneously
- **Repository caching** if registration lookups become a performance bottleneck

## References

- **Ticket:** [PAE-415](https://eaflood.atlassian.net/browse/PAE-415)
- **ADR 0017:** [Decouple spreadsheet data extraction from layout using markers](../architecture/decisions/0017-decouple-spreadsheet-data-extraction-from-layout-using-markers.md)
- **Organisations Repository:** `src/repositories/organisations/`
- **Summary Logs Validator:** `src/application/summary-logs/validator.js`
- **Frontend Error Display:** `epr-frontend/main/src/server/summary-log-upload-progress/controller.js`
