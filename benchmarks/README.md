# Benchmarks

Diagnostic tools for Excel parser performance.

## Parse + Validate

Measure both parse time and validation time for a specific Excel file:

```bash
npm run benchmark:validate <path-to-xlsx-file>
```

Example:

```bash
npm run benchmark:validate ./src/data/fixtures/spreadsheet/templates/V5/Summary_Log_Exporter.xlsx
```

Output includes:

- File size
- Parse time and validation time (separately)
- Processing type detected
- Per-table row counts with validation outcomes (INCLUDED/EXCLUDED/REJECTED)
- Validation issue summary (fatal/error/warning counts)
- Time breakdown showing parse vs validation percentage

This is the most comprehensive benchmark, running the same pipeline as the characterisation tests.

## Parse Only

Measure just the parse time (without validation):

```bash
npm run benchmark:parse <path-to-xlsx-file>
```

Example:

```bash
npm run benchmark:parse ./src/data/fixtures/spreadsheet/templates/V5/Summary_Log_Exporter.xlsx
```

Output includes:

- File size
- Parse time
- Metadata field count
- Data table count
- Total row count

Useful when you only need to measure Excel parsing without validation overhead.

## Test File Generator

Generate test files with a specific number of rows for benchmarking:

```bash
npm run benchmark:generate <source-file> <target-rows> [output-file]
```

Example:

```bash
npm run benchmark:generate ./src/data/fixtures/spreadsheet/templates/V5/Summary_Log_Exporter.xlsx 10000
```

This duplicates existing data rows to reach the target count, preserving all Excel formatting, styles, and validation.

## Performance Tests

For automated performance regression testing, see:

```
src/adapters/parsers/summary-logs/exceljs-parser.performance.test.js
```

These tests run as part of the normal test suite and verify that spreadsheet templates parse within acceptable time
limits.
