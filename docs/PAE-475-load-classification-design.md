# PAE-475: Load Classification Design

> **Status:** Draft
> **Temporary document** - to be removed or moved to ADR after implementation

## Problem

When a summary log becomes validated, we need to present an overview of its contents to the user before they submit. This includes counts of how many loads (rows) meet various criteria.

## Terminology

| Technical Term      | UI Term       |
| ------------------- | ------------- |
| row                 | load          |
| changed             | adjusted      |
| complete/incomplete | valid/invalid |

## Classification Model

Loads are classified along two dimensions:

### 1. Change Status (new / unchanged / adjusted)

- **new** - load not present in any previous submission
- **unchanged** - load exists in previous submission, data has not changed
- **adjusted** - load exists in previous submission, data has changed

### 2. Validity Status (valid / invalid)

- **valid** - load passes all validation rules
- **invalid** - load has validation errors

## Data Structure

```javascript
loadCounts: {
  new: { valid: number, invalid: number },
  unchanged: { valid: number, invalid: number },
  adjusted: { valid: number, invalid: number }
}
```

### Derived Totals

The frontend can compute:

- Total new loads: `new.valid + new.invalid`
- Total unchanged loads: `unchanged.valid + unchanged.invalid`
- Total adjusted loads: `adjusted.valid + adjusted.invalid`
- Total valid loads: `new.valid + unchanged.valid + adjusted.valid`
- Total invalid loads: `new.invalid + unchanged.invalid + adjusted.invalid`
- Grand total: sum of all six values

## Future Considerations

If needed, `adjusted.invalid` could be split to distinguish:

- `invalidWasValid` - load was valid before, now invalid (regression)
- `invalidWasInvalid` - load was invalid before, still invalid

This would help users understand if they've broken something that was working vs still working on something that was already broken.

## Implementation Points

### Files to Modify

| Purpose         | File                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| Domain model    | `src/domain/summary-logs/load-classification.js` (new)                      |
| Counting logic  | `src/application/summary-logs/validate.js`                                  |
| Storage schema  | `src/repositories/summary-logs/schema.js`                                   |
| GET response    | `src/routes/v1/organisations/registrations/summary-logs/get.js`             |
| Response schema | `src/routes/v1/organisations/registrations/summary-logs/response.schema.js` |

### Classification Logic

```
For each load in current summary log:
  1. Is this load ID in previous submissions?
     - No → classify as NEW
     - Yes → compare data
       - Data unchanged → classify as UNCHANGED
       - Data changed → classify as ADJUSTED

  2. Does this load have validation errors?
     - No → VALID
     - Yes → INVALID

  3. Increment appropriate counter
```

### Existing Code to Leverage

- `src/application/waste-records/transform-from-summary-log.js` - already compares rows to detect changes
- `src/application/summary-logs/validations/row-continuity.js` - already fetches existing waste records
- `src/domain/waste-records/model.js` - has `VERSION_STATUS.CREATED` and `VERSION_STATUS.UPDATED`
