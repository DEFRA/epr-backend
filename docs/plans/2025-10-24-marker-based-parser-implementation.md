# Marker-Based Parser Implementation

**Date:** 2025-10-24
**Ticket:** PAE-415
**ADR:** [ADR-17: Decouple spreadsheet data extraction from layout using markers](../architecture/decisions/0017-decouple-spreadsheet-data-extraction-from-layout-using-markers.md)

## Purpose

Implement ADR-17's marker-based parsing in `ExcelJSSummaryLogsParser` to decouple data extraction from spreadsheet layout.

## Constraints

- 100% test coverage required (enforced by pre-commit hooks)
- Must pass SonarCloud quality gates
- Performance must handle typical files (< 10k cells) efficiently
- Favour immutability throughout implementation

## Design Approach

### Architecture

Single-pass streaming scan with state machine to process cells as they're encountered.

**Core principle:** Process each cell exactly once. State machine determines what to do with each cell:

- Begin collection of data (found marker)
- Provide data (in active collection range)
- End collection (empty row/cell)
- Ignore (not relevant to any collection)

### Key Design Decisions

**Streaming with ExcelJS:**

- Use ExcelJS streaming API to process cells row-by-row
- Process each cell exactly once as it arrives
- State machine tracks active data collections with column ranges
- Handles side-by-side tables (multiple active collections on same row)

**Immutability:**

- All functions pure where possible
- Build results incrementally without mutation
- Use spread operators and array methods (map, filter, reduce)

**Error Handling:**

- Extract everything found, let downstream validation handle correctness (per ADR-17)
- Parser is forgiving: extracts unexpected marker names, varying row lengths, etc.
- Only fail on invalid Excel file (ExcelJS throws) or null/undefined buffer

### State Machine

State tracks:

- Accumulated metadata and data sections
- Active data collections (potentially multiple, for side-by-side tables)
- Each active collection knows its column range, headers, and accumulated rows

Transitions:

- `__EPR_META_` marker → Capture next cell as metadata value
- `__EPR_DATA_` marker → Begin collecting headers, then rows
- Empty cell after headers → Finish header collection, begin row collection
- Empty row for collection's columns → Finalize that collection
- Cell within active collection range → Add to current headers/row

### Component Structure

Break into pure functions (TDD will drive exact signatures):

1. **Main parser** - Orchestrates streaming and state management
2. **Marker detection** - Identifies `__EPR_META_` and `__EPR_DATA_` cells
3. **Metadata extraction** - Captures value from cell to right of marker
4. **Data section extraction** - Handles headers (including `__EPR_SKIP_COLUMN`) and rows
5. **Result building** - Transforms accumulated state into final structure
6. **Location tracking** - Converts row/column numbers to location objects
7. **Column conversion** - Helper to convert column numbers to letters (A, B, C, ... AA, AB, etc.)

### Location Tracking

Store locations as: `{ sheet: worksheetName, row: rowNumber, column: columnLetter }`

- Metadata: location is the value cell (one right of marker)
- Data sections: location is first header cell (one right of marker)
- Use 1-indexed row numbers and letter column identifiers

### Skip Column Handling

When `__EPR_SKIP_COLUMN` encountered in headers:

- Store `null` at that index in headers array
- Insert `null` at corresponding index in all data rows
- Maintains column alignment for validation error reporting

## Testing Strategy

**Real Excel files** (committed as fixtures):

- Main happy paths
- Realistic scenarios from actual templates
- Proves integration with real Excel format

**ExcelJS-generated** (in tests):

- Edge cases: markers at boundaries, missing cells, empty rows, skip columns
- Various data types and formats
- Side-by-side and stacked tables

**Coverage:**

- Test pure functions in isolation
- Integration test with full parse scenarios
- Focus on behaviour (given buffer, expect structure), not implementation details

**Anti-patterns to avoid:**

- Don't mock ExcelJS (test real integration)
- Don't test implementation details (internal function calls)
- Don't over-specify structure when only certain fields matter

## Success Criteria

Parser successfully:

- Extracts all `__EPR_META_` markers with their values and locations
- Extracts all `__EPR_DATA_` markers with headers, rows, and locations
- Handles `__EPR_SKIP_COLUMN` markers correctly (nulls in arrays)
- Processes side-by-side tables (multiple data sections on same rows)
- Returns structure matching ADR-17 format
- Works with real Excel files and edge cases
- Maintains 100% test coverage
- Passes SonarCloud quality gates

## Implementation Notes

TDD will drive out:

- Exact state machine structure
- Helper function signatures
- Edge case handling details
- Performance optimizations (if needed)

Start with simplest test case and build up incrementally.
