# 19. Layered Transformation Strategy for Summary Log to Waste Records

Date: 2025-01-07

## Status

Accepted

## Context

The EPR system processes summary logs (Excel files) uploaded by operators containing waste data. These summary logs have significant variation:

- **Different processing types** (REPROCESSOR_INPUT, REPROCESSOR_OUTPUT, EXPORTER)
- **Different tables within each type** (RECEIVED_LOADS_FOR_REPROCESSING, REPROCESSED_LOADS, SENT_ON_LOADS, etc.)
- **Different data requirements per table** (different columns, validation rules, mappings)
- **Evolving requirements** - new processing types and tables will be added as the system expands

The system must transform this varied input into standardized waste records with version history, while being easily extensible as new requirements emerge.

### Key Challenge

How do we design a transformation pipeline that can be extended at multiple levels of granularity without requiring changes to core transformation logic?

Extension points needed:

- **Summary log level** - New processing types
- **Table level** - New table types within processing types
- **Row level** - Different row transformation logic per table
- **Field level** - Custom validation, mapping, and business rules per field

## Decision

Implement a **four-layer transformation architecture** with explicit extension points at each layer.

### Layer 1: Summary Log Level (Processing Type Dispatch)

**Entry point**: `transformFromSummaryLog(parsedData, context, existingRecords)`

**Purpose**: Route summary logs to appropriate table transformers based on `PROCESSING_TYPE` metadata

Note: The summary log's `SPREADSHEET_TYPE` is validated against the registration's `wasteProcessingType` upstream before transformation.

**Extension point**: Add entries to `PROCESSING_TYPES` dispatch map

```javascript
const PROCESSING_TYPES = {
  REPROCESSOR_INPUT: {
    RECEIVED_LOADS_FOR_REPROCESSING: transformReceivedLoadsRow,
    REPROCESSED_LOADS: transformReprocessedLoadsRow,
    SENT_ON_LOADS: transformSentOnLoadsRow
  },
  REPROCESSOR_OUTPUT: {
    RECEIVED_LOADS_FOR_REPROCESSING: transformReceivedLoadsRow,
    REPROCESSED_LOADS: transformReprocessedLoadsRow,
    SENT_ON_LOADS: transformSentOnLoadsForReprocessorOutputRow // Can differ even for same table name
  },
  EXPORTER: {
    RECEIVED_LOADS_FOR_EXPORT: transformReceivedLoadsForExportRow,
    SENT_ON_LOADS: transformSentOnLoadsForExporterRow // Different transformer for different context
  }
}
```

**Key point**: The architecture allows customization at any level. Even tables with identical names (like `SENT_ON_LOADS`) can have completely different transformers if the business logic differs between processing types. You can:

- Share transformers where logic is identical (e.g., both REPROCESSOR types using `transformReceivedLoadsRow`)
- Use different transformers for the same table name in different contexts (e.g., `SENT_ON_LOADS` having different logic for REPROCESSOR_OUTPUT vs EXPORTER)
- Mix and match as needed - no assumptions about reuse are baked into the architecture

### Layer 2: Table Level (Generic Table Transformation)

**Function**: `transformTable(tableData, rowTransformer, context, existingRecords)`

**Purpose**: Generic iteration over table rows, delegating row-specific logic to row transformers

**Responsibilities**:

- Iterate over rows in table
- Map row array values to object using headers
- Detect if row represents new or existing waste record (via existingRecords Map)
- Create version objects with proper status (CREATED vs UPDATED)
- Delegate row-specific transformation to row transformer

**Extension point**: This layer is stable - it provides the iteration framework. Extension happens by passing different `rowTransformer` functions.

