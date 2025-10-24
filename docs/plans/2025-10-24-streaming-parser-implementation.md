# Streaming Parser Implementation for ADR-17

**Date:** 2025-10-24
**Ticket:** PAE-415
**ADR:** [ADR-17 - Decouple spreadsheet data extraction from layout using markers](../architecture/decisions/0017-decouple-spreadsheet-data-extraction-from-layout-using-markers.md)

## Overview

Implement marker-based parsing in `ExcelJSSummaryLogsParser` using a streaming state machine approach. The parser will scan Excel files cell-by-cell, detecting markers (`__EPR_META_*` and `__EPR_DATA_*`) and extracting associated data without requiring knowledge of specific cell positions.

## Design Principles

- **Streaming**: Process cells in order, never look ahead or jump around
- **Immutability**: Build result structures without mutation
- **Simplicity**: State machine with minimal states and clear transitions
- **Separation of concerns**: Parser extracts, validation happens downstream

## State Machine Design

### States

1. **`IDLE`** - Scanning for markers
2. **`CAPTURING_METADATA`** - Next cell contains metadata value
   - Context: `{ metadataName, location }`
3. **`CAPTURING_HEADERS`** - Collecting column headers
   - Context: `{ sectionName, headers: [], location }`
4. **`CAPTURING_ROWS`** - Collecting data rows
   - Context: `{ sectionName, headers: [...], rows: [], currentRow: [] }`

### State Transitions

```
IDLE + cell starts with '__EPR_META_X'
  → CAPTURING_METADATA { metadataName: 'X', location }

CAPTURING_METADATA + any cell value
  → Emit metadata { name, value, location }
  → IDLE

IDLE + cell starts with '__EPR_DATA_X'
  → CAPTURING_HEADERS { sectionName: 'X', headers: [], location }

CAPTURING_HEADERS + non-empty cell
  → Add to headers (null if '__EPR_SKIP_COLUMN')
  → Stay in CAPTURING_HEADERS

CAPTURING_HEADERS + empty cell
  → CAPTURING_ROWS { sectionName, headers, rows: [], currentRow: [] }

CAPTURING_ROWS + end of row
  → If currentRow all empty: emit data section, → IDLE
  → Else: push currentRow to rows, start new currentRow

CAPTURING_ROWS + cell
  → Add cell value to currentRow (null at skip column positions)
```

## Implementation Structure

### Core Algorithm

```javascript
// Pseudocode
let state = IDLE
let context = {}
const result = { meta: {}, data: {} }

for each worksheet in workbook:
  for each row in worksheet:
    for each cell in row:
      (newState, newContext, emission) = transition(state, context, cell, location)

      if emission:
        merge emission into result

      state = newState
      context = newContext

return result
```

### Location Tracking

- Store as `{ sheet: worksheetName, row: rowNumber, column: columnLetter }`
- For metadata: location is the value cell (right of marker)
- For data sections: location is the first header cell (right of marker)
- Convert ExcelJS column numbers to letters (A, B, C, ..., Z, AA, AB, ...)

### Handling Skip Columns

- When header is `__EPR_SKIP_COLUMN`, store `null` in headers array
- When capturing rows, insert `null` at corresponding positions
- Maintains column index alignment for validation error reporting

### Output Structure

Matches ADR-17 specification:

```javascript
{
  meta: {
    PROCESSING_TYPE: {
      value: 'REPROCESSOR',
      location: { sheet: 'Received', row: 1, column: 'B' }
    },
    // ... more metadata
  },
  data: {
    UPDATE_WASTE_BALANCE: {
      location: { sheet: 'Received', row: 6, column: 'B' },
      headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
      rows: [
        [12345678910, '2025-05-25'],
        [98765432100, '2025-05-26']
      ]
    },
    // ... more data sections
  }
}
```

## Testing Strategy

### Real Excel Files (committed fixtures)

- Happy path with realistic marker layouts
- Side-by-side tables
- Stacked tables
- Multiple worksheets

### ExcelJS-Generated Files (edge cases)

- Markers at sheet boundaries
- Skip columns in various positions
- Empty rows in middle of data
- Missing cells in rows (sparse data)
- Various data types (string, number, date, formula)
- Consecutive skip columns

### Unit Testing Approach

- Test state transitions independently
- Test location tracking (row/column conversion)
- Avoid testing implementation details
- Focus on behaviour: given input, what structure is extracted?

## Error Handling

The parser is extraction-only. It will:

- Extract any markers found (no validation against known set)
- Handle missing cells gracefully (treat as empty)
- Stop at first empty row in data sections
- Let downstream validation handle correctness

The parser will fail on:

- Invalid Excel file (ExcelJS error bubbles up)
- Null/undefined buffer (fail fast)

## Performance Considerations

- Single pass through all cells
- No lookups, no jumping around
- Streaming prevents loading entire worksheet into memory
- Target: < 10k cells processes efficiently (per ADR-17)
- Keep implementation simple - optimize only if needed

## Constraints

- **100% test coverage required** (pre-commit hook enforces)
- **Pass SonarCloud quality gates** (no code smells, extract magic numbers)
- **Immutability** - no mutation of objects/arrays
- **Pure functions** - state machine logic is pure transformation

## Success Criteria

- Extracts all markers from Excel files matching ADR-17 format
- Returns structured output with location tracking
- Passes all tests with 100% coverage
- Passes SonarCloud analysis
- Handles real Excel files and edge cases correctly
