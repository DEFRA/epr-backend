# 19. Summary Log Validation Output Formats

Date: 2025-01-06

## Status

Proposed

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
          "path": "meta.REGISTRATION",
          "location": {
            "sheet": "Cover",
            "row": 12,
            "column": "F"
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

For missing fields:

```javascript
{
  "path": "meta.REGISTRATION",
  "location": { "sheet": "Cover", "row": 12, "column": "F" }
}
```

For value mismatches:

```javascript
{
  "path": "meta.MATERIAL",
  "location": { "sheet": "Cover", "row": 8, "column": "B" },
  "expected": "Plastic",
  "actual": "Aluminium"
}
```

For row-level errors:

```javascript
{
  "path": "data.UPDATE_WASTE_BALANCE.rows[0][1]",
  "location": {
    "sheet": "Reprocessed",
    "header": "DATE_RECEIVED"
  }
}
```

For calculation errors:

```javascript
{
  "path": "data.UPDATE_WASTE_BALANCE.rows[0][12]",
  "location": {
    "sheet": "Received",
    "header": "TONNAGE_RECEIVED_FOR_EXPORT"
  },
  "actual": 123.45,
  "expected": 234.56
}
```

### 2. HTTP Response Format

Map domain validation results to a standardized HTTP response format that are loosely based on [JSON:API error objects](https://jsonapi.org/examples/#error-objects).

For invalid submissions (FATAL errors):

```javascript
{
  "issues": [
    {
      "code": "MISSING_REQUIRED_FIELD",
      "title": "Invalid meta field 'REGISTRATION': is required",
      "source": {
        "pointer": "/meta/REGISTRATION"
      },
      "meta": {
        "type": "TECHNICAL_ERROR",
        "sheet": "Cover",
        "row": 12,
        "column": "F"
      }
    }
  ]
}
```

For validated submissions (no FATAL errors, may have ERROR/WARNING):

```javascript
{
  "issues": [
    {
      "code": "MISSING_REQUIRED_FIELD",
      "title": "Missing required field",
      "source": {
        "pointer": "/data/UPDATE_WASTE_BALANCE/rows/0/1"
      },
      "meta": {
        "type": "TECHNICAL_ERROR",
        "sheet": "Received",
        "header": "DATE_RECEIVED"
      }
    },
    {
      "code": "CALCULATION_FAILURE",
      "title": "Calculation failure",
      "source": {
        "pointer": "/data/UPDATE_WASTE_BALANCE/rows/0/12"
      },
      "meta": {
        "type": "BUSINESS_ERROR",
        "sheet": "Received",
        "header": "TONNAGE_RECEIVED_FOR_EXPORT",
        "actual": 123.45,
        "expected": 234.56
      }
    }
  ]
}
```

**Mapping rules:**

| Domain Field            | HTTP Field                       | Transformation                                                        |
| ----------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `severity` + `category` | `meta.type`                      | `{severity}_{category}` (e.g., "FATAL_TECHNICAL" → "TECHNICAL_ERROR") |
| `message`               | `title`                          | Direct copy                                                           |
| `code`                  | `code`                           | Direct copy                                                           |
| `context.path`          | `source.pointer`                 | Convert to JSON Pointer format (dots → slashes, prepend `/`)          |
| `context.location`      | `meta.{sheet,row,column,header}` | Flatten location object                                               |
| `context.expected`      | `meta.expected`                  | Direct copy (if present)                                              |
| `context.actual`        | `meta.actual`                    | Direct copy (if present)                                              |

## Rationale

### Why Separate Domain and HTTP Formats?

**Domain format:**

- Optimized for storage and internal processing
- Preserves all validation context
- Consistent structure regardless of error type
- Easy to query and filter (e.g., "find all FATAL errors")

**HTTP format:**

- Optimized for client consumption
- Follows JSON:API conventions for familiarity
- Uses JSON Pointer for source references (standard format)
- Flattens nested structures for easier client parsing
- Hides internal categorization details (severity + category → type)

### Why Store validationResult in Database?

1. **Asynchronous validation** - Validation happens in background worker, results must be persisted
2. **Audit trail** - Historical record of why a submission was invalid
3. **Reprocessing** - Can re-evaluate business rules without re-parsing spreadsheet
4. **Client polling** - GET endpoint needs access to validation results

### Why JSON:API-Inspired Format?

1. **Industry standard** - Developers are familiar with JSON:API error format
2. **Consistent structure** - All errors follow same shape
3. **Rich context** - `source` and `meta` provide flexible error details
4. **Tooling support** - Many client libraries understand JSON:API

### Why Include Error Codes?

The `code` field enables **internationalization (i18n)** and consistent error handling:

1. **Client-side localization** - Clients can map error codes to translated messages in the user's language
2. **Consistent identification** - Same error type always has the same code, regardless of message wording
3. **Custom messaging** - Clients can provide context-specific error messages based on codes
4. **Error handling** - Programmatic handling of specific error types (e.g., retry on `CALCULATION_FAILURE`)

Example i18n usage:

```javascript
// Client-side translation mapping
const errorMessages = {
  en: {
    MISSING_REQUIRED_FIELD: 'This field is required',
    MATERIAL_MISMATCH: "The material type doesn't match your registration"
  },
  cy: {
    MISSING_REQUIRED_FIELD: 'Mae angen y maes hwn',
    MATERIAL_MISMATCH: "Nid yw'r math o ddeunydd yn cyd-fynd â'ch cofrestriad"
  }
}
```

The `title` field provides a default English message for development/debugging, but production clients should use `code` for display.

## Consequences

### Positive

✅ **Clear contracts** - Domain and HTTP formats are well-defined

✅ **Flexible error context** - `meta` object can include any relevant fields

✅ **Client-friendly** - JSON:API format is familiar and well-documented

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
        "code": "INVALID_FORMAT",
        "message": "Invalid meta field 'PROCESSING_TYPE': must be in SCREAMING_SNAKE_CASE format",
        "context": {
          "path": "meta.PROCESSING_TYPE",
          "location": { "sheet": "Cover", "row": 5, "column": "B" },
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
  "issues": [
    {
      "code": "INVALID_FORMAT",
      "title": "Invalid meta field 'PROCESSING_TYPE': must be in SCREAMING_SNAKE_CASE format",
      "source": { "pointer": "/meta/PROCESSING_TYPE" },
      "meta": {
        "type": "TECHNICAL_FATAL",
        "sheet": "Cover",
        "row": 5,
        "column": "B",
        "actual": "reprocessor"
      }
    }
  ]
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
        "code": "MISSING_REQUIRED_FIELD",
        "message": "Missing required field",
        "context": {
          "path": "data.UPDATE_WASTE_BALANCE.rows[0][1]",
          "location": { "sheet": "Reprocessed", "header": "DATE_RECEIVED" }
        }
      },
      {
        "severity": "ERROR",
        "category": "BUSINESS",
        "code": "CALCULATION_ERROR",
        "message": "Tonnage calculation differs from expected",
        "context": {
          "path": "data.UPDATE_WASTE_BALANCE.rows[0][12]",
          "location": { "sheet": "Received", "header": "TONNAGE_RECEIVED_FOR_EXPORT" },
          "actual": 123.45,
          "expected": 120.00
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
  "issues": [
    {
      "code": "MISSING_REQUIRED_FIELD",
      "title": "Missing required field",
      "source": { "pointer": "/data/UPDATE_WASTE_BALANCE/rows/0/1" },
      "meta": {
        "type": "TECHNICAL_ERROR",
        "sheet": "Reprocessed",
        "header": "DATE_RECEIVED"
      }
    },
    {
      "code": "CALCULATION_ERROR",
      "title": "Tonnage calculation differs from expected",
      "source": { "pointer": "/data/UPDATE_WASTE_BALANCE/rows/0/12" },
      "meta": {
        "type": "BUSINESS_ERROR",
        "sheet": "Received",
        "header": "TONNAGE_RECEIVED_FOR_EXPORT",
        "actual": 123.45,
        "expected": 120.00
      }
    }
  ]
}
```

## Related

- [JSON:API Error Objects Specification](https://jsonapi.org/examples/#error-objects)
- [RFC 6901 - JSON Pointer](https://tools.ietf.org/html/rfc6901)
