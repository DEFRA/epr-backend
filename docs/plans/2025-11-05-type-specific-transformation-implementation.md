# Type-Specific Transformation Implementation Plan

Date: 2025-11-05

Related Design: [2025-11-05-type-specific-waste-record-transformation-design.md](./2025-11-05-type-specific-waste-record-transformation-design.md)

## Goal

Refactor `transform-from-summary-log.js` to support multiple processing types with type-specific table transformations, starting with RECEIVED_LOADS_FOR_REPROCESSING → RECEIVED mapping.

## Approach

Follow TDD with RED-GREEN-REFACTOR cycles throughout. Each step should maintain 100% test coverage.

## Implementation Steps

### 1. Refactor Main Transformation Function

Extract the generic table iteration logic from the current implementation into `transformTable`:

- Takes table data, row transformer function, context, and findExisting
- Maps headers to row data
- Calls row transformer for each row
- Handles create vs update logic
- Returns array of waste records

Update `transformFromSummaryLog` to dispatch based on processing type:

- Read processing type from parsedData.meta
- Look up table transformers for that type
- Iterate over tables, calling transformTable for each
- Handle unknown processing types with clear error
- Skip missing tables silently

### 2. Create Row Transformer

Create `src/application/waste-records/row-transformers/received-loads-reprocessing.js`:

- Export async function that receives rowData, rowIndex, context
- Validate required fields (ROW_ID, DATE_RECEIVED_FOR_REPROCESSING)
- Return shape: `{ wasteRecordType, rowId, data }`
- Throw descriptive errors for validation failures

### 3. Update Configuration

Create processing type dispatch map in `transform-from-summary-log.js`:

- Map REPROCESSOR_INPUT → RECEIVED_LOADS_FOR_REPROCESSING → transformer
- Map REPROCESSOR_OUTPUT → RECEIVED_LOADS_FOR_REPROCESSING → transformer (same transformer)
- Leave EXPORTER commented out with TODO

### 4. Migrate Existing Tests

Update `transform-from-summary-log.test.js`:

- Add processing type to parsed data fixture
- Keep existing test scenarios (create, update, accreditationId)
- Add test for unknown processing type
- Add test for missing table (should skip)
- Verify all existing behavior still works

### 5. Add Row Transformer Tests

Create `src/application/waste-records/row-transformers/received-loads-reprocessing.test.js`:

- Valid row produces correct output shape
- Missing ROW_ID throws error
- Missing DATE_RECEIVED_FOR_REPROCESSING throws error
- Error messages include row index

### 6. Verify and Clean Up

- Run full test suite
- Confirm 100% coverage maintained
- Check no unhandled edge cases
- Commit with clear message

## Extension Points for Future Work

Once business confirms mappings:

- Add row transformers for REPROCESSED_LOADS, SENT_ON_LOADS, RECEIVED_LOADS_FOR_EXPORT
- Update dispatch map to include new transformers
- Add tests for new transformers
- Consider whether missing tables should error or skip (currently skip)

## Success Criteria

- All 586 existing tests pass
- 100% coverage maintained
- Processing type REPROCESSOR_INPUT works with RECEIVED_LOADS_FOR_REPROCESSING
- Unknown processing types throw clear errors
- Code structure makes adding new types/tables trivial
