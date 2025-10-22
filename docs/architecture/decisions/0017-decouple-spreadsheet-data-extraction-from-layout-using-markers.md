# 17. Decouple spreadsheet data extraction from layout using markers

Date: 2025-10-22

## Status

Proposed

Extends [11. File parsing](0011-file-parsing.md)

## Context

As described in [ADR 0011](0011-file-parsing.md), users provide Summary Log files as Excel spreadsheets with multiple worksheets and data sections. The current approach to extracting data from these spreadsheets requires hardcoded knowledge of the exact cell positions and ranges for each data section.

This tight coupling between the parsing logic and spreadsheet layout creates several challenges:

- **Fragility**: Any changes to the template layout (e.g., adding rows, moving sections) require code changes
- **Maintenance burden**: Multiple versions of the template require version-specific parsing logic
- **Limited flexibility**: Cannot easily accommodate user customizations or layout variations
- **Testing complexity**: Each layout change requires new test fixtures and validation

The spreadsheet templates may evolve over time, and maintaining parsing logic that depends on absolute cell positions (e.g., "Section 1 starts at row 5, column B") makes the system brittle and difficult to maintain.

## Decision

We will **decouple data extraction from spreadsheet layout by using hidden marker cells** that identify metadata and data sections within the spreadsheet.

### Marker Convention

The spreadsheet templates will include hidden marker cells that follow these patterns:

- **Metadata markers**: Cells starting with `__EPR_META_` indicate metadata values
  - The value to extract is located in the cell to the right of the marker
  - Example: `__EPR_META_PROCESSING_TYPE` → extract adjacent cell value

- **Data section markers**: Cells starting with `__EPR_DATA_` indicate the start of tabular data sections
  - The cells to the right of the marker contain column headers (on the same row)
  - Subsequent rows below contain data until an empty row is encountered
  - Example: `__EPR_DATA_UPDATE_WASTE_BALANCE` → extract headers to the right and rows below

- **Skip column markers**: Cells containing `__EPR_SKIP_COLUMN` in the header row indicate columns to skip within a data section
  - The parser skips this column but continues reading headers to the right
  - This allows a single logical table to be visually broken into sections with blank columns between them
  - Example: `__EPR_DATA_SOMETHING | Header1 | Header2 | __EPR_SKIP_COLUMN | Header3 | Header4` → extract all four headers, skipping the marker column

