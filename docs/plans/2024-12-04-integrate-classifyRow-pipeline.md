# Integrate classifyRow Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dual-schema validation approach with the LLD-compliant `classifyRow` pipeline, producing REJECTED/EXCLUDED/INCLUDED outcomes that flow through to the loads response.

**Architecture:** The domain layer already contains the new table schemas and `classifyRow()` function implementing the three-outcome model (VAL010 → REJECTED, VAL011 → EXCLUDED, all pass → INCLUDED). This plan migrates `data-syntax.js` to use these domain schemas, stores outcomes on validated rows, and updates `classifyLoads` to use outcomes instead of computing from issues.

**Tech Stack:** Joi validation, Vitest testing

---

## Background

### Current State (Two Parallel Implementations)

| Layer           | Location                                                    | Structure                                                               | Status       |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| **Application** | `src/application/summary-logs/validations/table-schemas.js` | `rowSchemas.failure` + `rowSchemas.concern`                             | In use       |
| **Domain**      | `src/domain/summary-logs/table-schemas/`                    | `unfilledValues` + `validationSchema` + `fieldsRequiredForWasteBalance` | Not wired up |

### Target State (Single Domain Implementation)

The domain-layer schemas and `classifyRow()` become the single source of truth. Each row is classified as:

- **REJECTED** - Fails VAL010 (in-sheet validation of filled fields) → blocks entire submission
- **EXCLUDED** - Fails VAL011 (missing fields required for Waste Balance) → excluded from Waste Balance, but submitted
- **INCLUDED** - Passes all validation → contributes to Waste Balance

### Data Flow Changes

```
BEFORE:
  data-syntax.js → rowSchemas.failure/concern → issues attached to rows
  classifyLoads → computes included/excluded from issues (mirrors valid/invalid)

AFTER:
  data-syntax.js → classifyRow() → outcome + issues attached to rows
  classifyLoads → reads outcome directly for included/excluded
```

### Key Files

| File                                                                                         | Role                                                                                   |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/domain/summary-logs/table-schemas/validation-pipeline.js`                               | Contains `classifyRow()`, `filterToFilled()`, `isFilled()`, `ROW_OUTCOME`              |
| `src/domain/summary-logs/table-schemas/index.js`                                             | Exports `PROCESSING_TYPE_TABLES` registry                                              |
| `src/domain/summary-logs/table-schemas/reprocessor-input/received-loads-for-reprocessing.js` | Full schema with `unfilledValues`, `validationSchema`, `fieldsRequiredForWasteBalance` |
| `src/application/summary-logs/validations/data-syntax.js`                                    | Validator to modify                                                                    |
| `src/application/summary-logs/validations/table-schemas.js`                                  | Old schemas to delete                                                                  |
| `src/application/summary-logs/validations/table-schemas.schema.js`                           | Old Joi schemas to delete                                                              |
| `src/application/summary-logs/classify-loads.js`                                             | Update to use row outcomes                                                             |

---

## Task 1: Add `outcome` to ValidatedRow Type

Update the `ValidatedRow` typedef in `data-syntax.js` to include the classification outcome.

**Files:**

- Modify: `src/application/summary-logs/validations/data-syntax.js:18-23`

**Step 1: Update the typedef**

In `data-syntax.js`, change the `ValidatedRow` typedef:

```javascript
/**
 * A validated row with classification outcome and issues attached
 *
 * @export
 * @typedef {Object} ValidatedRow
 * @property {Array<*>} values - Original row values array
 * @property {string} rowId - Extracted row ID
 * @property {'REJECTED'|'EXCLUDED'|'INCLUDED'} outcome - Classification outcome from validation pipeline
 * @property {ValidationIssue[]} issues - Validation issues for this row
 */
```

**Step 2: Commit**

```bash
git add src/application/summary-logs/validations/data-syntax.js
git commit -m "docs: add outcome field to ValidatedRow typedef"
```

---

## Task 2: Import Domain Schema Registry into data-syntax.js

Switch the import from application-layer schemas to domain-layer schemas.

**Files:**

- Modify: `src/application/summary-logs/validations/data-syntax.js`
- Modify: `src/application/summary-logs/validate.js`

**Step 1: Update imports in data-syntax.js**

Remove the old import and add the domain imports. At the top of `data-syntax.js`:

```javascript
import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { offsetColumn } from '#common/helpers/spreadsheet/columns.js'
import { isEprMarker } from '#domain/summary-logs/markers.js'
import { PROCESSING_TYPE_TABLES } from '#domain/summary-logs/table-schemas/index.js'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
```

**Step 2: Update validate.js to use domain schemas**

In `src/application/summary-logs/validate.js`, change line 14:

```javascript
// Before
import { PROCESSING_TYPE_TABLES } from './validations/table-schemas.js'

