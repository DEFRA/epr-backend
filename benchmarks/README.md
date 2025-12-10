# Benchmarks

Diagnostic tools for Excel parser performance.

## Parse File Diagnostic

Measure parse time for a specific Excel file:

```bash
npm run benchmark:file <path-to-xlsx-file>
```

Example:

```bash
npm run benchmark:file ./src/data/fixtures/spreadsheet/templates/V4/Summary_Log_Exporter.xlsx
```

Output includes:

- File size
- Parse time
- Metadata field count
- Data table count
- Total row count

Useful for debugging performance issues with user-submitted files.

## Performance Tests

For automated performance regression testing, see:

```
src/adapters/parsers/summary-logs/exceljs-parser.performance.test.js
```

These tests run as part of the normal test suite and verify that spreadsheet templates parse within acceptable time
limits.
