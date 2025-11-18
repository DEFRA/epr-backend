# 20. Summary Log Validation Output Formats

Date: 2025-01-06

## Status

Approved

## Context

Summary log validation produces rich error information including:

- Multiple errors per submission
- Location information (sheet, row, column)
- Severity levels (FATAL, ERROR, WARNING)
- Error categories (PARSING, BUSINESS, TECHNICAL)
- Context data (expected vs actual values)

We need to define:

1. **Domain output format** - The validation result structure stored in the database
2. **HTTP response format** - The structure returned to clients via GET and PUT endpoints

These formats serve different purposes and audiences:

- Domain format is optimized for internal processing and storage
- HTTP format is optimized for client consumption and standardization

## Decision

### 1. Domain Validation Output (Database)

Store validation results in the summary log document with the following structure:

```javascript
{
  "_id": "summary-log-123",
  "status": "invalid", // or "validated", "validating"
  "validation": {
    "issues": [
      {
        "severity": "FATAL",     // FATAL | ERROR | WARNING
        "category": "TECHNICAL", // TECHNICAL | BUSINESS | PARSING
        "code": "MISSING_REQUIRED_FIELD",
        "message": "Invalid meta field 'REGISTRATION': is required",
        "context": {
          "location": {
            "sheet": "Cover",
            "row": 12,
            "column": "F",
            "field": "REGISTRATION"
          }
        }
      }
    ]
  }
}
```

**Status values:**

- `validating` - Validation in progress
- `validated` - Can be submitted (may have ERROR and/or WARNING issues)
- `invalid` - Cannot be submitted (contains FATAL issues)

**Severity meanings:**

- `FATAL` - Blocks submission
- `ERROR` - Does not block submission
- `WARNING` - Advisory

**Category meanings:**

- `PARSING` - Structural/format issues with spreadsheet data
- `TECHNICAL` - System/data integrity issues (e.g., malformed input)
- `BUSINESS` - Business logic violations (e.g., material mismatch)

**Context structure varies by error type:**

For meta field errors (missing or invalid):

```javascript
{
  "location": {
    "sheet": "Cover",
    "row": 12,
    "column": "F",
    "field": "REGISTRATION"
  }
}
```

For meta field value mismatches:

```javascript
{
  "location": {
    "sheet": "Cover",
    "row": 8,
    "column": "B",
    "field": "MATERIAL"
  },
  "expected": "Plastic",
  "actual": "Aluminium"
}
```

For data row errors:

```javascript
{
  "location": {
    "sheet": "Received",
    "table": "UPDATE_WASTE_BALANCE",
    "row": 9,
    "column": "D",
    "header": "DATE_RECEIVED"
  }
}
```

For data row value mismatches:

```javascript
{
  "location": {
    "sheet": "Received",
    "table": "UPDATE_WASTE_BALANCE",
    "row": 15,
    "column": "M",
    "header": "TONNAGE_RECEIVED_FOR_EXPORT"
  },
  "actual": 123.45,
  "expected": 234.56
}
```

**Location structure:**

- `sheet` - The worksheet name (e.g., "Cover", "Received")
- `table` - The data table name (e.g., "UPDATE_WASTE_BALANCE") - only for data rows, not meta fields
- `row` - The 1-based row number in the spreadsheet
- `column` - The Excel column letter (e.g., "B", "AA")
- `field` - Used for meta fields (e.g., "PROCESSING_TYPE", "REGISTRATION")
- `header` - Used for data table columns (e.g., "TONNAGE", "DATE_RECEIVED")

All location information is grouped together for clarity and to avoid duplication. The `path` field is no longer used as it was internal-only and not surfaced to clients.

### 2. HTTP Response Format

The HTTP response uses a **table-keyed structure** that groups validation issues by their nature and location:

- **`failures`** - Array of fatal meta-level errors that block submission (XOR with concerns)
- **`concerns`** - Object with table-keyed row-level errors and warnings (XOR with failures)

For invalid submissions (FATAL errors - meta-level validation failures):

```javascript
{
  "status": "invalid",
  "validation": {
    "failures": [
      {
        "code": "MISSING_REQUIRED_FIELD",
        "location": {
          "sheet": "Cover",
          "row": 12,
          "column": "F",
          "field": "REGISTRATION"
        }
      }
    ],
    "concerns": {}  // Empty when fatal errors present
  },
  "failureReason": "Invalid meta field 'REGISTRATION': is required"
}
```

For validated submissions (no FATAL errors, may have data-level ERROR/WARNING):