// After
import { PROCESSING_TYPE_TABLES } from '#domain/summary-logs/table-schemas/index.js'
```

**Step 3: Run tests to check for import errors**

```bash
npm test -- src/application/summary-logs/validations/data-syntax.test.js
```

Expected: Tests may fail due to schema structure differences (this is expected at this stage).

**Step 4: Commit**

```bash
git add src/application/summary-logs/validations/data-syntax.js src/application/summary-logs/validate.js
git commit -m "refactor: import domain-layer table schemas"
```

---

## Task 3: Create Schema Adapter Function

The domain schemas have a different structure. Create an adapter in `data-syntax.js` that bridges the gap during migration.

**Files:**

- Modify: `src/application/summary-logs/validations/data-syntax.js`

**Step 1: Add the adapter function**

Add this function after the imports in `data-syntax.js`:

```javascript
/**
 * Adapts domain table schema to the structure expected by validateTable
 *
 * Domain schemas use: unfilledValues, validationSchema, fieldsRequiredForWasteBalance
 * This adapter extracts what validateTable needs during the migration.
 *
 * @param {Object} domainSchema - Schema from domain layer
 * @returns {Object} Schema structure for validateTable
 */
const adaptDomainSchema = (domainSchema) => ({
  requiredHeaders: domainSchema.requiredHeaders,
  rowIdField: domainSchema.rowIdField,
  // Pass through the domain schema for classifyRow
  domainSchema
})
```

**Step 2: Commit**

```bash
git add src/application/summary-logs/validations/data-syntax.js
git commit -m "refactor: add domain schema adapter function"
```

---

## Task 4: Rewrite validateRows to Use classifyRow

Replace the dual-schema validation with `classifyRow()`.

**Files:**

- Modify: `src/application/summary-logs/validations/data-syntax.js:247-290`

**Step 1: Write failing test**

Create or update a test in `src/application/summary-logs/validations/data-syntax.test.js`:

```javascript
describe('validateRows with classifyRow', () => {
  it('returns REJECTED outcome when filled field fails validation', () => {
    // Test that ROW_ID < 10000 produces REJECTED
  })

  it('returns EXCLUDED outcome when required field is missing', () => {
    // Test that missing fieldsRequiredForWasteBalance produces EXCLUDED
  })

  it('returns INCLUDED outcome when all validation passes', () => {
    // Test that complete valid row produces INCLUDED
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/application/summary-logs/validations/data-syntax.test.js
```

Expected: FAIL (outcome not yet returned)

**Step 3: Rewrite validateRows function**

Replace the `validateRows` function (around line 247-290) with:

```javascript
/**
 * Validates all rows using the classifyRow pipeline
 *
 * Each row is classified as:
 * - REJECTED: Fails VAL010 (in-sheet validation) - produces FATAL errors
 * - EXCLUDED: Fails VAL011 (missing required fields) - produces ERROR severity
 * - INCLUDED: Passes all validation
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table being validated
 * @param {Map<string, number>} params.headerToIndexMap - Map of header names to column indices
 * @param {Array<Array<*>>} params.rows - Array of raw data rows
 * @param {Object} params.domainSchema - Domain table schema with unfilledValues, validationSchema, fieldsRequiredForWasteBalance
 * @param {Object} params.location - Table location in spreadsheet
 * @param {ReturnType<typeof createValidationIssues>} params.issues - Validation issues collector
 * @returns {ValidatedRow[]} Array of validated rows with outcome and issues attached
 */
const validateRows = ({
  tableName,
  headerToIndexMap,
  rows,
  domainSchema,
  location,
  issues
}) => {
  return rows.map((originalRow, rowIndex) => {
    // Build row object from array
    const rowObject = {}
    for (const [headerName, colIndex] of headerToIndexMap) {
      rowObject[headerName] = originalRow[colIndex]
    }

    // Classify row using domain pipeline
    const classification = classifyRow(rowObject, domainSchema)

    // Convert classification issues to application issues with locations
    const rowIssues = classification.issues.map((issue) => {
      const colIndex = headerToIndexMap.get(issue.field)
      return {
        category: VALIDATION_CATEGORY.TECHNICAL,
        message: issue.message || `${issue.code}: ${issue.field}`,
        code:
          issue.code === 'VALIDATION_ERROR'
            ? VALIDATION_CODE.VALIDATION_FALLBACK_ERROR
            : VALIDATION_CODE.FIELD_REQUIRED,
        context: {
          location: buildCellLocation({
            tableName,
            rowIndex,
            fieldName: issue.field,
            colIndex,
            location
          })
        }
      }
    })

    // Record issues at appropriate severity
    for (const issue of rowIssues) {
      if (classification.outcome === ROW_OUTCOME.REJECTED) {
        issues.addFatal(
          issue.category,
          issue.message,
          issue.code,
          issue.context
        )
      } else {
        issues.addError(
          issue.category,
          issue.message,
          issue.code,
          issue.context
        )
      }
    }

    const rowId = String(rowObject[domainSchema.rowIdField])

    return {
      values: originalRow,
      rowId,
      outcome: classification.outcome,
      issues: rowIssues
    }
  })
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- src/application/summary-logs/validations/data-syntax.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/application/summary-logs/validations/data-syntax.js src/application/summary-logs/validations/data-syntax.test.js
git commit -m "refactor: use classifyRow pipeline in validateRows"
```

---

## Task 5: Update validateTable to Use Domain Schema

Update `validateTable` to work with the adapted domain schema structure.

**Files:**

- Modify: `src/application/summary-logs/validations/data-syntax.js:302-338`

**Step 1: Update validateTable function**

```javascript
/**
 * Validates a single table's data syntax and returns validated table data
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table
 * @param {Object} params.tableData - The table data with headers, rows, and location
 * @param {Object} params.schema - The adapted validation schema for this table
 * @param {Object} params.issues - Validation issues collector
 * @returns {Object} Validated table data with rows converted to ValidatedRow[]
 */
const validateTable = ({ tableName, tableData, schema, issues }) => {
  const { headers, rows, location } = tableData
  const { requiredHeaders, domainSchema } = schema

  validateHeaders({
    tableName,
    headers,
    requiredHeaders,
    location,
    issues
  })

  if (issues.isFatal()) {
    return { ...tableData, rows: [] }
  }

  const headerToIndexMap = buildHeaderToIndexMap(headers)

  const validatedRows = validateRows({
    tableName,
    headerToIndexMap,
    rows,
    domainSchema,
    location,
    issues
  })

  if (issues.isFatal()) {
    return { ...tableData, rows: [] }
  }

  return {
    ...tableData,
    rows: validatedRows
  }
}
```

**Step 2: Update createDataSyntaxValidator to use adapter**

In `createDataSyntaxValidator` (around line 365), update the schema lookup:

```javascript
export const createDataSyntaxValidator = (schemaRegistry) => (parsed) => {
  const issues = createValidationIssues()

  const data = parsed?.data || {}
  const processingType = parsed?.meta?.PROCESSING_TYPE?.value
  const getTableSchema = createTableSchemaGetter(processingType, schemaRegistry)
  const validatedTables = {}

  for (const [tableName, tableData] of Object.entries(data)) {
    const domainSchema = getTableSchema(tableName)

    if (!domainSchema) {
      // Keep unvalidated tables as-is
      validatedTables[tableName] = tableData
      continue
    }

    // Adapt domain schema for validateTable
    const schema = adaptDomainSchema(domainSchema)

    validatedTables[tableName] = validateTable({
      tableName,
      tableData,
      schema,
      issues
    })
  }

  return {
    issues,
    validatedData: {
      ...parsed,
      data: validatedTables
    }
  }
}
```

**Step 3: Run all data-syntax tests**

```bash
npm test -- src/application/summary-logs/validations/data-syntax.test.js
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/application/summary-logs/validations/data-syntax.js
git commit -m "refactor: update validateTable to use domain schema adapter"
```

---

## Task 6: Update classifyLoads to Use Row Outcomes

Replace the issue-based classification with outcome-based classification.

**Files:**

- Modify: `src/application/summary-logs/classify-loads.js:100-126`
- Modify: `src/application/summary-logs/classify-loads.test.js`

**Step 1: Write failing test**

Add a test that verifies outcome-based classification:

```javascript
describe('classifyLoads with row outcomes', () => {
  it('uses row outcome for included/excluded classification', () => {
    const wasteRecords = [
      {
        record: createMockRecord({ rowId: '10001', summaryLogId: 'log-1' }),
        issues: [],
        outcome: 'INCLUDED'
      },
      {
        record: createMockRecord({ rowId: '10002', summaryLogId: 'log-1' }),
        issues: [{ code: 'MISSING_REQUIRED_FIELD' }],
        outcome: 'EXCLUDED'
      }
    ]

    const result = classifyLoads({ wasteRecords, summaryLogId: 'log-1' })

    expect(result.added.included.count).toBe(1)
    expect(result.added.excluded.count).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/application/summary-logs/classify-loads.test.js
```

Expected: FAIL (outcome property not being read)

**Step 3: Update classifyLoads implementation**

In `classify-loads.js`, update the main loop (around line 100-126):

```javascript
/**
 * Classifies loads from transformed records and returns row IDs grouped by classification
 *
 * Classification dimensions:
 * - added: Load was created in this upload
 * - unchanged: Load existed before and wasn't modified in this upload
 * - adjusted: Load existed before and was modified in this upload
 *
 * Validity (based on issues):
 * - valid: Load passes all validation rules (issues.length === 0)
 * - invalid: Load has validation errors (issues.length > 0)
 *
 * Inclusion (based on row outcome from validation pipeline):
 * - included: Row outcome is INCLUDED (contributes to Waste Balance)
 * - excluded: Row outcome is EXCLUDED or REJECTED (does not contribute)
 *
 * Row ID arrays are truncated to 100 entries; totals always reflect the full count.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Array of waste records with validation issues and outcomes
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {Loads} Row IDs grouped by classification and validity
 */
export const classifyLoads = ({ wasteRecords, summaryLogId }) => {
  const loads = createEmptyLoads()

  for (const { record, issues, outcome } of wasteRecords) {
    const classification = classifyRecord(record, summaryLogId)

    // Valid/invalid based on issues
    const validityKey = issues.length > 0 ? 'invalid' : 'valid'
    const validityCategory = loads[classification][validityKey]

    validityCategory.count++
    if (validityCategory.rowIds.length < MAX_ROW_IDS) {
      validityCategory.rowIds.push(record.rowId)
    }

    // Included/excluded based on row outcome from validation pipeline
    const inclusionKey = outcome === 'INCLUDED' ? 'included' : 'excluded'
    const inclusionCategory = loads[classification][inclusionKey]

    inclusionCategory.count++
    if (inclusionCategory.rowIds.length < MAX_ROW_IDS) {
      inclusionCategory.rowIds.push(record.rowId)
    }
  }

  return loads
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- src/application/summary-logs/classify-loads.test.js
```

Expected: PASS

**Step 5: Remove the TODO comment**

The TODO comment at line 115-116 can now be removed as we've integrated classifyRow.

**Step 6: Commit**

```bash
git add src/application/summary-logs/classify-loads.js src/application/summary-logs/classify-loads.test.js
git commit -m "feat: use row outcome for included/excluded classification"
```

---

## Task 7: Flow Outcome Through Transformation

Ensure the outcome flows from validated rows through transformation to waste records.

**Files:**

- Modify: `src/application/waste-records/transform-from-summary-log.js`
- Modify: `src/application/waste-records/transform-from-summary-log.test.js`

**Step 1: Check current transformation**

Review how `transformFromSummaryLog` handles row data. The outcome needs to be preserved when transforming `ValidatedRow` to `ValidatedWasteRecord`.

**Step 2: Write failing test**

```javascript
it('preserves row outcome through transformation', () => {
  const validatedData = {
    data: {
      RECEIVED_LOADS_FOR_REPROCESSING: {
        rows: [
          { rowId: '10001', outcome: 'INCLUDED', issues: [], values: [...] },
          { rowId: '10002', outcome: 'EXCLUDED', issues: [...], values: [...] }
        ]
      }
    }
  }

  const result = transformFromSummaryLog(validatedData, context, existingMap)

  expect(result[0].outcome).toBe('INCLUDED')
  expect(result[1].outcome).toBe('EXCLUDED')
})
```

**Step 3: Update transformation to preserve outcome**

In the transformation code, ensure `outcome` is copied from the validated row to the output record.

**Step 4: Run tests**

```bash
npm test -- src/application/waste-records/transform-from-summary-log.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/application/waste-records/transform-from-summary-log.js src/application/waste-records/transform-from-summary-log.test.js
git commit -m "feat: preserve row outcome through transformation"
```

---

## Task 8: Delete Old Application-Layer Schemas

Remove the now-unused application-layer schema files.

**Files:**

- Delete: `src/application/summary-logs/validations/table-schemas.js`
- Delete: `src/application/summary-logs/validations/table-schemas.schema.js`
- Delete: `src/application/summary-logs/validations/table-schemas.test.js` (if exists)

**Step 1: Run full test suite to ensure nothing depends on old files**

```bash
npm test
```

Expected: PASS (all tests should use domain schemas now)

**Step 2: Delete the files**

```bash
rm src/application/summary-logs/validations/table-schemas.js
rm src/application/summary-logs/validations/table-schemas.schema.js
rm src/application/summary-logs/validations/table-schemas.test.js 2>/dev/null || true
```

**Step 3: Run tests again to confirm**

```bash
npm test
```

Expected: PASS

**Step 4: Commit**

```bash
git add -u src/application/summary-logs/validations/
git commit -m "chore: remove unused application-layer table schemas"
```

---

## Task 9: Clean Up Unused Functions in data-syntax.js

Remove helper functions that are no longer needed after the migration.

**Files:**

- Modify: `src/application/summary-logs/validations/data-syntax.js`

**Step 1: Identify unused functions**

These functions were used by the old dual-schema approach and may no longer be needed:

- `mapJoiTypeToErrorCode` - May still be needed for error code mapping
- `createRowIssues` - Replaced by classifyRow issue handling
- `validateRowAgainstSchema` - Replaced by classifyRow

**Step 2: Remove unused code**

Remove functions that are no longer called. Keep `mapJoiTypeToErrorCode` if it's still used for mapping validation codes.

**Step 3: Run tests**

```bash
npm test -- src/application/summary-logs/validations/data-syntax.test.js
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/application/summary-logs/validations/data-syntax.js
git commit -m "chore: remove unused validation helper functions"
```

---

## Task 10: Update Integration Tests

Ensure integration tests verify the full pipeline produces correct outcomes.

**Files:**

- Modify: `src/application/summary-logs/validate.test.js` (if exists)
- Review: Any integration/journey tests

**Step 1: Write integration test for outcome flow**

```javascript
describe('summary log validation pipeline', () => {
  it('classifies rows as INCLUDED when all validation passes', async () => {
    // Full integration test with valid summary log
  })

  it('classifies rows as EXCLUDED when required fields missing', async () => {
    // Integration test with missing fields
  })

  it('classifies rows as REJECTED when filled fields invalid', async () => {
    // Integration test with invalid ROW_ID
  })
})
```

**Step 2: Run full test suite**

```bash
npm test
```

Expected: PASS

**Step 3: Commit**

```bash
git add .
git commit -m "test: add integration tests for row classification pipeline"
```

---

## Task 11: Final Verification

Run the complete test suite and verify everything works together.

**Step 1: Run all tests**

```bash
npm test
```

Expected: PASS with 100% coverage

**Step 2: Run type checks (if applicable)**

```bash
npx tsc --noEmit
```

Expected: No type errors

**Step 3: Run linting**

```bash
npm run lint
```

Expected: No lint errors

**Step 4: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add .
git commit -m "chore: final cleanup for classifyRow integration"
```

---

## Summary of Changes

| Action       | Files                                                              |
| ------------ | ------------------------------------------------------------------ |
| **Modified** | `src/application/summary-logs/validations/data-syntax.js`          |
| **Modified** | `src/application/summary-logs/validate.js`                         |
| **Modified** | `src/application/summary-logs/classify-loads.js`                   |
| **Modified** | `src/application/waste-records/transform-from-summary-log.js`      |
| **Deleted**  | `src/application/summary-logs/validations/table-schemas.js`        |
| **Deleted**  | `src/application/summary-logs/validations/table-schemas.schema.js` |

## What's NOT in Scope

- **VAL013 (Business rules)** - Accreditation date range checks remain in row transformers per the LLD. This plan only integrates VAL010 and VAL011.
- **Other table schemas** - Only `received-loads-for-reprocessing` has full validation. Other tables remain as placeholders.
- **Row transformer changes** - The LLD notes transformers can downgrade INCLUDED → EXCLUDED via VAL013. That's a separate piece of work.
