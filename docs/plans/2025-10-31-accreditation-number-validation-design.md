# PAE-442: Accreditation Number Validation Design

**Date:** 2025-10-31
**Story:** PAE-442
**Status:** Approved

## Context

Summary logs uploaded to the service must be validated against the registration and accreditation data stored in the system. Currently, we validate the waste registration number but not the accreditation number.

**Requirements:**

- If a registration has an accreditation → Summary log MUST provide matching accreditation number
- If a registration has NO accreditation → Summary log MUST NOT provide accreditation number (or it must be blank)

This covers acceptance criteria AC2, AC3, and AC4 from the story.

## Design Decisions

### 1. Repository Hydration

**Decision:** Modify `findRegistrationById` to hydrate the registration with linked accreditation data.

**Rationale:**

- Validators follow a consistent pattern of reading directly from the registration object
- No new repository methods needed
- Repository layer handles data access complexity
- Matches existing pattern used by `validateWasteRegistrationNumber`

**Implementation:**

```javascript
// Repository returns hydrated registration:
{
  id: "reg-123",
  wasteRegistrationNumber: "WRN-123",
  accreditationId: "acc-456",
  accreditation: {              // Populated if accreditationId exists
    id: "acc-456",
    accreditationNumber: 12345678,
    material: "glass",
    // ... other accreditation fields
  }
}
```

**Changes required:**

1. Update repository port typedef
2. Implement hydration in MongoDB repository
3. Implement hydration in in-memory repository
4. Add contract test: "returns registration with hydrated accreditation when accreditationId exists"
5. Add contract test: "returns registration without accreditation field when accreditationId is undefined"

### 2. Validation Logic

**Decision:** Create `validateAccreditationNumber` following the exact pattern of `validateWasteRegistrationNumber`.

**Validation rules:**

1. **Registration has accreditation:**
   - Spreadsheet MUST have `__EPR_META_ACCREDITATION_NUMBER`
   - Value MUST match `registration.accreditation.accreditationNumber`
   - Error if missing: "Invalid summary log: missing accreditation number"
   - Error if mismatch: "Summary log's accreditation number does not match this registration"

2. **Registration has NO accreditation:**
   - Spreadsheet MUST NOT have accreditation number (or must be blank/undefined)
   - Error if present: "Invalid summary log: accreditation number provided but registration has no accreditation"

**Add to validation pipeline:**

```javascript
// src/application/summary-logs/validate.js
const validators = [
  validateWasteRegistrationNumber,
  validateSummaryLogType,
  validateSummaryLogMaterialType,
  validateAccreditationNumber // NEW
]
```

### 3. Test Coverage

**Unit tests** (`validate-accreditation-number.test.js`):

- Registration has accreditation, spreadsheet matches → success
- Registration has NO accreditation, spreadsheet blank → success
- Registration has accreditation, spreadsheet missing → error
- Registration has accreditation, spreadsheet undefined → error
- Registration has accreditation, spreadsheet mismatch → error
- Registration has NO accreditation, spreadsheet populated → error

**Integration tests** (update `worker/integration.test.js`):

- Reprocessor with accreditation: matching number passes
- Reprocessor with accreditation: mismatched number fails
- Registration without accreditation: blank spreadsheet passes
- Registration without accreditation: populated spreadsheet fails

## Files to Change

### New Files

- `src/application/summary-logs/validations/validate-accreditation-number.js`
- `src/application/summary-logs/validations/validate-accreditation-number.test.js`

### Modified Files

- `src/repositories/organisations/port.js` - Update typedef for findRegistrationById
- `src/repositories/organisations/mongodb.js` - Implement accreditation hydration
- `src/repositories/organisations/inmemory.js` - Implement accreditation hydration
- `src/repositories/organisations/contract/find-registration-by-id.contract.js` - Add hydration tests
- `src/application/summary-logs/validate.js` - Add new validator to pipeline
- `src/workers/summary-logs/worker/integration.test.js` - Add accreditation scenarios

## Acceptance Criteria Mapping

| AC  | Implementation                                                            |
| --- | ------------------------------------------------------------------------- |
| AC1 | Already implemented - validation triggers on upload                       |
| AC2 | `validateAccreditationNumber` - both numbers match → success              |
| AC3 | `validateAccreditationNumber` - one matches, one doesn't → error          |
| AC4 | `validateAccreditationNumber` - one or both missing when expected → error |

## Non-Goals

- Validation of accreditation status (approved/rejected/suspended) - out of scope
- Validation of material/site matching between registration and accreditation - handled by linking logic
- Support for "registration only" templates - marked as fast follower in story
