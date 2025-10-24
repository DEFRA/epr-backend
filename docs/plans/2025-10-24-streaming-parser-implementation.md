# Streaming Marker-Based Parser Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement ADR-17's marker-based parsing using single-pass streaming with state machine.

**Architecture:** Single-pass streaming. Process each row once as it arrives. State machine tracks active data collections. When we hit `__EPR_DATA_` marker, extract headers and mark collection active. Subsequent rows extract data for active collections. Empty row closes collection.

**Tech Stack:** ExcelJS, Vitest, Node.js

**Testing Strategy:**

- ExcelJS-generated workbooks for unit tests
- Real `.xlsx` files for integration tests
- Test behavior: give spreadsheet, expect parsed structure

---

## Task 1: Extract Single Metadata Marker

**Goal:** Parse `__EPR_META_` marker with value to the right.

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`

### Step 1: Write test

```javascript
describe('marker-based parsing', () => {
  it('should extract single metadata marker', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Sheet1')

    worksheet.getCell('A1').value = '__EPR_META_PROCESSING_TYPE'
    worksheet.getCell('B1').value = 'REPROCESSOR'

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await parser.parse(buffer)

    expect(result.meta).toEqual({
      PROCESSING_TYPE: {
        value: 'REPROCESSOR',
        location: { sheet: 'Sheet1', row: 1, column: 'B' }
      }
    })
  })
})
```

### Step 2: Run test (expect fail)

```bash
npm test -- exceljs-parser.test.js
```

### Step 3: Implement

```javascript
async parse(summaryLogBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(summaryLogBuffer)

  const result = { meta: {}, data: {} }

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellValue = cell.value

        if (typeof cellValue === 'string' && cellValue.startsWith('__EPR_META_')) {
          const markerName = cellValue.substring('__EPR_META_'.length)
          const valueCell = row.getCell(colNumber + 1)

          result.meta[markerName] = {
            value: valueCell.value,
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: this.columnToLetter(colNumber + 1)
            }
          }
        }
      })
    })
  })

  return result
}

/**
 * @param {number} colNumber
 * @returns {string}
 */
columnToLetter(colNumber) {
  let column = ''
  while (colNumber > 0) {
    const remainder = (colNumber - 1) % 26
    column = String.fromCharCode(65 + remainder) + column
    colNumber = Math.floor((colNumber - 1) / 26)
  }
  return column
}
```

### Step 4: Run test (expect pass)

```bash
npm test -- exceljs-parser.test.js
```

### Step 5: Commit

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -S -m "feat: extract single metadata marker"
```

---

## Task 2: Extract Data Section Headers and Initialize State

**Goal:** When we hit `__EPR_DATA_` marker, extract headers and initialize collection (but don't extract rows yet).

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`

### Step 1: Write test

```javascript
it('should extract data section headers', async () => {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Sheet1')

  worksheet.getCell('A1').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
  worksheet.getCell('B1').value = 'OUR_REFERENCE'
  worksheet.getCell('C1').value = 'DATE_RECEIVED'

  const buffer = await workbook.xlsx.writeBuffer()
  const result = await parser.parse(buffer)

  expect(result.data).toEqual({
    UPDATE_WASTE_BALANCE: {
      location: { sheet: 'Sheet1', row: 1, column: 'B' },
      headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
      rows: []
    }
  })
})
```

### Step 2: Run test (expect fail)

```bash
npm test -- exceljs-parser.test.js
```

### Step 3: Implement

Add data section marker handling and state tracking:

```javascript
async parse(summaryLogBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(summaryLogBuffer)

  const result = { meta: {}, data: {} }

  workbook.eachSheet((worksheet) => {
    // State: track active collections for this worksheet
    const activeCollections = [] // {sectionName, startCol, endCol, startRow}

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellValue = cell.value

        // Metadata markers
        if (typeof cellValue === 'string' && cellValue.startsWith('__EPR_META_')) {
          const markerName = cellValue.substring('__EPR_META_'.length)
          const valueCell = row.getCell(colNumber + 1)

          result.meta[markerName] = {
            value: valueCell.value,
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: this.columnToLetter(colNumber + 1)
            }
          }
        }
        // Data section markers
        else if (typeof cellValue === 'string' && cellValue.startsWith('__EPR_DATA_')) {
          const sectionName = cellValue.substring('__EPR_DATA_'.length)

          // Extract headers from this row
          const headers = []
          let headerColNumber = colNumber + 1
          let headerCell = row.getCell(headerColNumber)

          while (headerCell.value !== null && headerCell.value !== undefined && headerCell.value !== '') {
            headers.push(headerCell.value)
            headerColNumber++
            headerCell = row.getCell(headerColNumber)
          }

          const startColumn = colNumber + 1
          const endColumn = startColumn + headers.length - 1

          // Initialize data section
          result.data[sectionName] = {
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: this.columnToLetter(startColumn)
            },
            headers,
            rows: []
          }

          // Mark collection as active starting next row
          activeCollections.push({
            sectionName,
            startColumn,
            endColumn,
            startRow: rowNumber + 1
          })
        }
      })
    })
  })

  return result
}
```

### Step 4: Run test (expect pass)

```bash
npm test -- exceljs-parser.test.js
```

### Step 5: Commit

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -S -m "feat: extract data section headers and initialize state"
```