```javascript
{
  "status": "validated",
  "validation": {
    "failures": [],  // Empty when no fatal errors
    "concerns": {
      "UPDATE_WASTE_BALANCE": {
        "sheet": "Received",
        "rows": [
          {
            "row": 8,
            "issues": [
              {
                "type": "error",
                "code": "INVALID_DATE",
                "header": "DATE_RECEIVED",
                "column": "B"
              },
              {
                "type": "error",
                "code": "VALUE_OUT_OF_RANGE",
                "header": "TONNAGE_RECEIVED_FOR_EXPORT",
                "column": "M",
                "actual": 123.45,
                "expected": 120.00
              }
            ]
          }
        ]
      }
    }
  }
}
```

For submissions with no validation issues:

```javascript
{
  "status": "validated",
  "validation": {
    "failures": [],
    "concerns": {}
  }
}
```

**Mapping rules for fatal errors (meta-level):**

| Domain Field       | HTTP Field       | Notes                                                       |
| ------------------ | ---------------- | ----------------------------------------------------------- |
| `code`             | `code`           | Error code (e.g., "REGISTRATION_MISMATCH")                  |
| `context.location` | `location`       | Location object with sheet/row/column/field                 |
| `context.actual`   | `actual`         | Included if present                                         |
| `context.expected` | `expected`       | Included if present                                         |
| `severity`         | _(not included)_ | Fatal errors always appear in `failures` array              |
| `category`         | _(not included)_ | Not exposed in HTTP response                                |
| `message`          | _(not included)_ | Used for logging and `failureReason`, not in failures array |

**Mapping rules for data errors (row-level):**

| Domain Field       | HTTP Field       | Notes                                                   |
| ------------------ | ---------------- | ------------------------------------------------------- |
| `severity`         | `type`           | "error" for ERROR severity, "warning" for WARNING       |
| `code`             | `code`           | Error code (e.g., "INVALID_DATE", "VALUE_OUT_OF_RANGE") |
| `context.location` | Grouped by       | `table` → top-level key, `sheet` → table property,      |
|                    | location         | `row` → row grouping, `header`+`column` → issue fields  |
| `context.actual`   | `actual`         | Included if present                                     |
| `context.expected` | `expected`       | Included if present                                     |
| `category`         | _(not included)_ | Not exposed in HTTP response                            |
| `message`          | _(not included)_ | Used for logging, not sent to clients                   |

**Key design principles:**

1. **XOR structure**: Either `failures` (fatal) OR `concerns` (data), never both
2. **Table-keyed**: Data issues grouped by table name for easier client navigation
3. **Row-grouped**: Issues within a table grouped by row number
4. **Minimal**: Only essential fields exposed (`code`, `type`, location, actual/expected)
5. **Client-friendly**: Structure matches how users think about spreadsheet errors

## Rationale

### Why Separate Domain and HTTP Formats?

**Domain format:**

- Optimized for storage and internal processing
- Preserves all validation context
- Consistent structure regardless of error type
- Easy to query and filter (e.g., "find all FATAL errors")

**HTTP format:**

- Optimized for client consumption (spreadsheet users)
- Uses spreadsheet location references (sheet/row/column) directly
- Preserves structured context (e.g., nested location object)
- Combines severity + category into a single type field for classification
- Excludes internal implementation details (no JSON paths exposed)

### Why Store validationResult in Database?

1. **Asynchronous validation** - Validation happens in background worker, results must be persisted
2. **Audit trail** - Historical record of why a submission was invalid
3. **Reprocessing** - Can re-evaluate business rules without re-parsing spreadsheet
4. **Client polling** - GET endpoint needs access to validation results

### Error Codes for Internationalization

The `code` field enables **internationalization (i18n)** and consistent error handling:

1. **Client-side localization** - Clients can map error codes to translated messages in the user's language
2. **Consistent identification** - Same error type always has the same code, regardless of message wording
3. **Custom messaging** - Clients can provide context-specific error messages based on codes
4. **Error handling** - Programmatic handling of specific error types (e.g., retry on specific validation failures)

**Implemented Error Codes:**

Meta-level validation:

- `REGISTRATION_MISMATCH` - Registration number doesn't match
- `PROCESSING_TYPE_MISMATCH` - Processing type doesn't match registration
- `UNEXPECTED_PROCESSING_TYPE` - Unrecognized processing type value
- `MISSING_ACCREDITATION_NUMBER` - Missing required accreditation
- `ACCREDITATION_MISMATCH` - Accreditation doesn't match registration
- `UNEXPECTED_ACCREDITATION_NUMBER` - Unexpected accreditation present
- `UNEXPECTED_MATERIAL` - Unrecognized material type
- `MATERIAL_MISMATCH` - Material doesn't match registration
- `INVALID_META_FIELD` - Invalid or missing meta field
- `VALIDATION_SYSTEM_ERROR` - System failures during validation

Data-level validation:

