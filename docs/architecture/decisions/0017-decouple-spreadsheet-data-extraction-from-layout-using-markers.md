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

- **Metadata markers**: Cells matching regex `@@EPR_META:(.+)@@` indicate metadata values
  - The value to extract is located in the cell to the right of the marker
  - Example: `@@EPR_META:PROCESSING_TYPE@@` → extract adjacent cell value

- **Data section markers**: Cells matching regex `@@EPR_DATA:(.+)@@` indicate the start of tabular data sections
  - The cells to the right of the marker contain column headers (on the same row)
  - Subsequent rows below contain data until an empty row is encountered
  - Example: `@@EPR_DATA:WASTE_BALANCE@@` → extract headers to the right and rows below

The `@@EPR_` prefix makes markers highly distinctive and unlikely to appear in legitimate user data.

### Parsing Algorithm

```javascript
/**
 * Iterate over all worksheets:
 * - Look for cells matching regex "@@EPR_META:(.+)@@":
 *   - Extract marker name from capture group
 *   - Extract contents of cell to right of marker
 * - Look for cells matching regex "@@EPR_DATA:(.+)@@":
 *   - Extract section name from capture group
 *   - Extract headers from cells to the right of marker (same row)
 *   - Extract data rows below marker until empty row encountered
 */
```

### Example Spreadsheet Layout

The following table shows how markers would appear in a spreadsheet (markers would typically be in hidden columns). Note that tables can be arranged either stacked vertically or side-by-side:

| Column A                        | Column B        | Column C            | Column D                       | Column E           | Column F           |
| ------------------------------- | --------------- | ------------------- | ------------------------------ | ------------------ | ------------------ |
| `@@EPR_META:PROCESSING_TYPE@@`  | REPROCESSOR     |                     |                                |                    |                    |
| `@@EPR_META:TEMPLATE_VERSION@@` | 1               |                     |                                |                    |                    |
| `@@EPR_META:MATERIAL@@`         | Paper and board |                     |                                |                    |                    |
| `@@EPR_META:ACCREDITATION@@`    | ER25199864      |                     |                                |                    |                    |
|                                 |                 |                     |                                |                    |                    |
| `@@EPR_DATA:WASTE_BALANCE@@`    | OUR_REFERENCE   | DATE_RECEIVED       | `@@EPR_DATA:MONTHLY_REPORTS@@` | SUPPLIER_NAME      | ADDRESS_LINE_1     |
|                                 | 12345678910     | 2025-05-25          |                                | Joe Blogs Refinery | 15 Good Street     |
|                                 | 98765432100     | 2025-05-26          |                                | Acme Recycling     | 42 Industrial Park |
|                                 |                 |                     |                                |                    |                    |
| `@@EPR_DATA:PROCESSED@@`        | OUR_REFERENCE   | DATE_LOAD_LEFT_SITE |                                |                    |                    |
|                                 | 12345678910     | 2025-05-25          |                                |                    |                    |

In this example:

- Metadata markers are stacked at the top
- `WASTE_BALANCE` and `MONTHLY_REPORTS` tables are side-by-side (columns A-C and D-F respectively)
- `PROCESSED` table is below in columns A-C

The parser doesn't care about the spatial arrangement - it simply finds markers and extracts the data associated with each one.

### Output Structure

The parser will return a structured JSON object:

```javascript
{
  meta: {
    PROCESSING_TYPE: 'REPROCESSOR',
    TEMPLATE_VERSION: '1',
    MATERIAL: 'Paper and board',
    ACCREDITATION: 'ER25199864'
  },
  data: {
    WASTE_BALANCE: {
      headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
      rows: [
        [12345678910, '2025-05-25'],
        [98765432100, '2025-05-26']
      ]
    },
    MONTHLY_REPORTS: {
      headers: ['SUPPLIER_NAME', 'ADDRESS_LINE_1'],
      rows: [
        ['Joe Blogs Refinery', '15 Good Street'],
        ['Acme Recycling', '42 Industrial Park']
      ]
    },
    PROCESSED: {
      headers: ['OUR_REFERENCE', 'DATE_LOAD_LEFT_SITE'],
      rows: [[12345678910, '2025-05-25']]
    }
  }
}
```

### Implementation Notes

- Markers will be hidden in the spreadsheet (hidden rows/columns or white text on white background)
- The parsing logic will scan all worksheets for markers rather than assuming specific sheet names or positions
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
  - Layout can be optimized for user experience without impacting parsing logic
- **Self-documenting**: The marker names (e.g., `@@EPR_DATA:WASTE_BALANCE@@`) make it clear what data is being extracted from each section
- **Collision resistance**: The `@@EPR_` prefix and surrounding `@@` delimiters make it highly unlikely that markers will accidentally match user-supplied data
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
  - Mitigation: Establish clear naming conventions and version markers (e.g., `@@EPR_META:TEMPLATE_VERSION@@`)

- **Low Risk**: Performance degradation with very large spreadsheets
  - Mitigation: Implement early termination when all expected markers are found
  - Mitigation: Cache marker positions after first scan if multiple passes are needed
