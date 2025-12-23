# Summary Log CloudWatch Metrics Design

> **Status:** Draft proposal for PR #568 enhancements
> **Author:** Bot
> **Date:** 2025-12-23

## Core Principle: Always Include `processingType`

The `processingType` dimension should be included in **almost all summary log metrics**, using **3 values derived from summary log metadata**:

| Value                | Description                      |
| -------------------- | -------------------------------- |
| `reprocessor_input`  | Receiving waste for reprocessing |
| `reprocessor_output` | Sending reprocessed material out |
| `exporter`           | Exporting waste                  |

> **Note:** All dimension values use lowercase for consistency, regardless of the source schema's casing.

### Why 3 Values, Not 2

The registration-level concept (`reprocessor` | `exporter`) loses the critical input/output distinction. Using the summary log's `PROCESSING_TYPE` metadata directly:

1. **More granular analysis** - "Reprocessor INPUT is slow, OUTPUT is fine" vs "Reprocessors are slow"
2. **Cleaner implementation** - Direct from source, no mapping required
3. **Better operational insights** - Input and output flows have different tables, validation rules, and failure modes
4. **Minimal cardinality impact** - 3 values vs 2 is negligible

### When to Omit `processingType`

Only omit when the metric genuinely applies equally to all types with no value in distinguishing them (rare).

---

## Proposed Metrics

### 1. Status Transition Counter

**Name:** `summaryLog.statusTransition`

**Dimensions:**
| Dimension | Values | Required |
|-----------|--------|----------|
| `status` | `preprocessing`, `rejected`, `validating`, `invalid`, `validated`, `submitting`, `submitted`, `superseded`, `validation_failed` | Yes |
| `processingType` | `reprocessor_input`, `reprocessor_output`, `exporter` | Yes |

**Example queries:**

- "How many summary logs reached INVALID status for exporters today?"
- "Compare VALIDATED rate between reprocessors and exporters"

---

### 2. Validation Duration

**Name:** `summaryLog.validation.duration`

**Unit:** Milliseconds

**Dimensions:**
| Dimension | Values | Required |
|-----------|--------|----------|
| `processingType` | `reprocessor_input`, `reprocessor_output`, `exporter` | Yes |

**Example queries:**

- "P99 validation duration for reprocessor_input"
- "Compare validation times across all three processing types"

---

### 3. Submission Duration

**Name:** `summaryLog.submission.duration`

**Unit:** Milliseconds

**Dimensions:**
| Dimension | Values | Required |
|-----------|--------|----------|
| `processingType` | `reprocessor_input`, `reprocessor_output`, `exporter` | Yes |

**Example queries:**

- "Average submission time by processing type"
- "Alert when submission duration exceeds threshold"

---

### 4. Waste Records Counter

**Name:** `summaryLog.wasteRecords`

**Dimensions:**
| Dimension | Values | Required |
|-----------|--------|----------|
| `operation` | `created`, `updated` | Yes |
| `processingType` | `reprocessor_input`, `reprocessor_output`, `exporter` | Yes |

**Example queries:**

- "Total waste records created per day by processing type"
- "Ratio of updates to creates for reprocessor_input"

---

### 5. Validation Issues Counter (NEW)

**Name:** `summaryLog.validation.issues`

**Purpose:** Track validation failures by type to identify common data quality problems.

**Dimensions:**
| Dimension | Values | Required |
|-----------|--------|----------|
| `severity` | `fatal`, `error`, `warning` | Yes |
| `category` | `technical`, `business` | Yes |
| `processingType` | `reprocessor_input`, `reprocessor_output`, `exporter` | Yes |

**Example queries:**

- "How many fatal business errors are exporters hitting?"
- "Ratio of technical vs business errors for reprocessor_output"
- "Alert when fatal errors spike"

**Cardinality:** 3 × 2 × 3 = **18 combinations** ✓

---

### 6. Row Processing Outcome Counter (NEW)

**Name:** `summaryLog.rows.outcome`

**Purpose:** Track data quality at the row level - how many rows pass vs fail validation.

**Dimensions:**
| Dimension | Values | Required |
|-----------|--------|----------|
| `outcome` | `included`, `excluded`, `rejected` | Yes |
| `processingType` | `reprocessor_input`, `reprocessor_output`, `exporter` | Yes |

**Optional additional dimension:**
| Dimension | Values | Required |
|-----------|--------|----------|
| `tableName` | `received_loads_for_reprocessing`, `reprocessed_loads`, `sent_on_loads`, `received_loads_for_export` | Optional |

**Example queries:**

- "What percentage of rows are rejected for reprocessor_input?"
- "Which table type has the highest excluded rate?"

**Cardinality (without tableName):** 3 × 3 = **9 combinations** ✓
**Cardinality (with tableName):** 3 × 3 × 4 = **36 combinations** ✓

---

## Optional Future Dimensions

These could be added later if analysis reveals value:

| Dimension   | Values                      | Use Case                               |
| ----------- | --------------------------- | -------------------------------------- |
| `material`  | 7 types                     | Material-specific performance patterns |
| `regulator` | `ea`, `nrw`, `sepa`, `niea` | Regional analysis                      |

**Note:** Adding both would increase cardinality significantly (e.g. 7 × 4 = 28× multiplier). Only add if there's a clear operational need.

---

## Cardinality Budget

| Metric                | Dimensions                           | Combinations        |
| --------------------- | ------------------------------------ | ------------------- |
| `statusTransition`    | status × processingType              | 9 × 3 = 27          |
| `validation.duration` | processingType                       | 3                   |
| `submission.duration` | processingType                       | 3                   |
| `wasteRecords`        | operation × processingType           | 2 × 3 = 6           |
| `validation.issues`   | severity × category × processingType | 3 × 2 × 3 = 18      |
| `rows.outcome`        | outcome × processingType             | 3 × 3 = 9           |
| **Total**             |                                      | **66 combinations** |

This is well within CloudWatch's acceptable range and keeps costs predictable.

---

## Implementation Notes

### API Design: Dimensions Object + Value Pattern

The metrics helper functions use a consistent pattern:

1. **Dimensions object first** - Contains all CloudWatch dimensions as named properties
2. **Value second** - The metric value (count, duration, etc.)

This approach provides:

- **Self-documenting call sites** - Clear what each dimension is
- **Consistent ordering** - Always `(dimensions, value)` regardless of function
- **Extensible** - Add new dimensions without breaking existing callers
- **Type-safe** - IDE-friendly with JSDoc typedefs

All enum values are mapped to lowercase internally for consistent CloudWatch queries.

### Metric Helper Implementation

```javascript
import {
  incrementCounter,
  recordDuration,
  timed
} from '#common/helpers/metrics.js'

/**
 * @typedef {Object} StatusTransitionDimensions
 * @property {string} status
 * @property {string} [processingType]
 */

/**
 * @typedef {Object} ProcessingTypeDimensions
 * @property {string} processingType
 */

/**
 * @typedef {Object} ValidationIssueDimensions
 * @property {string} severity
 * @property {string} category
 * @property {string} processingType
 */

/**
 * @typedef {Object} RowOutcomeDimensions
 * @property {string} outcome
 * @property {string} processingType
 */

const toDimension = (value) => value?.toLowerCase()

const buildDimensions = (dimensions) => {
  const result = {}
  for (const [key, value] of Object.entries(dimensions)) {
    const dimensionValue = toDimension(value)
    if (dimensionValue) {
      result[key] = dimensionValue
    }
  }
  return result
}

async function recordStatusTransition({ status, processingType }) {
  await incrementCounter(
    'summaryLog.statusTransition',
    buildDimensions({ status, processingType })
  )
}

async function recordValidationDuration({ processingType }, durationMs) {
  await recordDuration(
    'summaryLog.validation.duration',
    buildDimensions({ processingType }),
    durationMs
  )
}

async function timedSubmission({ processingType }, fn) {
  return timed(
    'summaryLog.submission.duration',
    buildDimensions({ processingType }),
    fn
  )
}

async function recordWasteRecordsCreated({ processingType }, count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    { operation: 'created', processingType: toDimension(processingType) },
    count
  )
}

async function recordWasteRecordsUpdated({ processingType }, count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    { operation: 'updated', processingType: toDimension(processingType) },
    count
  )
}

async function recordValidationIssues(
  { severity, category, processingType },
  count
) {
  await incrementCounter(
    'summaryLog.validation.issues',
    buildDimensions({ severity, category, processingType }),
    count
  )
}

async function recordRowOutcome({ outcome, processingType }, count) {
  await incrementCounter(
    'summaryLog.rows.outcome',
    buildDimensions({ outcome, processingType }),
    count
  )
}
```

### Usage Example

```javascript
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

// Status transition - dimensions object contains all context
await summaryLogMetrics.recordStatusTransition({
  status: SUMMARY_LOG_STATUS.VALIDATED,
  processingType
})

// Validation issues - dimensions object makes parameter order irrelevant
await summaryLogMetrics.recordValidationIssues(
  { severity, category, processingType },
  count
)

// Timed operations - dimensions first, function second
const result = await summaryLogMetrics.timedSubmission({ processingType }, () =>
  sync(summaryLog)
)

// Internally mapped to lowercase: { status: 'validated', processingType: 'reprocessor_input' }
```

---

## Dashboard Suggestions

1. **Processing Pipeline Health**
   - Status transition counts by processingType (stacked bar)
   - Validation/submission duration percentiles (line graph)

2. **Data Quality**
   - Validation issues by severity/category (pie chart)
   - Row outcomes over time (area chart)

3. **Operational**
   - Waste records created/updated rate
   - Error rate alerts (threshold alarms)