```javascript
const transformTable = (
  tableData,
  rowTransformer,
  context,
  existingRecords
) => {
  const { headers, rows } = tableData

  return rows.map((row, rowIndex) => {
    // Map row to object
    const rowData = headers.reduce((acc, header, index) => {
      acc[header] = row[index]
      return acc
    }, {})

    // Delegate to row transformer
    const { wasteRecordType, rowId, data } = rowTransformer(rowData, rowIndex)

    // Check if record exists
    const existingRecord = existingRecords?.get(`${wasteRecordType}:${rowId}`)

    // Create new or append version to existing
    if (existingRecord) {
      return {
        ...existingRecord,
        data,
        versions: [...existingRecord.versions, newVersion]
      }
    }

    return {
      organisationId,
      registrationId,
      rowId,
      type,
      data,
      versions: [newVersion]
    }
  })
}
```

**Key insight**: This generic function handles the **mechanics** (iteration, version creation, update detection), while row transformers handle the **semantics** (what each row means).

### Layer 3: Row Level (Table-Specific Transformers)

**Example**: `transformReceivedLoadsRow(rowData, rowIndex)`

**Purpose**: Transform a single row from a specific table type into waste record metadata

**Responsibilities**:

- Validate required fields are present
- Determine waste record type
- Extract row identifier
- Transform/map row data to waste record data structure

**Extension point**: Create new row transformer functions for new table types

```javascript
export const transformReceivedLoadsRow = (rowData, rowIndex) => {
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

**To add a new table transformer**:

1. Create new file in `row-transformers/`
2. Export transformer function
3. Add to `PROCESSING_TYPES` dispatch map
4. No changes to `transformTable` or `transformFromSummaryLog` required

### Layer 4: Field Level (Within Row Transformers)

**Purpose**: Field-specific validation, mapping, and business rules

**Extension point**: Within each row transformer, add custom logic for:

- Field validation (required, format, range checks)
- Field mapping (rename, combine, split)
- Business rules (conditional logic, calculated fields)
- Data enrichment (lookups, defaults)

**Note on validation**: Current implementation throws on validation failure. Future iterations would likely return a result object to capture multiple validation failures per summary log, providing better feedback to operators.

**Example future scenarios**:

```javascript
// Scenario 1: Complex field validation
export const transformReprocessedLoadsRow = (rowData, rowIndex) => {
  // Field-level validation
  if (!rowData.LOAD_ID) throw new Error(`Missing LOAD_ID at row ${rowIndex}`)

  if (rowData.WEIGHT_TONNES < 0) {
    throw new Error(
      `Invalid WEIGHT_TONNES at row ${rowIndex}: must be positive`
    )
  }

  // Field mapping
  return {
    wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
    rowId: rowData.LOAD_ID,
    data: {
      loadId: rowData.LOAD_ID,
      weight: rowData.WEIGHT_TONNES,
      processedDate: rowData.DATE_PROCESSED
    }
  }
}

