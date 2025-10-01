# MongoDB Physical Data Model Benchmarking Scripts

This directory contains benchmarking scripts to compare two MongoDB data modeling approaches for data collected from forms: single nested collection vs. separate collections.

## Overview

The scripts generate test data and measure performance metrics (insert, read, update, and join operations) for two different MongoDB collection designs:

1. **Single Nested Collection**: Organisations with embedded registrations and accreditations
2. **Separate Collections**: Organisations, registrations, and accreditations in separate collections

[This is to aid ADR decision](../../docs/architecture/decisions/0008-forms-physical-data-model.md)

## Directory Structure

```
scripts/
├── single-nested-collection/
│   ├── create_collection.js          # Creates collection with nested structure
│   ├── benchmark-write-read.js       # Runs benchmarks for nested design
│   └── data-generators.js            # Test data generation
│
└── separate-collections/
    ├── create_collections.js         # Creates three separate collections
    ├── benchmark-separate-collections.js  # Runs benchmarks for normalized design
    └── data-generators.js            # Test data generation
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