---

## Task 3: Extract Rows for Active Collections

**Goal:** As we stream rows, extract data for any active collections.

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`

### Step 1: Write test

```javascript
it('should extract data rows for active collections', async () => {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Sheet1')

  worksheet.getCell('A1').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
  worksheet.getCell('B1').value = 'OUR_REFERENCE'
  worksheet.getCell('C1').value = 'DATE_RECEIVED'

  worksheet.getCell('B2').value = 12345678910
  worksheet.getCell('C2').value = '2025-05-25'
  worksheet.getCell('B3').value = 98765432100
  worksheet.getCell('C3').value = '2025-05-26'

  const buffer = await workbook.xlsx.writeBuffer()
  const result = await parser.parse(buffer)

  expect(result.data.UPDATE_WASTE_BALANCE.rows).toEqual([
    [12345678910, '2025-05-25'],
    [98765432100, '2025-05-26']
  ])
})
```

### Step 2: Run test (expect fail)

```bash
npm test -- exceljs-parser.test.js
```

### Step 3: Implement

After processing cells for markers, check if this row has data for active collections:

```javascript
worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  // First: scan cells for markers
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const cellValue = cell.value

    // ... existing marker detection code ...
  })

  // Second: extract data for active collections
  const MAX_ROWS_PER_SECTION = 10000

  for (const collection of activeCollections) {
    // Only process if we're past the header row and within limits
    if (
      rowNumber >= collection.startRow &&
      rowNumber < collection.startRow + MAX_ROWS_PER_SECTION
    ) {
      const rowData = []
      let allEmpty = true

      for (
        let col = collection.startColumn;
        col <= collection.endColumn;
        col++
      ) {
        const cell = row.getCell(col)
        const value = cell.value
        rowData.push(value)

        if (value !== null && value !== undefined && value !== '') {
          allEmpty = false
        }
      }

      // If all empty, mark collection as closed
      if (allEmpty) {
        collection.closed = true
      } else if (!collection.closed) {
        result.data[collection.sectionName].rows.push(rowData)
      }
    }
  }
})
```

### Step 4: Run test (expect pass)

```bash
npm test -- exceljs-parser.test.js
```

### Step 5: Commit

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -S -m "feat: extract rows for active collections"
```

---

## Task 4: Handle Skip Column Markers

**Goal:** Replace `__EPR_SKIP_COLUMN` with `null` in headers.

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`

### Step 1: Write test

```javascript
it('should handle skip column markers', async () => {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Sheet1')

  worksheet.getCell('A1').value = '__EPR_DATA_WASTE_RECEIVED'
  worksheet.getCell('B1').value = 'OUR_REFERENCE'
  worksheet.getCell('C1').value = '__EPR_SKIP_COLUMN'
  worksheet.getCell('D1').value = 'SUPPLIER_REF'

  worksheet.getCell('B2').value = 12345
  worksheet.getCell('D2').value = 'ABC123'

  const buffer = await workbook.xlsx.writeBuffer()
  const result = await parser.parse(buffer)

  expect(result.data.WASTE_RECEIVED.headers).toEqual([
    'OUR_REFERENCE',
    null,
    'SUPPLIER_REF'
  ])

  expect(result.data.WASTE_RECEIVED.rows).toEqual([[12345, null, 'ABC123']])
})
```

### Step 2: Run test (expect fail)

```bash
npm test -- exceljs-parser.test.js
```

### Step 3: Implement

Update header extraction:

```javascript
while (
  headerCell.value !== null &&
  headerCell.value !== undefined &&
  headerCell.value !== ''
) {
  if (headerCell.value === '__EPR_SKIP_COLUMN') {
    headers.push(null)
  } else {
    headers.push(headerCell.value)
  }
  headerColNumber++
  headerCell = row.getCell(headerColNumber)
}
```

### Step 4: Run test (expect pass)

```bash
npm test -- exceljs-parser.test.js
```

### Step 5: Commit

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -S -m "feat: handle skip column markers"
```