The double underscore prefix (`__EPR_`) makes markers highly distinctive and unlikely to appear in legitimate user data, while avoiding potential conflicts with spreadsheet formula operators (e.g., Excel's `@` implicit intersection operator).

### Parsing Algorithm

```javascript
/**
 * Iterate over all worksheets, flattening markers into a single structure:
 * - Worksheet names are ignored - markers provide all necessary context
 * - Look for cells starting with "__EPR_META_":
 *   - Extract marker name from suffix (e.g., "__EPR_META_PROCESSING_TYPE" → "PROCESSING_TYPE")
 *   - Extract contents of cell to right of marker
 * - Look for cells starting with "__EPR_DATA_":
 *   - Extract section name from suffix (e.g., "__EPR_DATA_UPDATE_WASTE_BALANCE" → "UPDATE_WASTE_BALANCE")
 *   - Extract headers from cells to the right of marker (same row)
 *     - Skip columns containing "__EPR_SKIP_COLUMN" but continue reading headers beyond them
 *     - Stop reading headers when an empty cell is encountered
 *   - Extract data rows below marker until empty row encountered
 *     - For each row, skip columns corresponding to "__EPR_SKIP_COLUMN" positions in the header
 *
 * All markers across all worksheets are collected into a single flattened structure.
 */
```

### Example Spreadsheet Layout

The following table shows how markers would appear in a spreadsheet (markers would typically be in hidden columns). Note that tables can be arranged either stacked vertically or side-by-side:

| Column A                          | Column B        | Column C            | Column D                     | Column E           | Column F           |
| --------------------------------- | --------------- | ------------------- | ---------------------------- | ------------------ | ------------------ |
| `__EPR_META_PROCESSING_TYPE`      | REPROCESSOR     |                     |                              |                    |                    |
| `__EPR_META_TEMPLATE_VERSION`     | 1               |                     |                              |                    |                    |
| `__EPR_META_MATERIAL`             | Paper and board |                     |                              |                    |                    |
| `__EPR_META_ACCREDITATION`        | ER25199864      |                     |                              |                    |                    |
|                                   |                 |                     |                              |                    |                    |
| `__EPR_DATA_UPDATE_WASTE_BALANCE` | OUR_REFERENCE   | DATE_RECEIVED       | `__EPR_DATA_MONTHLY_REPORTS` | SUPPLIER_NAME      | ADDRESS_LINE_1     |
|                                   | 12345678910     | 2025-05-25          |                              | Joe Blogs Refinery | 15 Good Street     |
|                                   | 98765432100     | 2025-05-26          |                              | Acme Recycling     | 42 Industrial Park |
|                                   |                 |                     |                              |                    |                    |
| `__EPR_DATA_PROCESSED`            | OUR_REFERENCE   | DATE_LOAD_LEFT_SITE |                              |                    |                    |
|                                   | 12345678910     | 2025-05-25          |                              |                    |                    |

In this example:

- Metadata markers are stacked at the top
- `UPDATE_WASTE_BALANCE` and `MONTHLY_REPORTS` tables are side-by-side (columns A-C and D-F respectively)
- `PROCESSED` table is below in columns A-C

The parser doesn't care about the spatial arrangement - it simply finds markers and extracts the data associated with each one.

### Example with Skip Column Markers

When a single logical table is visually broken into sections with blank columns between them, use `__EPR_SKIP_COLUMN` markers:

| Column A                    | Column B      | Column C      | Column D            | Column E     | Column F       |
| --------------------------- | ------------- | ------------- | ------------------- | ------------ | -------------- |
| `__EPR_DATA_WASTE_RECEIVED` | OUR_REFERENCE | DATE_RECEIVED | `__EPR_SKIP_COLUMN` | SUPPLIER_REF | SUPPLIER_NAME  |
|                             | 12345678910   | 2025-05-25    |                     | ABC123       | Joe Blogs      |
|                             | 98765432100   | 2025-05-26    |                     | XYZ789       | Acme Recycling |

This extracts as a single table with four columns (skipping column D):

```javascript
{
  data: {
    WASTE_RECEIVED: {
      location: { sheet: 'Data', row: 1, column: 'B' },
      headers: ['OUR_REFERENCE', 'DATE_RECEIVED', 'SUPPLIER_REF', 'SUPPLIER_NAME'],
      rows: [
        [12345678910, '2025-05-25', 'ABC123', 'Joe Blogs'],
        [98765432100, '2025-05-26', 'XYZ789', 'Acme Recycling']
      ]
    }
  }
}
```

The `__EPR_SKIP_COLUMN` markers allow visual separation (e.g., grouping related columns together) without breaking the logical table structure.

### Output Structure

The parser will return a structured JSON object with source location for validation error reporting:

```javascript
{
  meta: {
    PROCESSING_TYPE: {
      value: 'REPROCESSOR',
      location: { sheet: 'Received', row: 1, column: 'B' }
    },
    TEMPLATE_VERSION: {
      value: '1',
      location: { sheet: 'Received', row: 2, column: 'B' }
    },
    MATERIAL: {
      value: 'Paper and board',
      location: { sheet: 'Received', row: 3, column: 'B' }
    },
    ACCREDITATION: {
      value: 'ER25199864',
      location: { sheet: 'Received', row: 4, column: 'B' }
    }
  },
  data: {
    UPDATE_WASTE_BALANCE: {
      location: { sheet: 'Received', row: 6, column: 'B' },  // First header cell
      headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
      rows: [
        [12345678910, '2025-05-25'],
        [98765432100, '2025-05-26']
      ]
    },
    MONTHLY_REPORTS: {
      location: { sheet: 'Received', row: 6, column: 'E' },  // First header cell
      headers: ['SUPPLIER_NAME', 'ADDRESS_LINE_1'],
      rows: [
        ['Joe Blogs Refinery', '15 Good Street'],
        ['Acme Recycling', '42 Industrial Park']
      ]
    },
    PROCESSED: {
      location: { sheet: 'Processed', row: 10, column: 'B' },  // First header cell
      headers: ['OUR_REFERENCE', 'DATE_LOAD_LEFT_SITE'],
      rows: [[12345678910, '2025-05-25']]
    }
  }
}
```

**Location Storage Strategy:**

- **Metadata**: Store the location of the value cell (to the right of the marker)
- **Data sections**: Store the location of the first header cell (to the right of the marker)

**Deriving Specific Cell Locations:**

For validation error reporting, specific cell locations can be calculated from the stored location:

```javascript
// For headers in a data section:
// location.row (same row), location.column + columnIndex

// For data cells in a data section:
// location.row + 1 + rowIndex, location.column + columnIndex

// Example: To find the cell at row index 1, column index 1 in UPDATE_WASTE_BALANCE:
// Sheet: 'Received'
// Row: 6 + 1 + 1 = 8
// Column: B + 1 = C
// Result: "Invalid date in sheet 'Received', row 8, column C"
```

### Implementation Notes

- Markers will be hidden in the spreadsheet (hidden rows/columns or white text on white background)
- The parsing logic will scan all worksheets for markers rather than assuming specific sheet names or positions
- **Worksheet names are ignored**: All markers are flattened into a single structure regardless of which worksheet they appear on
  - Data can be organized across multiple worksheets for user convenience without affecting parsing
  - Worksheet names do not provide semantic context - the marker names themselves contain all necessary information
- The parser will extract **any** markers it finds, without pre-validating against a known set
  - This allows templates to evolve with new columns, sections, or metadata without requiring parser updates
  - Downstream validation and processing logic will handle unexpected or unknown data sections

## Consequences

### Benefits

- **Layout independence**: Spreadsheet sections can be moved, reordered, or have rows/columns added without requiring code changes
- **Schema-free extraction**: The parser discovers and extracts whatever markers exist, without needing to know the expected schema in advance
  - New columns can be added to data sections without parser updates
  - New metadata fields can be introduced without code changes
  - Template evolution doesn't require coordinated parser releases
- **Version tolerance**: Multiple template versions can be supported by the same parsing logic, as long as they use the same marker conventions
- **Maintainability**: Parsing logic focuses on marker patterns and extraction rules rather than hardcoded cell positions
- **Flexibility**: Users can customize non-data areas of the spreadsheet without breaking the parser
  - Tables can be arranged vertically (stacked) or horizontally (side-by-side) as needed
  - Single logical tables can be visually broken into sections using `__EPR_SKIP_COLUMN` markers for improved readability
  - Data can be organized across multiple worksheets for user convenience
  - Worksheet names can be changed without affecting parsing (markers provide all context)
  - Layout can be optimized for user experience without impacting parsing logic
- **Self-documenting**: The marker names (e.g., `__EPR_DATA_UPDATE_WASTE_BALANCE`) make it clear what data is being extracted from each section
- **Collision resistance**: The `__EPR_` prefix makes it highly unlikely that markers will accidentally match user-supplied data, while avoiding conflicts with spreadsheet formula operators
- **Testability**: Tests can focus on marker detection and extraction logic rather than specific cell coordinates

### Trade-offs

- **Template dependency**: Spreadsheet templates must include the marker cells, creating a requirement for template authors
- **Migration effort**: Existing templates without markers will need to be updated
- **User visibility**: Hidden markers must remain hidden to avoid confusing users (requires careful template design)
- **Parser complexity**: The parser must scan all cells to find markers, rather than jumping directly to known positions
  - Mitigation: Performance impact is negligible for typical spreadsheet sizes (< 10k cells)
- **Validation moved downstream**: Since the parser accepts any markers it finds, validation of expected fields and data structure must happen after parsing
  - The parser becomes a pure extraction layer, with business logic validation occurring in subsequent processing steps
  - This separation of concerns is generally beneficial but requires clear boundaries between extraction and validation

### Risks

- **Low Risk**: Users accidentally delete hidden marker cells
  - Mitigation: Protect marker cells or use hidden rows/columns that are less likely to be modified
  - Mitigation: Validation will fail with clear error messages if expected markers are missing

- **Low Risk**: Marker naming conflicts if templates evolve
  - Mitigation: Establish clear naming conventions and version markers (e.g., `__EPR_META_TEMPLATE_VERSION`)

- **Low Risk**: Performance degradation with very large spreadsheets
  - Mitigation: Implement early termination when all expected markers are found
  - Mitigation: Cache marker positions after first scan if multiple passes are needed
