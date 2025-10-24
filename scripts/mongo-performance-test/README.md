# MongoDB Physical Data Model Benchmarking Scripts

This directory contains benchmarking scripts to compare two MongoDB data modeling approaches for data collected from forms: single nested collection vs. separate collections.

## Overview

The scripts generate test data and measure performance metrics (insert, read, update, and join operations) for two different MongoDB collection designs:

1. **Single Nested Collection**: Organisations with embedded registrations and accreditations
2. **Separate Collections**: Organisations, registrations, and accreditations in separate collections

[This is to aid ADR decision](../../docs/architecture/decisions/0008-forms-physical-data-model.md)

## Directory Structure

```sh
mongo-performance-test/
  ├── single-nested-collection/
  │   ├── benchmark-write-read.js             # Runs benchmarks for nested design
  │   ├── create-collection.js                # Creates collection with nested structure
  │   └── data-generators.js                  # Test data generation
  │
  └── separate-collections/
      ├── benchmark-separate-collections.js   # Runs benchmarks for normalized design
      ├── create-collections.js               # Creates three separate collections
      └── data-generators.js                  # Test data generation
```

## Prerequisites

- MongoDB running locally on `mongodb://localhost:27017`

## Installation

```bash
docker compose up -d
```

## Running the Benchmarks

### Single Nested Collection Approach

```bash
node single-nested-collection/benchmark-write-read.js
```

This will:

- Create the `organisation_epr` collection in the `epr` database
- Generate 20,000 organisations, each with 3 registration/accreditation pairs (60,000 nested docs)
- Measure insert performance
- Log collection size statistics
- Run read queries by orgId, registration ID, and accreditation ID
- Update 300 registration statuses to 'approved'

### Separate Collections Approach

```bash
node separate-collections/benchmark-separate-collections.js
```

This will:

- Create three collections: `organisations`, `registrations`, and `accreditations` in the `epr_separate` database
- Generate 20,000 organisations, 60,000 registrations, and 60,000 accreditations
- Measure insert performance for each collection
- Log collection size statistics
- Run read queries by ID
- Test `$lookup` join queries combining org + registrations + accreditations
- Update 300 registration statuses to 'approved'

## Configuration

You can adjust the following constants in the benchmark scripts:

```javascript
const TOTAL_ORGANISATIONS = 20000 // Number of organisations to generate
const REGISTRATION_ACCREDITATION_COUNT = 3 // Pairs per organisation
const MONGO_URL = 'mongodb://localhost:27017' // MongoDB connection string
const DB_NAME = 'epr' // Database name
```

## Performance Metrics

The scripts measure and report:

- **Insert Statistics**: Median, 95th percentile, 99th percentile write times
- **Collection Size**: Total size, average document size, min/max sizes
- **Query Performance**: Average, median, min, max, P95, P99 read times
- **Update Performance**: Timing statistics for status updates
- **Join Performance** (separate collections only): `$lookup` aggregation query times

## Notes

- All collections use strict schema validation with `validationAction: 'error'`
- The scripts drop and recreate collections on each run (destructive operation)
- Performance results will vary based on hardware and MongoDB configuration
- Parallelism for operations is set to 5 by default

## Performance Benchmarks

All benchmarks performed with schema validation and appropriate indexes unless noted otherwise.

### Data volume for test

- **Scale**: ~20,000 organisations, ~60,000 registrations, ~60,000 accreditations
- **Distribution**: Average of 3 registrations and 3 accreditations per organisation

### Environment

Local dev machine with `32GB(10GB free memory)` and `AMD Ryzen 7 PRO 7840U`

### Insert Performance

**Single Nested Collection**

| Configuration               | Documents | Median | P95   | P99   | Avg Size | Total Size |
| --------------------------- | --------- | ------ | ----- | ----- | -------- | ---------- |
| No validation, no indexes   | 20,000    | 1ms    | 1ms   | 3.3ms | 9KB      | -          |
| With validation, no indexes | 20,000    | 1ms    | 1.5ms | 4.3ms | 9KB      | -          |
| With validation, 7 indexes  | 20,000    | 1ms    | 1.7ms | 4.3ms | 9KB      | 177MB      |

**Separate Collections**

| Collection     | Documents | Median | P95 | P99    | Avg Size | Total Size |
| -------------- | --------- | ------ | --- | ------ | -------- | ---------- |
| Organisations  | 20,000    | 1ms    | 1ms | 4.2ms  | 0.7KB    | 13MB       |
| Registrations  | 60,000    | 1ms    | 1ms | 1.75ms | 1.5KB    | 90MB       |
| Accreditations | 60,000    | 1ms    | 1ms | 1.6ms  | 1.5KB    | 75MB       |
| **Combined**   | 140,000   | 1ms    | 1ms | 4.2ms  | 3.7KB    | **178MB**  |

### Update Performance (Registration Status Updates)

**Single Nested Collection**

| Configuration               | Median | P95  | P99  |
| --------------------------- | ------ | ---- | ---- |
| No indexes                  | 11ms   | 23ms | 26ms |
| With validation, no indexes | 13ms   | 25ms | 27ms |
| With validation and indexes | 1ms    | 2ms  | 3ms  |

**Separate Collections**

| Configuration               | Median | P95 | P99 |
| --------------------------- | ------ | --- | --- |
| With validation and indexes | 1ms    | 1ms | 3ms |

### Read Performance

**Without Indexes** (Single Collection)

| Query Type         | Median | P95  | P99  |
| ------------------ | ------ | ---- | ---- |
| By orgId           | 6ms    | 10ms | 26ms |
| By registrationId  | 15ms   | 24ms | 28ms |
| By accreditationId | 15ms   | 27ms | 30ms |

**With Indexes**

| Query Type                                      | Approach              | Median  | P95     | P99     |
| ----------------------------------------------- | --------------------- | ------- | ------- | ------- |
| Fetch org by orgId                              | Single Collection     | 1ms     | 3ms     | 5ms     |
| Fetch org by orgId                              | Separate (no join)    | 1ms     | 4ms     | 6ms     |
| Fetch registration by ID                        | Single Collection     | 1ms     | 3ms     | 5ms     |
| Fetch registration by ID                        | Separate              | 1ms     | 2ms     | 3ms     |
| Fetch accreditation by ID                       | Single Collection     | 1ms     | 3ms     | 5ms     |
| Fetch accreditation by ID                       | Separate              | 1ms     | 1.5ms   | 2.5ms   |
| **Fetch org + regs + accs (complete data)**     | **Single Collection** | **1ms** | **3ms** | **5ms** |
| **Fetch org + regs + accs (join with $lookup)** | **Separate**          | **2ms** | **5ms** | **6ms** |

**Key Takeaway**: For the primary use case (fetching complete organisation data), single nested collection is 2x faster (1ms vs 2ms median).
