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

Route summary logs to appropriate table transformers based on `PROCESSING_TYPE` metadata via a dispatch map.

A **dispatch map** is a nested object that maps keys (processing types and table names) to functions. Instead of using conditional logic (if/else or switch statements), we look up the appropriate function in the map: `PROCESSING_TYPES[processingType][tableName]`. This makes the routing logic data rather than code, enabling extension by adding map entries rather than modifying logic.

Note: The summary log's `SPREADSHEET_TYPE` is validated against the registration's `wasteProcessingType` upstream before transformation.

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

**Extension**: Add entries to the dispatch map. Tables with identical names can have different transformers if business logic differs between processing types.

### Layer 2: Table Level (Generic Table Iteration)

Generic `transformTable()` function handles mechanics (iteration, version creation, update detection) and delegates row-specific logic to row transformers.

- Iterates over rows in table
- Maps row array values to object using headers
- Detects if row represents new or existing waste record
- Delegates transformation to row transformer
- Creates version objects with proper status (CREATED vs UPDATED)

**Extension**: Stable layer - pass different `rowTransformer` functions.

### Layer 3: Row Level (Table-Specific Transformers)

Transform a single row from a specific table type into waste record metadata.

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

**Extension**: Create new row transformer function and add to `PROCESSING_TYPES` map. No changes to `transformTable` or `transformFromSummaryLog` required.

### Layer 4: Field Level (Within Row Transformers)

Field-specific validation, mapping, and business rules within each row transformer:

- Field validation (required, format, range checks)
- Field mapping (rename, combine, split)
- Business rules (conditional logic, calculated fields)
- Data enrichment (lookups, defaults)

Note: Current implementation throws on validation failure. Future iterations would likely return a result object to capture multiple validation failures per summary log.

**Extension**: Add custom logic within transformer functions.

## Rationale

**Dispatch map is data, not code**: Adding new processing types or table transformers requires adding entries to the dispatch map, not modifying core transformation logic. This follows the Open/Closed Principle.

**Separation of mechanics and semantics**: Generic `transformTable` handles iteration and versioning (mechanics), while row transformers handle table-specific business logic (semantics). This enables reuse and clear separation of concerns.

**Customization at any level**: The four-layer architecture provides extension points at the exact granularity needed - processing type, table, row, or field.

**Upfront loading prevents N+1**: All existing waste records for a registration are loaded upfront and converted to a `Map<"type:rowId", WasteRecord>` for O(1) lookup during transformation. This prevents hundreds of individual database queries when processing large summary logs.

## Consequences

### Positive

✅ **Extensible at multiple levels**: Add new processing types, tables, or field logic without modifying existing code

✅ **Reusable transformers**: Same row transformer can be used across multiple processing types

✅ **Independent testing**: Each layer can be tested independently with minimal fixtures

✅ **Self-documenting**: The `PROCESSING_TYPES` map serves as documentation of supported combinations

### Negative

⚠️ **Indirection**: Four layers means more call stack depth and more files to navigate

⚠️ **Discovery**: New developers must understand the dispatch map pattern

### Future Considerations

**Adding new table types**:

1. Create row transformer in `row-transformers/<table-name>.js`
2. Export transformer function with signature `(rowData, rowIndex) => { wasteRecordType, rowId, data }`
3. Add to `PROCESSING_TYPES` map
4. Write unit tests

**Possible enhancements**:

- Table-level transformers for pre/post-processing (e.g., aggregate calculations)
- Separate validation layer if field validation becomes complex
- Composable functions if row transformers share common logic

## Related Decisions

- [ADR 0017: Decouple spreadsheet data extraction from layout using markers](0017-decouple-spreadsheet-data-extraction-from-layout-using-markers.md) - Upstream extraction feeds this transformation pipeline
- [ADR 0015: Use Joi + MongoDB Native Driver](0015-joi-for-epr-organisations.md) - Repository pattern and validation approach (not detailed here as it's established practice)
- [ADR 0012: Forms data physical data model](0012-forms-physical-data-model.md) - Related approach to versioned document storage
