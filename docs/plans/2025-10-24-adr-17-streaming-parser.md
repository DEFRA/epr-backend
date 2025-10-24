# ADR-17 Streaming Parser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement marker-based Excel parsing using streaming state machine as specified in ADR-17

**Architecture:** Streaming state machine that processes cells sequentially, detecting `__EPR_META_*` and `__EPR_DATA_*` markers and extracting associated data without jumping around the spreadsheet. All extraction happens in a single pass through the workbook.

**Tech Stack:** ExcelJS for Excel reading, Vitest for testing, in-memory workbook generation for edge cases

---

## Task 1: Column Number to Letter Converter

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`
- Test: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the failing test**

Add to test file:

```javascript
import { describe, it, expect } from 'vitest'
import { ExcelJSSummaryLogsParser } from './exceljs-parser.js'

describe('ExcelJSSummaryLogsParser', () => {
  describe('columnToLetter', () => {
    it('converts column 1 to A', () => {
      const parser = new ExcelJSSummaryLogsParser()
      expect(parser.columnToLetter(1)).toBe('A')
    })

    it('converts column 26 to Z', () => {
      const parser = new ExcelJSSummaryLogsParser()
      expect(parser.columnToLetter(26)).toBe('Z')
    })

    it('converts column 27 to AA', () => {
      const parser = new ExcelJSSummaryLogsParser()
      expect(parser.columnToLetter(27)).toBe('AA')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- exceljs-parser.test.js`
Expected: FAIL with "parser.columnToLetter is not a function"

**Step 3: Write minimal implementation**

In `exceljs-parser.js`:

```javascript
export class ExcelJSSummaryLogsParser {
  columnToLetter(columnNumber) {
    let result = ''
    let num = columnNumber

    while (num > 0) {
      const remainder = (num - 1) % 26
      result = String.fromCharCode(65 + remainder) + result
      num = Math.floor((num - 1) / 26)
    }

    return result
  }

  letterToColumnNumber(letter) {
    let result = 0
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 64)
    }
    return result
  }

  async parse(summaryLogBuffer) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(summaryLogBuffer)
    return {
      meta: {},
      data: {}
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "feat: add column number to letter converter"
```

---

## Task 2: Extract Single Metadata Marker

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the failing test**

Add to test file:

```javascript
describe('parse', () => {
  it('extracts single metadata marker', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Test')

    sheet.getCell('A1').value = '__EPR_META_PROCESSING_TYPE'
    sheet.getCell('B1').value = 'REPROCESSOR'

    const buffer = await workbook.xlsx.writeBuffer()

    const parser = new ExcelJSSummaryLogsParser()
    const result = await parser.parse(buffer)

    expect(result.meta.PROCESSING_TYPE).toEqual({
      value: 'REPROCESSOR',
      location: { sheet: 'Test', row: 1, column: 'B' }
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- exceljs-parser.test.js`
Expected: FAIL with "expected undefined to equal { value: 'REPROCESSOR', ... }"

**Step 3: Write minimal implementation**

Replace `parse` method in `exceljs-parser.js`:

```javascript
async parse(summaryLogBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(summaryLogBuffer)

  const result = { meta: {}, data: {} }
  let metadataContext = null
  const activeCollections = []

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const cellValue = cell.value?.toString() || ''

        // Check for metadata marker
        if (!metadataContext && cellValue.startsWith('__EPR_META_')) {
          const metadataName = cellValue.replace('__EPR_META_', '')
          metadataContext = {
            metadataName,
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: this.columnToLetter(colNumber + 1)
            }
          }
        } else if (metadataContext) {
          // Capture metadata value
          result.meta[metadataContext.metadataName] = {
            value: cellValue,
            location: metadataContext.location
          }
          metadataContext = null
        }
      })
    })
  })

  return result
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "feat: extract single metadata marker"
```

---

## Task 3: Extract Multiple Metadata Markers

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the failing test**

Add to test file:

```javascript
it('extracts multiple metadata markers', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Test')

  sheet.getCell('A1').value = '__EPR_META_PROCESSING_TYPE'
  sheet.getCell('B1').value = 'REPROCESSOR'
  sheet.getCell('A2').value = '__EPR_META_MATERIAL'
  sheet.getCell('B2').value = 'Paper and board'

  const buffer = await workbook.xlsx.writeBuffer()

  const parser = new ExcelJSSummaryLogsParser()
  const result = await parser.parse(buffer)

  expect(result.meta.PROCESSING_TYPE).toEqual({
    value: 'REPROCESSOR',
    location: { sheet: 'Test', row: 1, column: 'B' }
  })
  expect(result.meta.MATERIAL).toEqual({
    value: 'Paper and board',
    location: { sheet: 'Test', row: 2, column: 'B' }
  })
})
```

**Step 2: Run test to verify it passes (no change needed)**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (5 tests) - implementation already handles this

**Step 3: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "test: verify multiple metadata markers"
```

---

## Task 4: Extract Data Section Headers

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the failing test**

Add to test file:

```javascript
it('extracts data section headers', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Test')

  sheet.getCell('A1').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
  sheet.getCell('B1').value = 'OUR_REFERENCE'
  sheet.getCell('C1').value = 'DATE_RECEIVED'

  const buffer = await workbook.xlsx.writeBuffer()

  const parser = new ExcelJSSummaryLogsParser()
  const result = await parser.parse(buffer)

  expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
    location: { sheet: 'Test', row: 1, column: 'B' },
    headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
    rows: []
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- exceljs-parser.test.js`
Expected: FAIL with "expected undefined to equal { location: ..., headers: ..., rows: [] }"

**Step 3: Write minimal implementation**

Update parse method in `exceljs-parser.js`:

```javascript
async parse(summaryLogBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(summaryLogBuffer)

  const result = { meta: {}, data: {} }
  let metadataContext = null
  const activeCollections = []

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const cellValue = cell.value?.toString() || ''

        // Check for metadata marker
        if (!metadataContext && cellValue.startsWith('__EPR_META_')) {
          const metadataName = cellValue.replace('__EPR_META_', '')
          metadataContext = {
            metadataName,
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: this.columnToLetter(colNumber + 1)
            }
          }
        } else if (metadataContext) {
          // Capture metadata value
          result.meta[metadataContext.metadataName] = {
            value: cellValue,
            location: metadataContext.location
          }
          metadataContext = null
        }

        // Check for data marker
        if (cellValue.startsWith('__EPR_DATA_')) {
          const sectionName = cellValue.replace('__EPR_DATA_', '')
          activeCollections.push({
            sectionName,
            state: 'HEADERS',
            startColumn: colNumber + 1,
            headers: [],
            rows: [],
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: this.columnToLetter(colNumber + 1)
            }
          })
        }

        // Process active collections
        activeCollections.forEach((collection) => {
          if (colNumber >= collection.startColumn) {
            if (collection.state === 'HEADERS') {
              if (cellValue === '') {
                // Empty cell marks end of headers
                collection.state = 'ROWS'
              } else {
                collection.headers.push(cellValue)
              }
            }
          }
        })
      })

      // At end of row, emit collections that have headers and no rows yet
      activeCollections.forEach((collection) => {
        if (collection.state === 'HEADERS') {
          collection.state = 'ROWS'
        }
      })

      // Emit collections with headers but no rows (empty table)
      const toEmit = activeCollections.filter(
        (c) => c.state === 'ROWS' && c.rows.length === 0
      )
      toEmit.forEach((collection) => {
        result.data[collection.sectionName] = {
          location: collection.location,
          headers: collection.headers,
          rows: []
        }
      })
      activeCollections.splice(
        0,
        activeCollections.length,
        ...activeCollections.filter((c) => !toEmit.includes(c))
      )
    })
  })

  return result
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "feat: extract data section headers"
```

---

## Task 5: Extract Data Section Rows

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the failing test**

Add to test file:

```javascript
it('extracts data section with rows', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Test')

  sheet.getCell('A1').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
  sheet.getCell('B1').value = 'OUR_REFERENCE'
  sheet.getCell('C1').value = 'DATE_RECEIVED'
  sheet.getCell('B2').value = 12345678910
  sheet.getCell('C2').value = '2025-05-25'
  sheet.getCell('B3').value = 98765432100
  sheet.getCell('C3').value = '2025-05-26'

  const buffer = await workbook.xlsx.writeBuffer()

  const parser = new ExcelJSSummaryLogsParser()
  const result = await parser.parse(buffer)

  expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
    location: { sheet: 'Test', row: 1, column: 'B' },
    headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
    rows: [
      [12345678910, '2025-05-25'],
      [98765432100, '2025-05-26']
    ]
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- exceljs-parser.test.js`
Expected: FAIL with "expected rows: [] to equal rows: [[...], [...]]"

**Step 3: Write minimal implementation**

Update parse method in `exceljs-parser.js` to handle row capture:

```javascript
async parse(summaryLogBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(summaryLogBuffer)

  const result = { meta: {}, data: {} }
  let metadataContext = null
  const activeCollections = []

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row, rowNumber) => {
      const cells = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells.push({ cell, colNumber })
      })

      // Initialize current row for each active collection in ROWS state
      activeCollections.forEach((collection) => {
        if (collection.state === 'ROWS') {
          collection.currentRow = []
        }
      })

      // Process each cell
      cells.forEach(({ cell, colNumber }) => {
        const cellValue = cell.value?.toString() || ''

        // Check for metadata marker
        if (!metadataContext && cellValue.startsWith('__EPR_META_')) {
          const metadataName = cellValue.replace('__EPR_META_', '')
          metadataContext = {
            metadataName,
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: this.columnToLetter(colNumber + 1)
            }
          }
        } else if (metadataContext) {
          // Capture metadata value
          result.meta[metadataContext.metadataName] = {
            value: cellValue,
            location: metadataContext.location
          }
          metadataContext = null
        }

        // Check for data marker
        if (cellValue.startsWith('__EPR_DATA_')) {
          const sectionName = cellValue.replace('__EPR_DATA_', '')
          activeCollections.push({
            sectionName,
            state: 'HEADERS',
            startColumn: colNumber + 1,
            headers: [],
            rows: [],
            currentRow: [],
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: this.columnToLetter(colNumber + 1)
            }
          })
        }

        // Process active collections
        activeCollections.forEach((collection) => {
          const columnIndex = colNumber - collection.startColumn

          if (columnIndex >= 0 && columnIndex < collection.headers.length) {
            if (collection.state === 'HEADERS') {
              if (cellValue === '') {
                collection.state = 'ROWS'
              } else {
                collection.headers.push(cellValue)
              }
            } else if (collection.state === 'ROWS') {
              // Add cell value to current row
              collection.currentRow.push(cell.value === null || cell.value === undefined || cell.value === '' ? null : cell.value)
            }
          } else if (columnIndex >= 0 && collection.state === 'HEADERS') {
            // Still capturing headers
            if (cellValue === '') {
              collection.state = 'ROWS'
            } else {
              collection.headers.push(cellValue)
            }
          }
        })
      })

      // At end of row, process collections
      activeCollections.forEach((collection) => {
        if (collection.state === 'HEADERS') {
          collection.state = 'ROWS'
        } else if (collection.state === 'ROWS' && collection.currentRow.length > 0) {
          // Check if row is all empty
          const isEmptyRow = collection.currentRow.every((val) => val === null)

          if (isEmptyRow) {
            // Emit collection and mark for removal
            result.data[collection.sectionName] = {
              location: collection.location,
              headers: collection.headers,
              rows: collection.rows
            }
            collection.complete = true
          } else {
            // Append row to collection
            collection.rows.push(collection.currentRow)
          }
        }
      })

      // Remove completed collections
      activeCollections.splice(
        0,
        activeCollections.length,
        ...activeCollections.filter((c) => !c.complete)
      )
    })

    // At end of worksheet, emit remaining collections
    activeCollections.forEach((collection) => {
      result.data[collection.sectionName] = {
        location: collection.location,
        headers: collection.headers,
        rows: collection.rows
      }
    })
    activeCollections.splice(0, activeCollections.length)
  })

  return result
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "feat: extract data section rows"
```

---

## Task 6: Handle Skip Column Markers

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the failing test**

Add to test file:

```javascript
it('handles skip column markers', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Test')

  sheet.getCell('A1').value = '__EPR_DATA_WASTE_RECEIVED'
  sheet.getCell('B1').value = 'OUR_REFERENCE'
  sheet.getCell('C1').value = 'DATE_RECEIVED'
  sheet.getCell('D1').value = '__EPR_SKIP_COLUMN'
  sheet.getCell('E1').value = 'SUPPLIER_REF'
  sheet.getCell('F1').value = 'SUPPLIER_NAME'
  sheet.getCell('B2').value = 12345678910
  sheet.getCell('C2').value = '2025-05-25'
  sheet.getCell('E2').value = 'ABC123'
  sheet.getCell('F2').value = 'Joe Blogs'

  const buffer = await workbook.xlsx.writeBuffer()

  const parser = new ExcelJSSummaryLogsParser()
  const result = await parser.parse(buffer)

  expect(result.data.WASTE_RECEIVED).toEqual({
    location: { sheet: 'Test', row: 1, column: 'B' },
    headers: [
      'OUR_REFERENCE',
      'DATE_RECEIVED',
      null,
      'SUPPLIER_REF',
      'SUPPLIER_NAME'
    ],
    rows: [[12345678910, '2025-05-25', null, 'ABC123', 'Joe Blogs']]
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- exceljs-parser.test.js`
Expected: FAIL - headers will have '\_\_EPR_SKIP_COLUMN' instead of null

**Step 3: Write minimal implementation**

Update the header capture logic in the activeCollections processing:

Find this section in the parse method:

```javascript
} else if (columnIndex >= 0 && collection.state === 'HEADERS') {
  // Still capturing headers
  if (cellValue === '') {
    collection.state = 'ROWS'
  } else {
    collection.headers.push(cellValue)
  }
}
```

Replace with:

```javascript
} else if (columnIndex >= 0 && collection.state === 'HEADERS') {
  // Still capturing headers
  if (cellValue === '') {
    collection.state = 'ROWS'
  } else if (cellValue === '__EPR_SKIP_COLUMN') {
    collection.headers.push(null)
  } else {
    collection.headers.push(cellValue)
  }
}
```

Also update the first header capture section:

```javascript
if (columnIndex >= 0 && columnIndex < collection.headers.length) {
  if (collection.state === 'HEADERS') {
    if (cellValue === '') {
      collection.state = 'ROWS'
    } else {
      collection.headers.push(cellValue)
    }
  }
```

Replace with:

```javascript
if (columnIndex >= 0 && columnIndex < collection.headers.length) {
  if (collection.state === 'HEADERS') {
    if (cellValue === '') {
      collection.state = 'ROWS'
    } else if (cellValue === '__EPR_SKIP_COLUMN') {
      collection.headers.push(null)
    } else {
      collection.headers.push(cellValue)
    }
  }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "feat: handle skip column markers"
```

---

## Task 7: Handle Side-by-Side Tables

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the failing test**

Add to test file:

```javascript
it('handles side-by-side tables', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Test')

  sheet.getCell('A1').value = '__EPR_DATA_TABLE_ONE'
  sheet.getCell('B1').value = 'COL_A'
  sheet.getCell('C1').value = 'COL_B'
  sheet.getCell('D1').value = '__EPR_DATA_TABLE_TWO'
  sheet.getCell('E1').value = 'COL_X'
  sheet.getCell('F1').value = 'COL_Y'
  sheet.getCell('B2').value = 'A1'
  sheet.getCell('C2').value = 'B1'
  sheet.getCell('E2').value = 'X1'
  sheet.getCell('F2').value = 'Y1'

  const buffer = await workbook.xlsx.writeBuffer()

  const parser = new ExcelJSSummaryLogsParser()
  const result = await parser.parse(buffer)

  expect(result.data.TABLE_ONE).toEqual({
    location: { sheet: 'Test', row: 1, column: 'B' },
    headers: ['COL_A', 'COL_B'],
    rows: [['A1', 'B1']]
  })
  expect(result.data.TABLE_TWO).toEqual({
    location: { sheet: 'Test', row: 1, column: 'E' },
    headers: ['COL_X', 'COL_Y'],
    rows: [['X1', 'Y1']]
  })
})
```

**Step 2: Run test to verify it passes (no change needed)**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (9 tests) - current implementation should already handle this due to state machine design

**Step 3: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "test: verify side-by-side tables work"
```

---

## Task 8: Edge Case - Empty Cells in Rows

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the failing test**

Add to test file:

```javascript
it('handles sparse data with missing cells', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Test')

  sheet.getCell('A1').value = '__EPR_DATA_SPARSE'
  sheet.getCell('B1').value = 'COL_A'
  sheet.getCell('C1').value = 'COL_B'
  sheet.getCell('D1').value = 'COL_C'
  sheet.getCell('B2').value = 'A1'
  // C2 is empty
  sheet.getCell('D2').value = 'C1'

  const buffer = await workbook.xlsx.writeBuffer()

  const parser = new ExcelJSSummaryLogsParser()
  const result = await parser.parse(buffer)

  expect(result.data.SPARSE).toEqual({
    location: { sheet: 'Test', row: 1, column: 'B' },
    headers: ['COL_A', 'COL_B', 'COL_C'],
    rows: [['A1', null, 'C1']]
  })
})
```

**Step 2: Run test to verify it passes (likely already works)**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (10 tests) - implementation should handle this

**Step 3: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "test: verify sparse data handling"
```

---

## Task 9: Integration Test with Realistic Structure

**Files:**

- Create: `src/adapters/parsers/summary-logs/fixtures/realistic-summary-log.xlsx` (create programmatically in test)
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

**Step 1: Write the integration test**

Add to test file:

```javascript
it('handles realistic summary log structure', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')

  // Metadata at top
  sheet.getCell('A1').value = '__EPR_META_PROCESSING_TYPE'
  sheet.getCell('B1').value = 'REPROCESSOR'
  sheet.getCell('A2').value = '__EPR_META_MATERIAL'
  sheet.getCell('B2').value = 'Paper and board'

  // Data section
  sheet.getCell('A4').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
  sheet.getCell('B4').value = 'OUR_REFERENCE'
  sheet.getCell('C4').value = 'DATE_RECEIVED'
  sheet.getCell('B5').value = 12345678910
  sheet.getCell('C5').value = '2025-05-25'
  sheet.getCell('B6').value = 98765432100
  sheet.getCell('C6').value = '2025-05-26'

  const buffer = await workbook.xlsx.writeBuffer()

  const parser = new ExcelJSSummaryLogsParser()
  const result = await parser.parse(buffer)

  expect(result.meta.PROCESSING_TYPE).toEqual({
    value: 'REPROCESSOR',
    location: { sheet: 'Data', row: 1, column: 'B' }
  })
  expect(result.meta.MATERIAL).toEqual({
    value: 'Paper and board',
    location: { sheet: 'Data', row: 2, column: 'B' }
  })
  expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
    location: { sheet: 'Data', row: 4, column: 'B' },
    headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
    rows: [
      [12345678910, '2025-05-25'],
      [98765432100, '2025-05-26']
    ]
  })
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- exceljs-parser.test.js`
Expected: PASS (11 tests)

**Step 3: Commit**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "test: add realistic integration test"
```

---

## Task 10: Verify All Tests Pass and Coverage

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass with 100% coverage

**Step 2: Check coverage report**

Review coverage output - ensure `exceljs-parser.js` shows 100% coverage

**Step 3: If coverage gaps exist**

Add tests for any uncovered branches/lines

**Step 4: Final commit if needed**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -m "test: achieve 100% coverage"
```

---

## Task 11: Run SonarCloud Analysis

**Step 1: Run local SonarCloud scan**

```bash
docker run --rm -e SONAR_HOST_URL='https://sonarcloud.io' -e SONAR_TOKEN=$SONAR_TOKEN \
  -v "/Users/graemefoster/Development/Defra/epr-backend:/Users/graemefoster/Development/Defra/epr-backend" \
  -w "/Users/graemefoster/Development/Defra/epr-backend/PAE-415-parse-summary-log" \
  sonarsource/sonar-scanner-cli
```

**Step 2: Review results**

Check for any code smells, duplication, or quality issues

**Step 3: Fix any issues**

If magic numbers exist, extract to constants
If duplication exists, refactor to helpers

**Step 4: Re-run analysis**

Repeat until clean

**Step 5: Commit fixes**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js
git commit -m "refactor: address SonarCloud issues"
```

---

## Task 12: Run Type Checks

**Step 1: Copy tsconfig if needed**

```bash
cp ../main/tsconfig.json .
```

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

**Step 3: Fix any type errors**

Add JSDoc type annotations if needed

**Step 4: Commit fixes**

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js
git commit -m "fix: address type errors"
```

---

## Completion Checklist

- [ ] All tests pass
- [ ] 100% code coverage maintained
- [ ] SonarCloud analysis clean
- [ ] Type checks pass
- [ ] All code committed
- [ ] Ready for PR

**Next:** Use `/pr` command to create pull request
