/**
 * Generates test files with configurable row counts for performance testing.
 *
 * Usage:
 *   npm run benchmark:generate <source-file> <target-rows> [output-file]
 *
 * Example:
 *   npm run benchmark:generate ./test.xlsx 1000 ./test-1000-rows.xlsx
 *
 * This script:
 * - Preserves all Excel formatting, styles, and validation from the source
 * - Duplicates existing data rows (cycling through them) to reach target count
 * - Updates ROW_ID values to maintain uniqueness
 * - Only modifies data tables (RECEIVED_LOADS_FOR_EXPORT, SENT_ON_LOADS, etc.)
 */
import ExcelJS from 'exceljs'
import { stat } from 'node:fs/promises'

const DATA_MARKER_PREFIX = '__EPR_DATA_'
const SKIP_COLUMN_MARKER = '__EPR_SKIP_COLUMN'
const SKIP_EXAMPLE_TEXT = 'Example'

/**
 * Extracts value from ExcelJS cell, handling formulas and rich text
 */
const extractCellValue = (cellValue) => {
  if (cellValue === null || cellValue === undefined) return null
  if (typeof cellValue !== 'object') return cellValue

  // Date objects first (before formula check as dates are objects)
  if (cellValue instanceof Date) {
    return cellValue
  }

  // Formula cells - check for result property
  if ('formula' in cellValue || 'sharedFormula' in cellValue) {
    // Formula without cached result = empty
    if (!('result' in cellValue) || cellValue.result === undefined) {
      return null
    }
    return extractCellValue(cellValue.result)
  }

  // Rich text cells
  if ('richText' in cellValue && Array.isArray(cellValue.richText)) {
    return cellValue.richText.map((segment) => segment.text).join('')
  }

  // Unknown object type - treat as null to be safe
  return null
}

/**
 * Finds data tables in a worksheet by looking for __EPR_DATA_ markers.
 * Headers are on the SAME row as the marker.
 */
const findDataTables = (worksheet) => {
  const tables = []

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const value = extractCellValue(cell.value)?.toString() || ''
      if (value.startsWith(DATA_MARKER_PREFIX)) {
        const tableName = value.replace(DATA_MARKER_PREFIX, '')

        // Headers are on the same row, starting from the next column
        const headers = []
        let headerCol = colNumber + 1
        let rowIdColIndex = -1

        while (headerCol <= worksheet.columnCount) {
          const headerCell = row.getCell(headerCol)
          const headerValue =
            extractCellValue(headerCell.value)?.toString()?.trim() || ''

          // Empty cell ends headers
          if (!headerValue) break

          // Skip __EPR_SKIP_COLUMN markers but track their position
          if (headerValue === SKIP_COLUMN_MARKER) {
            headers.push(null)
          } else {
            if (headerValue === 'ROW_ID') {
              rowIdColIndex = headers.length
            }
            headers.push(headerValue)
          }
          headerCol++
        }

        tables.push({
          name: tableName,
          markerRow: rowNumber,
          markerCol: colNumber,
          dataStartCol: colNumber + 1,
          headers,
          rowIdColIndex
        })
      }
    })
  })

  return tables
}

/**
 * Extracts data rows for a table (skipping example and human-readable header rows)
 */
const extractDataRows = (worksheet, table) => {
  const { headers, markerRow, dataStartCol, rowIdColIndex } = table
  const dataRows = []

  // Data starts from row after marker (skip human-readable headers in row 2)
  // Row 1 = marker + machine headers
  // Row 2 = human-readable headers (richText)
  // Row 3 = example row
  // Row 4+ = data
  let currentRow = markerRow + 2 // Skip to row 3 (which might be example)

  while (currentRow <= worksheet.rowCount) {
    const row = worksheet.getRow(currentRow)
    const values = []
    let hasContent = false
    let isExampleRow = false

    // Check for "Example" marker - could be in any SKIP_COLUMN or column 1
    // Check marker column first
    const col1Value = extractCellValue(row.getCell(table.markerCol).value)
    if (col1Value === SKIP_EXAMPLE_TEXT) {
      isExampleRow = true
    }
    // Also check all columns for Example (it might be in SKIP_COLUMN positions)
    for (let i = 0; i < headers.length && !isExampleRow; i++) {
      const cellValue = extractCellValue(row.getCell(dataStartCol + i).value)
      if (cellValue === SKIP_EXAMPLE_TEXT) {
        isExampleRow = true
      }
    }

    // Extract values for each header column
    let rowIdValue = null
    for (let i = 0; i < headers.length; i++) {
      const cell = row.getCell(dataStartCol + i)
      const value = extractCellValue(cell.value)
      values.push(value)

      // Track ROW_ID value
      if (headers[i] === 'ROW_ID') {
        rowIdValue = value
      }
    }

    // Use ROW_ID to determine if row has content (matching the parser's approach)
    // The parser skips rows where ROW_ID is null/undefined
    if (rowIdValue !== null && rowIdValue !== undefined && rowIdValue !== '') {
      hasContent = true
    }

    // Stop if we hit an empty row (ROW_ID is null/empty)
    if (!hasContent) {
      currentRow++
      // Check a few more rows in case of sparse data
      let emptyRowCount = 1
      while (emptyRowCount < 5 && currentRow <= worksheet.rowCount) {
        const checkRow = worksheet.getRow(currentRow)
        // Find ROW_ID value for this row
        let checkRowIdValue = null
        for (let i = 0; i < headers.length; i++) {
          if (headers[i] === 'ROW_ID') {
            checkRowIdValue = extractCellValue(
              checkRow.getCell(dataStartCol + i).value
            )
            break
          }
        }
        if (
          checkRowIdValue !== null &&
          checkRowIdValue !== undefined &&
          checkRowIdValue !== ''
        ) {
          // Found more data, continue from here
          hasContent = true
          break
        }
        emptyRowCount++
        currentRow++
      }
      if (!hasContent) break
    }

    if (!isExampleRow && hasContent) {
      dataRows.push({
        rowNumber: currentRow,
        values
      })
    }

    currentRow++
  }

  return dataRows
}

