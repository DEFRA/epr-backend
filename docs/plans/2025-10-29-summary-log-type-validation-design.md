# Summary Log Type Validation Design

**Date:** 2025-10-29
**Status:** Approved

## Problem Statement

When users upload summary logs, they must use the correct spreadsheet template for their organisation type. Reprocessors and exporters use different templates. Currently, the system does not validate that the uploaded template matches the organisation's registration type, allowing mismatched uploads that could cause data quality issues.

## Solution Overview

Implement validation to check that the summary log type specified in the spreadsheet metadata (`__EPR_META_SUMMARY_LOG_TYPE`) matches the registration's `wasteProcessingType` field from the epr-organisations database.

## Data Flow

1. Parser extracts `__EPR_META_SUMMARY_LOG_TYPE` from spreadsheet → strips prefix → stores as `parsed.meta.SUMMARY_LOG_TYPE.value`
2. Validator fetches registration from organisations repository → `registration.wasteProcessingType`
3. New validation function compares the two values using explicit mapping
4. On mismatch: throws descriptive error
5. Existing error handling in `validate()` catches the error and calls `handleValidationFailure`
6. Summary log updated with `status: 'invalid'` and `failureReason: <error message>`
7. GET endpoint returns the failure reason to the user

## Type Mapping

The spreadsheet uses uppercase values while the database uses lowercase. Explicit mapping handles this conversion:

```javascript
const SPREADSHEET_TYPE_TO_DB_TYPE = {
  REPROCESSOR: 'reprocessor',
  EXPORTER: 'exporter'
}

const VALID_SPREADSHEET_TYPES = Object.keys(SPREADSHEET_TYPE_TO_DB_TYPE)
```

## Validation Function

**File:** `/src/application/summary-logs/validator.js`

```javascript
export const validateSummaryLogType = ({ parsed, registration, msg }) => {
  const { wasteProcessingType } = registration
  const spreadsheetType = parsed?.meta?.SUMMARY_LOG_TYPE?.value

  // 1. Check spreadsheet has the metadata
  if (!spreadsheetType) {
    throw new Error('Invalid summary log: missing summary log type')
  }

  // 2. Validate spreadsheet value is recognized
  if (!VALID_SPREADSHEET_TYPES.includes(spreadsheetType)) {
    throw new Error('Invalid summary log: unrecognized summary log type')
  }

  // 3. Map and compare
  const expectedDbType = SPREADSHEET_TYPE_TO_DB_TYPE[spreadsheetType]
  if (expectedDbType !== wasteProcessingType) {
    throw new Error('Summary log type does not match registration type')
  }

  // Log success
  msg.info(
    { spreadsheetType, wasteProcessingType },
    'Summary log type validated'
  )
}
```

## Error Messages

All error messages are static (no dynamic values) to prevent information leakage:

- Missing metadata: "Invalid summary log: missing summary log type"
- Invalid value: "Invalid summary log: unrecognized summary log type"
- Type mismatch: "Summary log type does not match registration type"

Actual values are logged via `msg.info()` for debugging but not exposed to users.

## Integration Point

The validation is called in `performValidationChecks` immediately after `validateWasteRegistrationNumber`:

```javascript
async performValidationChecks({ summaryLog, msg }) {
  const { organisationId, registrationId } = summaryLog

  const registration = await this.organisationsRepository.findRegistrationById(
    organisationId,
    registrationId
  )

  const parsed = await this.summaryLogExtractor.extract({
    bucket: summaryLog.file.s3.bucket,
    key: summaryLog.file.s3.key
  })

  validateWasteRegistrationNumber({ parsed, registration, msg })
  validateSummaryLogType({ parsed, registration, msg }) // NEW

  return { parsed, registration }
}
```

## Testing Strategy

### Unit Tests

**File:** `/src/application/summary-logs/validator.test.js` (or add to existing validator tests)

Test `validateSummaryLogType` in isolation:

- Success: REPROCESSOR matches reprocessor
- Success: EXPORTER matches exporter
- Error: Missing SUMMARY_LOG_TYPE in parsed.meta
- Error: Unrecognized type value
- Error: Type mismatch (REPROCESSOR vs exporter)
- Error: Type mismatch (EXPORTER vs reprocessor)
- Error: Undefined/null values

### Integration Tests

**File:** `/src/workers/summary-logs/worker/integration.test.js`

Test full validation flow through the worker with mocked parser and repository:

- Valid: REPROCESSOR type matches reprocessor registration → status: validated
- Valid: EXPORTER type matches exporter registration → status: validated
- Invalid: REPROCESSOR type with exporter registration → status: invalid, failureReason set
- Invalid: EXPORTER type with reprocessor registration → status: invalid, failureReason set
- Invalid: Missing type in spreadsheet → status: invalid, failureReason set
- Invalid: Unrecognized type value → status: invalid, failureReason set

**Coverage target:** 100% (as per project standards)

## Edge Cases

- **Missing metadata:** Existing summary logs without `SUMMARY_LOG_TYPE` will fail validation with "missing summary log type" error. This is expected - old templates must be updated.
- **Case sensitivity:** Handled by explicit mapping (only uppercase values accepted from spreadsheet)
- **Null/undefined values:** Caught by missing metadata check
- **Unrecognized values:** Validated before comparison to ensure only known types proceed

## Impact Analysis

### No changes required to

- Parser (already extracts metadata with `__EPR_META_` prefix)
- Error handling (already handles validation failures)
- GET endpoint (already returns failureReason)
- Repository or schema (no new fields needed)
- Infrastructure

### Changes required

- Add validation function to `validator.js`
- Add mapping constants to `validator.js`
- Update `performValidationChecks` to call new validation
- Add unit tests
- Add integration tests

### Backwards compatibility

- Existing summary logs without `SUMMARY_LOG_TYPE` will fail validation
- This is expected behaviour - templates must include the new metadata tag

### Performance impact

Negligible - single string comparison after data already fetched for registration number validation.

## Implementation Checklist

- [x] Add type mapping constants to validator.js
- [x] Implement validateSummaryLogType function
- [x] Update performValidationChecks to call new validation
- [x] Add unit tests for validateSummaryLogType
- [x] Add integration tests for full validation flow
- [x] Verify 100% test coverage maintained
- [ ] Update spreadsheet templates to include \_\_EPR_META_SUMMARY_LOG_TYPE (if not already present)