- `MISSING_REQUIRED_HEADER` - Required table header is missing
- `FIELD_REQUIRED` - Required cell value is missing (Joi 'any.required')
- `INVALID_TYPE` - Cell value has wrong type (Joi 'number.base', 'string.base')
- `VALUE_OUT_OF_RANGE` - Cell value outside valid range (Joi 'number.min', 'number.max', 'number.greater', 'number.less')
- `INVALID_FORMAT` - Cell value doesn't match required pattern (Joi 'string.pattern.base')
- `INVALID_DATE` - Cell value is not a valid date (Joi 'date.base')
- `VALIDATION_FALLBACK_ERROR` - Fallback for unmapped Joi error types

Example client-side i18n usage:

```javascript
// Client-side translation mapping
const errorMessages = {
  en: {
    FIELD_REQUIRED: 'This field is required',
    MATERIAL_MISMATCH: "The material type doesn't match your registration",
    INVALID_DATE: 'Please enter a valid date'
  },
  cy: {
    FIELD_REQUIRED: 'Mae angen y maes hwn',
    MATERIAL_MISMATCH: "Nid yw'r math o ddeunydd yn cyd-fynd â'ch cofrestriad",
    INVALID_DATE: 'Rhowch ddyddiad dilys'
  }
}
```

## Consequences

### Positive

✅ **Clear contracts** - Domain and HTTP formats are well-defined

✅ **Flexible error context** - `meta` object can include any relevant fields

✅ **Queryable** - Domain format supports database queries on status, severity, category

✅ **Future-proof** - Can add new error fields without breaking structure

### Negative

⚠️ **Mapping overhead** - Need to transform domain → HTTP format

⚠️ **Two sources of truth** - Domain and HTTP structures must stay synchronized

⚠️ **Storage cost** - Storing full validation results increases document size

## Examples

### Example 1: Single Fatal Syntax Error

**Domain:**

```javascript
{
  "status": "invalid",
  "validation": {
    "issues": [
      {
        "severity": "FATAL",
        "category": "TECHNICAL",
        "code": "INVALID_META_FIELD",
        "message": "Invalid meta field 'PROCESSING_TYPE': must be in SCREAMING_SNAKE_CASE format",
        "context": {
          "location": {
            "sheet": "Cover",
            "row": 5,
            "column": "B",
            "field": "PROCESSING_TYPE"
          },
          "actual": "reprocessor"
        }
      }
    ]
  }
}
```

**HTTP Response:**

```javascript
{
  "status": "invalid",
  "validation": {
    "failures": [
      {
        "code": "INVALID_META_FIELD",
        "location": {
          "sheet": "Cover",
          "row": 5,
          "column": "B",
          "field": "PROCESSING_TYPE"
        },
        "actual": "reprocessor"
      }
    ],
    "concerns": {}
  },
  "failureReason": "Invalid meta field 'PROCESSING_TYPE': must be in SCREAMING_SNAKE_CASE format"
}
```

### Example 2: Multiple Non-Fatal Errors

**Domain:**

```javascript
{
  "status": "validated",
  "validation": {
    "issues": [
      {
        "severity": "ERROR",
        "category": "TECHNICAL",
        "code": "INVALID_DATE",
        "message": "Invalid value in column 'DATE_RECEIVED': must be a valid date",
        "context": {
          "location": {
            "sheet": "Received",
            "table": "UPDATE_WASTE_BALANCE",
            "row": 8,
            "column": "B",
            "header": "DATE_RECEIVED"
          },
          "actual": "invalid-date"
        }
      },
      {
        "severity": "ERROR",
        "category": "TECHNICAL",
        "code": "VALUE_OUT_OF_RANGE",
        "message": "Invalid value in column 'TONNAGE_RECEIVED_FOR_EXPORT': must be at least 0",
        "context": {
          "location": {
            "sheet": "Received",
            "table": "UPDATE_WASTE_BALANCE",
            "row": 8,
            "column": "M",
            "header": "TONNAGE_RECEIVED_FOR_EXPORT"
          },
          "actual": -10
        }
      }
    ]
  }
}
```

**HTTP Response:**

```javascript
{
  "status": "validated",
  "validation": {
    "failures": [],
    "concerns": {
      "UPDATE_WASTE_BALANCE": {
        "sheet": "Received",
        "rows": [
          {
            "row": 8,
            "issues": [
              {
                "type": "error",
                "code": "INVALID_DATE",
                "header": "DATE_RECEIVED",
                "column": "B",
                "actual": "invalid-date"
              },
              {
                "type": "error",
                "code": "VALUE_OUT_OF_RANGE",
                "header": "TONNAGE_RECEIVED_FOR_EXPORT",
                "column": "M",
                "actual": -10
              }
            ]
          }
        ]
      }
    }
  }
}
```

## Related

- [RFC 6901 - JSON Pointer](https://tools.ietf.org/html/rfc6901)