/**
 * Calculates the row offset for the ROW_ID minimum
 * RECEIVED_LOADS tables start at 1000, SENT_ON_LOADS at 4000
 */
const getRowIdMinimum = (tableName) => {
  if (tableName.includes('SENT_ON')) return 4000
  if (tableName.includes('RECEIVED_LOADS')) return 1000
  return 1000
}

/**
 * Fills empty placeholder rows to reach the target count.
 * This is much faster than insertRow() as it populates existing rows.
 */
const expandTable = (worksheet, table, dataRows, targetRows) => {
  const { name, headers, dataStartCol, rowIdColIndex } = table

  if (dataRows.length === 0) {
    console.log(`  Warning: No data rows found in ${name}, skipping`)
    return
  }

  const rowIdMin = getRowIdMinimum(name)
  const existingRowCount = dataRows.length
  const rowsToAdd = targetRows - existingRowCount

  if (rowsToAdd <= 0) {
    console.log(
      `  ${name}: Already has ${existingRowCount} rows (target: ${targetRows})`
    )
    return
  }

  console.log(
    `  ${name}: Expanding from ${existingRowCount} to ${targetRows} rows (+${rowsToAdd})`
  )

  // Find the last data row position - new rows go after this
  const lastDataRowNum = dataRows[dataRows.length - 1].rowNumber

  // Fill existing empty rows (the template has 15000+ placeholder rows)
  // This is MUCH faster than insertRow() which shifts all subsequent rows
  for (let i = 0; i < rowsToAdd; i++) {
    const targetRowNum = lastDataRowNum + 1 + i
    const sourceRowIndex = i % existingRowCount
    const sourceRow = dataRows[sourceRowIndex]
    const newRowId = rowIdMin + existingRowCount + i

    const targetRow = worksheet.getRow(targetRowNum)

    // Copy values from source row to target row
    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const targetCell = targetRow.getCell(dataStartCol + colIndex)
      let value = sourceRow.values[colIndex]

      // Update ROW_ID with sequential value
      if (colIndex === rowIdColIndex) {
        value = newRowId
      }

      targetCell.value = value
    }

    // Log progress every 1000 rows
    if ((i + 1) % 1000 === 0) {
      console.log(`    Progress: ${i + 1}/${rowsToAdd} rows`)
    }
  }
}

const main = async () => {
  const sourcePath = process.argv[2]
  const targetRows = parseInt(process.argv[3], 10)
  const outputPath = process.argv[4]

  if (!sourcePath || !targetRows) {
    console.error(
      'Usage: npm run benchmark:generate <source-file> <target-rows> [output-file]'
    )
    console.error(
      'Example: npm run benchmark:generate ./test.xlsx 1000 ./test-1000-rows.xlsx'
    )
    process.exit(1)
  }

  const defaultOutput = sourcePath.replace(
    /\.xlsx$/,
    `-${targetRows}-rows.xlsx`
  )
  const finalOutputPath = outputPath || defaultOutput

  console.log(`Source: ${sourcePath}`)
  console.log(`Target rows per table: ${targetRows}`)
  console.log(`Output: ${finalOutputPath}`)
  console.log('')

  // Load workbook
  console.log('Loading workbook...')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(sourcePath)

  // Process each worksheet
  for (const worksheet of workbook.worksheets) {
    console.log(`\nProcessing worksheet: ${worksheet.name}`)

    const tables = findDataTables(worksheet)
    if (tables.length === 0) {
      console.log('  No data tables found')
      continue
    }

    for (const table of tables) {
      const dataRows = extractDataRows(worksheet, table)
      console.log(
        `  Found table: ${table.name} (${dataRows.length} rows, headers: ${table.headers.filter(Boolean).length})`
      )
      expandTable(worksheet, table, dataRows, targetRows)
    }
  }

  // Save workbook
  console.log(`\nSaving to ${finalOutputPath}...`)
  await workbook.xlsx.writeFile(finalOutputPath)

  const outputStats = await stat(finalOutputPath)
  const outputSizeMB = (outputStats.size / 1024 / 1024).toFixed(2)
  console.log(`Done! Output file size: ${outputSizeMB} MB`)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