// Scenario 2: Conditional logic based on fields
export const transformSentOnLoadsRow = (rowData, rowIndex) => {
  const wasteType =
    rowData.IS_EXPORT === 'Yes'
      ? WASTE_RECORD_TYPE.EXPORTED
      : WASTE_RECORD_TYPE.SENT_ON

  return {
    wasteRecordType: wasteType,
    rowId: rowData.MOVEMENT_ID,
    data: rowData
  }
}
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ syncFromSummaryLog (Orchestrator)                           │
│ - Extract summary log                                        │
│ - Load existing records (upfront loading, prevent N+1)      │
│ - Call transformFromSummaryLog                               │
│ - Save waste records                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: transformFromSummaryLog (Processing Type Dispatch) │
│                                                              │
│  PROCESSING_TYPES[processingType][tableName]                │
│                                                              │
│  Extension: Add entry to PROCESSING_TYPES map               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: transformTable (Generic Table Iteration)           │
│                                                              │
│  - Iterate rows                                              │
│  - Map row to object using headers                           │
│  - Delegate to rowTransformer                                │
│  - Create/append versions                                    │
│                                                              │
│  Extension: Stable - pass different rowTransformer          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Row Transformers (Table-Specific Logic)            │
│                                                              │
│  transformReceivedLoadsRow(rowData, rowIndex)               │
│  transformReprocessedLoadsRow(rowData, rowIndex)            │
│  transformSentOnLoadsRow(rowData, rowIndex)                 │
│                                                              │
│  Extension: Create new transformer function                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Field Logic (Within Row Transformers)              │
│                                                              │
│  - Field validation                                          │
│  - Field mapping                                             │
│  - Business rules                                            │
│  - Data enrichment                                           │
│                                                              │
│  Extension: Add logic within transformer function           │
└─────────────────────────────────────────────────────────────┘
```

## Rationale

### Why Four Layers vs Fewer Layers?

**Rejected: Single monolithic transformation function**

```javascript
// ❌ Single function handling everything
function transformSummaryLog(parsedData) {
  if (processingType === 'REPROCESSOR_INPUT') {
    for (const table of tables) {
      if (table.name === 'RECEIVED_LOADS_FOR_REPROCESSING') {
        for (const row of table.rows) {
          // Validate fields
          // Map fields
          // Create waste record
        }
      } else if (table.name === 'REPROCESSED_LOADS') {
        // Different logic...
      }
    }
  } else if (processingType === 'EXPORTER') {
    // Different logic...
  }
}
```

**Problems**:

- Adding new processing type requires modifying the function
- Adding new table type requires modifying the function
- Cannot reuse transformation logic across different contexts
- Testing requires mocking entire summary log structure

**Rejected: Two layers (processing type + combined table/row logic)**

```javascript
// ❌ Combined table and row logic
const PROCESSING_TYPES = {
  REPROCESSOR_INPUT: transformReprocessorInputTables,
  EXPORTER: transformExporterTables
}

