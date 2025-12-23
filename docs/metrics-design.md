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

### API Design: Accept Enums, Map Internally

The metrics helper functions should:

1. Accept domain enum types in their public API (type-safe, IDE-friendly)
2. Map to lowercase dimension values internally (consistent CloudWatch queries)

This keeps callers working with proper domain types while ensuring consistent metric dimensions.

### Metric Helper Implementation

```javascript
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  VALIDATION_SEVERITY,
  VALIDATION_CATEGORY
} from '#common/enums/validation.js'
import { incrementCounter, timed } from '#common/helpers/metrics.js'

/**
 * Maps enum values to lowercase dimension values
 * @param {string} value
 * @returns {string}
 */
const toDimension = (value) => value.toLowerCase()

/**
 * @param {typeof SUMMARY_LOG_STATUS[keyof typeof SUMMARY_LOG_STATUS]} status
 * @param {typeof PROCESSING_TYPES[keyof typeof PROCESSING_TYPES]} processingType
 */
async function recordStatusTransition(status, processingType) {
  await incrementCounter('summaryLog.statusTransition', {
    status: toDimension(status),
    processingType: toDimension(processingType)
  })
}

/**
 * @template T
 * @param {() => Promise<T> | T} fn
 * @param {typeof PROCESSING_TYPES[keyof typeof PROCESSING_TYPES]} processingType
 * @returns {Promise<T>}
 */
async function timedValidation(fn, processingType) {
  return timed('summaryLog.validation.duration', fn, {
    processingType: toDimension(processingType)
  })
}

/**
 * @template T
 * @param {() => Promise<T> | T} fn
 * @param {typeof PROCESSING_TYPES[keyof typeof PROCESSING_TYPES]} processingType
 * @returns {Promise<T>}
 */
async function timedSubmission(fn, processingType) {
  return timed('summaryLog.submission.duration', fn, {
    processingType: toDimension(processingType)
  })
}

/**
 * @param {'created' | 'updated'} operation
 * @param {typeof PROCESSING_TYPES[keyof typeof PROCESSING_TYPES]} processingType
 * @param {number} count
 */
async function recordWasteRecords(operation, processingType, count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    { operation, processingType: toDimension(processingType) },
    count
  )
}

/**
 * @param {typeof VALIDATION_SEVERITY[keyof typeof VALIDATION_SEVERITY]} severity
 * @param {typeof VALIDATION_CATEGORY[keyof typeof VALIDATION_CATEGORY]} category
 * @param {typeof PROCESSING_TYPES[keyof typeof PROCESSING_TYPES]} processingType
 * @param {number} [count=1]
 */
async function recordValidationIssues(
  severity,
  category,
  processingType,
  count = 1
) {
  await incrementCounter(
    'summaryLog.validation.issues',
    {
      severity: toDimension(severity),
      category: toDimension(category),
      processingType: toDimension(processingType)
    },
    count
  )
}

/**
 * @param {typeof ROW_OUTCOME[keyof typeof ROW_OUTCOME]} outcome
 * @param {typeof PROCESSING_TYPES[keyof typeof PROCESSING_TYPES]} processingType
 * @param {number} [count=1]
 */
async function recordRowOutcome(outcome, processingType, count = 1) {
  await incrementCounter(
    'summaryLog.rows.outcome',
    {
      outcome: toDimension(outcome),
      processingType: toDimension(processingType)
    },
    count
  )
}
```

### Usage Example

```javascript
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

// Callers use proper enum types
const processingType = parsedData.meta.PROCESSING_TYPE.value // 'REPROCESSOR_INPUT'

await summaryLogMetrics.recordStatusTransition(
  SUMMARY_LOG_STATUS.VALIDATED,
  processingType
)

// Internally mapped to: { status: 'validated', processingType: 'reprocessor_input' }
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