---

## Task 5: Verify Side-by-Side Tables

**Goal:** Test multiple collections active simultaneously.

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

### Step 1: Write test

```javascript
it('should handle side-by-side tables', async () => {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Sheet1')

  worksheet.getCell('A1').value = '__EPR_DATA_TABLE_ONE'
  worksheet.getCell('B1').value = 'COL1'

  worksheet.getCell('C1').value = '__EPR_DATA_TABLE_TWO'
  worksheet.getCell('D1').value = 'COL2'

  worksheet.getCell('B2').value = 'data1'
  worksheet.getCell('D2').value = 'data2'

  const buffer = await workbook.xlsx.writeBuffer()
  const result = await parser.parse(buffer)

  expect(result.data.TABLE_ONE.rows).toEqual([['data1']])
  expect(result.data.TABLE_TWO.rows).toEqual([['data2']])
})
```

### Step 2: Run test (expect pass)

```bash
npm test -- exceljs-parser.test.js
```

### Step 3: Commit

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -S -m "test: verify side-by-side tables"
```

---

## Task 6: Edge Case Tests

**Goal:** Test empty worksheets, no data rows, sparse data.

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

### Step 1: Write tests

```javascript
it('should handle empty worksheet', async () => {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Empty')

  const buffer = await workbook.xlsx.writeBuffer()
  const result = await parser.parse(buffer)

  expect(result.meta).toEqual({})
  expect(result.data).toEqual({})
})

it('should handle data section with no rows', async () => {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Sheet1')

  worksheet.getCell('A1').value = '__EPR_DATA_SECTION'
  worksheet.getCell('B1').value = 'HEADER'

  const buffer = await workbook.xlsx.writeBuffer()
  const result = await parser.parse(buffer)

  expect(result.data.SECTION.rows).toEqual([])
})

it('should handle sparse data', async () => {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Sheet1')

  worksheet.getCell('A1').value = '__EPR_DATA_SECTION'
  worksheet.getCell('B1').value = 'COL1'
  worksheet.getCell('C1').value = 'COL2'

  worksheet.getCell('B2').value = 'val1'
  // C2 empty

  const buffer = await workbook.xlsx.writeBuffer()
  const result = await parser.parse(buffer)

  expect(result.data.SECTION.rows).toEqual([['val1', null]])
})
```

### Step 2: Run tests (expect pass)

```bash
npm test -- exceljs-parser.test.js
```

### Step 3: Commit

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -S -m "test: add edge case coverage"
```

---

## Task 7: Integration Test with Real File

**Goal:** Test with real `.xlsx` file containing markers.

**Files:**

- Create: `src/data/fixtures/uploads/summary-log-with-markers.xlsx`
- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.test.js`

### Step 1: Create Excel file

Use Excel/LibreOffice to create file with markers.

### Step 2: Write test

```javascript
it('should parse real Excel file', async () => {
  const buffer = await readFile(
    path.join(
      dirname,
      '../../../data/fixtures/uploads/summary-log-with-markers.xlsx'
    )
  )

  const result = await parser.parse(buffer)

  expect(result.meta).toBeDefined()
  expect(result.data).toBeDefined()
})
```

### Step 3: Run test (expect pass)

```bash
npm test -- exceljs-parser.test.js
```

### Step 4: Commit

```bash
git add src/data/fixtures/uploads/summary-log-with-markers.xlsx src/adapters/parsers/summary-logs/exceljs-parser.test.js
git commit -S -m "test: add real Excel file integration test"
```

---

## Task 8: Documentation and Verification

**Goal:** Add JSDoc, run full suite.

**Files:**

- Modify: `src/adapters/parsers/summary-logs/exceljs-parser.js`

### Step 1: Add JSDoc

```javascript
/**
 * Parse Excel buffer containing EPR markers.
 *
 * Single-pass streaming: processes each row once, maintaining state
 * for active data collections.
 *
 * @param {Buffer} summaryLogBuffer
 * @returns {Promise<{meta: Object, data: Object}>}
 */
async parse(summaryLogBuffer) {
  // ...
}
```

### Step 2: Run full suite

```bash
npm test
npx tsc --noEmit
```

### Step 3: Commit

```bash
git add src/adapters/parsers/summary-logs/exceljs-parser.js
git commit -S -m "docs: add JSDoc comments"
```

---

## Completion Checklist

- [ ] All tests pass (100% coverage)
- [ ] Type checking passes
- [ ] Single-pass streaming maintained
- [ ] State machine tracks active collections
- [ ] Ready for PR