function transformReprocessorInputTables(tables) {
  // Hard-coded table iteration and row transformation mixed together
  const receivedLoads = tables.RECEIVED_LOADS_FOR_REPROCESSING
  for (const row of receivedLoads.rows) {
    // Validate, transform, create record...
  }
}
```

**Problems**:

- Cannot reuse table iteration logic (each transformer reimplements it)
- Cannot reuse row transformation logic across different processing types
- Testing requires full table structures

**Chosen: Four layers with clear separation**

**Benefits**:

✅ **Open/Closed Principle**: Add new types without modifying existing code
✅ **Reusability**: Same row transformer can work with multiple processing types (see `transformReceivedLoadsRow` used by both REPROCESSOR_INPUT and REPROCESSOR_OUTPUT)
✅ **Testability**: Test each layer independently with minimal fixtures
✅ **Clarity**: Each layer has single responsibility
✅ **Flexibility**: Can customize at any level of granularity

**Trade-offs**:

- More indirection (dispatch map → table transformer → row transformer)
- More files (one per row transformer)

**Why this is acceptable**: The extensibility benefits far outweigh the indirection cost. Adding a new table type takes minutes instead of requiring careful modification of core logic.

### Why Dispatch Map vs Conditional Logic?

**Dispatch map** (chosen):

```javascript
const transformer = PROCESSING_TYPES[processingType]?.[tableName]
if (transformer) {
  return transformer(rowData, rowIndex)
}
```

**Conditional logic** (rejected):

```javascript
if (processingType === 'REPROCESSOR_INPUT' && tableName === 'RECEIVED_LOADS') {
  return transformReceivedLoadsRow(rowData, rowIndex)
} else if (processingType === 'EXPORTER' && tableName === 'SENT_ON_LOADS') {
  return transformSentOnLoadsRow(rowData, rowIndex)
}
// ... dozens more conditions as system grows
```

**Decision**: Dispatch map is **data**, conditional logic is **code**.

Benefits of data-driven approach:

- Adding new type = adding entry to map (no code modification)
- Map can be inspected at runtime (enables debugging, validation, documentation generation)
- No risk of missing else-if branch
- No risk of incorrect condition order

### Why Upfront Loading of Existing Records?

This supports the transformation layers but isn't the core architectural decision.

**Decision**: Load all existing waste records for the registration upfront, convert to `Map<"type:rowId", WasteRecord>` for O(1) lookup during transformation.

**Rationale**: Prevents N+1 query problem when processing tables with hundreds/thousands of rows.

**Trade-off**: Loads records that might not be updated, but one bulk query is cheaper than hundreds of individual queries.

### Why Generic `transformTable` vs Specific Table Functions?

**Generic function** (chosen):

- Provides consistent framework for all table transformations
- Handles version creation/appending in one place
- Delegates semantics to row transformers

**Specific functions** (rejected):

- Each table type reimplements iteration, version logic
- Inconsistent error handling across tables
- Hard to change version structure globally

**Decision**: Keep **mechanics** (iteration, versioning) generic, make **semantics** (row meaning) specific.

## Consequences

### Positive

✅ **Extensible at multiple levels**: Can add new processing types, tables, or field logic without modifying existing code

✅ **Reusable transformers**: Same row transformer can be used across multiple processing types (e.g., `transformReceivedLoadsRow` used by both REPROCESSOR_INPUT and REPROCESSOR_OUTPUT)

✅ **Independent testing**: Each layer can be tested independently

- Layer 1: Test dispatch logic with mock table transformers
- Layer 2: Test table iteration with mock row transformers
- Layer 3: Test row transformers with simple row objects
- Layer 4: Test field logic in unit tests

✅ **Clear ownership**: Each table type has exactly one row transformer responsible for its transformation logic

✅ **Fail-fast**: Unknown processing types throw error immediately rather than silently failing

✅ **Self-documenting**: The `PROCESSING_TYPES` map serves as documentation of supported combinations

### Negative

⚠️ **Indirection**: Four layers means more call stack depth and more files to navigate

⚠️ **Discovery**: New developers must understand the dispatch map pattern to add new transformers

⚠️ **Debugging**: Stack traces span multiple layers

### Mitigations

- Clear naming conventions: `transformReceivedLoadsRow` explicitly names what it transforms
- Comments in `PROCESSING_TYPES` map document extension pattern
- Contract tests ensure consistent behavior across transformers
- JSDoc type annotations provide IDE navigation

### Future Considerations

**Adding new table types**:

1. Create row transformer in `row-transformers/<table-name>.js`
2. Export transformer function with signature `(rowData, rowIndex) => { wasteRecordType, rowId, data }`
3. Add to `PROCESSING_TYPES` map
4. Write unit tests for transformer

**Possible enhancements**:

1. **Table-level transformers**: If future requirements need pre/post-processing at table level (e.g., aggregate calculations), add optional `transformTableData` hook:

   ```javascript
   const PROCESSING_TYPES = {
     EXPORTER: {
       AGGREGATE_REPORT: {
         transformTableData: (tableData) => /* preprocess */,
         transformRow: transformAggregateRow
       }
     }
   }
   ```

2. **Validation layer**: If field validation becomes complex, extract to separate validation functions per table type:

   ```javascript
   const validateReceivedLoadsRow = (rowData, rowIndex) => {
     /* validate */
   }
   const transformReceivedLoadsRow = (rowData, rowIndex) => {
     validateReceivedLoadsRow(rowData, rowIndex)
     return { wasteRecordType, rowId, data }
   }
   ```

3. **Composition**: If row transformers share common logic, extract to composable functions:
   ```javascript
   const withDateValidation = (transformer) => (rowData, rowIndex) => {
     validateDates(rowData, rowIndex)
     return transformer(rowData, rowIndex)
   }
   ```

## Related Decisions

- [ADR 0017: Decouple spreadsheet data extraction from layout using markers](0017-decouple-spreadsheet-data-extraction-from-layout-using-markers.md) - Upstream extraction feeds this transformation pipeline
- [ADR 0015: Use Joi + MongoDB Native Driver](0015-joi-for-epr-organisations.md) - Repository pattern and validation approach (not detailed here as it's established practice)
- [ADR 0012: Forms data physical data model](0012-forms-physical-data-model.md) - Related approach to versioned document storage
