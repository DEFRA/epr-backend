# Benchmarks

Performance benchmarks for the Excel parser.

## Available Benchmarks

### General Benchmark Suite

Tests parser performance across various dataset sizes:

```bash
npm run benchmark:parser
```

Tests:

- Real fixture files
- Small datasets (10 rows)
- Medium datasets (100 rows)
- Large datasets (1000 rows)
- Multi-sheet scenarios

### File-Specific Benchmark

Benchmark a specific Excel file:

```bash
npm run benchmark:parser:file <path-to-xlsx-file>
```

Example:

```bash
npm run benchmark:parser:file ./test-data/large-file.xlsx
```

Shows:

- File size
- Operations per second
- Average, min, max latency
- P99 latency
- Sample count

## Tools

Built with [tinybench](https://github.com/tinylibs/tinybench) - a simple, tiny benchmarking library.
