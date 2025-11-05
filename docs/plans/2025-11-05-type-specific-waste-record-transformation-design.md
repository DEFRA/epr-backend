# Type-Specific Waste Record Transformation

Date: 2025-11-05

## Context

Different summary log processing types (REPROCESSOR_INPUT, REPROCESSOR_OUTPUT, EXPORTER) contain different data tables with different fields. The current transformation logic assumes a single hardcoded table structure (RECEIVED_LOADS). We need a flexible system that:

- Handles multiple processing types
- Transforms type-specific tables
- Validates type-specific business rules
- Allows easy extension as business confirms table mappings

## Design

### Architecture

We use a two-level dispatch map: processing type → table name → row transformer function. Each row transformer validates and shapes data for its specific table. A generic `transformTable` function handles the common pattern of iterating rows, checking for existing records, and creating or updating waste records.

### Structure

```
PROCESSING_TYPES = {
  REPROCESSOR_INPUT: {
    RECEIVED_LOADS_FOR_REPROCESSING: transformReceivedLoadsRow
  },
  REPROCESSOR_OUTPUT: {
    RECEIVED_LOADS_FOR_REPROCESSING: transformReceivedLoadsRow
  },
  EXPORTER: {
    RECEIVED_LOADS_FOR_EXPORT: transformReceivedLoadsExportRow
  }
}
```

### Flow

1. `transformFromSummaryLog` reads `parsedData.meta.PROCESSING_TYPE.value`
2. Looks up table transformers for that processing type
3. For each table in the map:
   - Checks if table exists in `parsedData.data`
   - Calls `transformTable(tableData, rowTransformer, context, findExisting)`
4. `transformTable`:
   - Maps each row to object using headers
   - Calls row transformer → gets `{ wasteRecordType, rowId, data }`
   - Checks for existing record
   - Creates new or appends version
5. Returns flattened array of waste records

### Row Transformers

Each row transformer function:

- Receives row data mapped to object by headers
- Validates required fields (missing headers caught naturally)
- Returns `{ wasteRecordType, rowId, data }`

Example:

```javascript
const transformReceivedLoadsRow = async (rowData, rowIndex, context) => {
  if (!rowData.ROW_ID) {
    throw new Error(`Missing ROW_ID at row ${rowIndex}`)
  }
  if (!rowData.DATE_RECEIVED_FOR_REPROCESSING) {
    throw new Error(`Missing DATE_RECEIVED_FOR_REPROCESSING at row ${rowIndex}`)
  }

  return {
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    rowId: rowData.ROW_ID,
    data: rowData
  }
}
```

### File Organization

```
src/application/waste-records/
├── transform-from-summary-log.js       # Main dispatcher + transformTable
├── row-transformers/
│   ├── received-loads-reprocessing.js  # transformReceivedLoadsRow
│   └── received-loads-export.js        # transformReceivedLoadsExportRow
├── transform-from-summary-log.test.js
└── row-transformers/
    └── received-loads-reprocessing.test.js
```

### Validation

Three levels:

1. **Processing type** - Throw error for unknown types
2. **Table** - Skip missing tables silently (allows optional tables)
3. **Row** - Throw error for invalid data with descriptive messages

Row validation catches both missing headers and empty values naturally by checking the mapped object properties.

### Error Handling

Errors throw with descriptive messages including context:

```
Missing ROW_ID at row 5
Unknown PROCESSING_TYPE: INVALID_TYPE
Missing DATE_RECEIVED_FOR_REPROCESSING at row 12
```

Errors bubble up through `syncFromSummaryLog` to become validation failure responses.

### Initial Implementation

We implement only confirmed mappings:

- `RECEIVED_LOADS_FOR_REPROCESSING` → `WASTE_RECORD_TYPE.RECEIVED` (confirmed safe)
- Other mappings await business confirmation

The design makes adding new transformers trivial: write row transformer function, add to map.

### Testing

Three levels:

1. **Row transformer unit tests** - Validation and output shape
2. **transformTable unit tests** - Generic table transformation logic
3. **Integration tests** - Complete transformation with multiple tables

Existing tests migrate to use `REPROCESSOR_INPUT` processing type and continue testing the same transformation logic.

## Benefits

- **Separation of concerns** - Generic iteration logic separate from type-specific validation
- **Reusability** - Same row transformer used across processing types (e.g., RECEIVED_LOADS_FOR_REPROCESSING in both INPUT and OUTPUT)
- **Extensibility** - Adding new tables requires only writing row transformer and updating map
- **Maintainability** - Required fields live next to validation logic
- **Testability** - Row transformers are pure functions, easy to test in isolation

## Trade-offs

- **Missing table handling** - Currently skip silently; need business confirmation on correct behavior
- **Table name mapping** - Most mappings await business confirmation; only RECEIVED_LOADS_FOR_REPROCESSING → RECEIVED confirmed
- **Unknown processing type** - Currently throw error; may need different handling if new types added frequently
