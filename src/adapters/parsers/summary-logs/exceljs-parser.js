import ExcelJS from 'exceljs'

/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogParser} SummaryLogParser */

const ALPHABET_SIZE = 26
const ASCII_CODE_OFFSET = 65

/**
 * @param {number} colNumber
 * @returns {string}
 */
const columnToLetter = (colNumber) => {
  let column = ''
  while (colNumber > 0) {
    const remainder = (colNumber - 1) % ALPHABET_SIZE
    column = String.fromCodePoint(ASCII_CODE_OFFSET + remainder) + column
    colNumber = Math.floor((colNumber - 1) / ALPHABET_SIZE)
  }
  return column
}

const extractCellValue = (cellValue) => {
  if (
    cellValue &&
    typeof cellValue === 'object' &&
    'formula' in cellValue &&
    'result' in cellValue
  ) {
    return cellValue.result
  }
  if (cellValue && typeof cellValue === 'object' && 'formula' in cellValue) {
    return null
  }
  return cellValue
}

const processCellForMetadata = (
  cellValue,
  cellValueStr,
  worksheet,
  rowNumber,
  colNumber,
  state
) => {
  if (!state.metadataContext && cellValueStr.startsWith('__EPR_META_')) {
    const metadataName = cellValueStr.replace('__EPR_META_', '')
    if (state.result.meta[metadataName]) {
      throw new Error(`Duplicate metadata name: ${metadataName}`)
    }
    return {
      ...state,
      metadataContext: {
        metadataName
      }
    }
  } else if (state.metadataContext) {
    if (cellValueStr.startsWith('__EPR_META_')) {
      throw new Error(
        'Malformed sheet: metadata marker found in value position'
      )
    }
    return {
      ...state,
      result: {
        ...state.result,
        meta: {
          ...state.result.meta,
          [state.metadataContext.metadataName]: {
            value: cellValue,
            location: {
              sheet: worksheet.name,
              row: rowNumber,
              column: columnToLetter(colNumber)
            }
          }
        }
      },
      metadataContext: null
    }
  } else {
    return state
  }
}

const processDataMarker = (
  cellValueStr,
  worksheet,
  rowNumber,
  colNumber,
  collections
) => {
  if (!cellValueStr.startsWith('__EPR_DATA_')) {
    return collections
  }

  return [
    ...collections,
    {
      sectionName: cellValueStr.replace('__EPR_DATA_', ''),
      state: 'HEADERS',
      startColumn: colNumber + 1,
      headers: [],
      rows: [],
      currentRow: [],
      location: {
        sheet: worksheet.name,
        row: rowNumber,
        column: columnToLetter(colNumber + 1)
      }
    }
  ]
}

const processHeaderCell = (collection, cellValueStr) => {
  if (cellValueStr === '') {
    return { ...collection, state: 'ROWS' }
  } else if (cellValueStr === '__EPR_SKIP_COLUMN') {
    return { ...collection, headers: [...collection.headers, null] }
  } else {
    return { ...collection, headers: [...collection.headers, cellValueStr] }
  }
}

const processRowCell = (collection, cellValue) => {
  const normalizedValue =
    cellValue === null || cellValue === undefined || cellValue === ''
      ? null
      : cellValue
  return {
    ...collection,
    currentRow: [...collection.currentRow, normalizedValue]
  }
}

const updateCollectionWithCell = (
  collection,
  cellValue,
  cellValueStr,
  colNumber
) => {
  const columnIndex = colNumber - collection.startColumn

  if (columnIndex >= 0 && collection.state === 'HEADERS') {
    return processHeaderCell(collection, cellValueStr)
  } else if (
    columnIndex >= 0 &&
    columnIndex < collection.headers.length &&
    collection.state === 'ROWS'
  ) {
    return processRowCell(collection, cellValue)
  } else {
    return collection
  }
}

const finalizeRowForCollection = (collection) => {
  if (collection.state === 'HEADERS') {
    return { ...collection, state: 'ROWS', currentRow: [] }
  } else if (collection.state === 'ROWS' && collection.currentRow.length > 0) {
    const isEmptyRow = collection.currentRow.every((val) => val === null)
    if (isEmptyRow) {
      return { ...collection, complete: true }
    } else {
      return {
        ...collection,
        rows: [...collection.rows, collection.currentRow],
        currentRow: []
      }
    }
  } else {
    return collection
  }
}

const emitCollectionsToResult = (state, collections) => {
  for (const collection of collections) {
    if (state.result.data[collection.sectionName]) {
      throw new Error(`Duplicate data section name: ${collection.sectionName}`)
    }
    state.result.data[collection.sectionName] = {
      location: collection.location,
      headers: collection.headers,
      rows: collection.rows
    }
  }
}

/**
 * Parses an Excel summary log buffer and extracts metadata and tabular data sections.
 *
 * Recognizes two types of markers in the spreadsheet:
 * - Metadata markers: `__EPR_META_<NAME>` followed by a value in the next cell
 * - Data section markers: `__EPR_DATA_<NAME>` followed by column headers, then rows of data
 *
 * Data sections continue until an empty row is encountered or the worksheet ends.
 * Column headers can include `__EPR_SKIP_COLUMN` to mark columns that should be captured but have no header name.
 *
 * @type {SummaryLogParser}
 *
 * @example
 * const result = await parse(excelBuffer)
 * // result.meta.PROCESSING_TYPE = { value: 'REPROCESSOR', location: { sheet: 'Sheet1', row: 1, column: 'B' } }
 * // result.data.UPDATE_WASTE_BALANCE = { location: {...}, headers: ['REF', 'DATE'], rows: [[123, '2025-01-01']] }
 */
export const parse = async (summaryLogBuffer) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(summaryLogBuffer)

  let state = {
    result: { meta: {}, data: {} },
    activeCollections: [],
    metadataContext: null
  }

  for (const worksheet of workbook.worksheets) {
    const rows = []
    worksheet.eachRow((row, rowNumber) => {
      rows.push({ row, rowNumber })
    })

    for (const { row, rowNumber } of rows) {
      const cells = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells.push({ cell, colNumber })
      })

      // Initialize currentRow for all active collections
      state.activeCollections = state.activeCollections.map((c) => ({
        ...c,
        currentRow: []
      }))

      // Process cells with reduce
      state = cells.reduce((acc, { cell, colNumber }) => {
        const rawCellValue = cell.value
        const cellValue = extractCellValue(rawCellValue)
        const cellValueStr = cellValue?.toString() || ''

        const stateAfterMetadata = processCellForMetadata(
          cellValue,
          cellValueStr,
          worksheet,
          rowNumber,
          colNumber,
          acc
        )

        const collectionsAfterMarkers = processDataMarker(
          cellValueStr,
          worksheet,
          rowNumber,
          colNumber,
          stateAfterMetadata.activeCollections
        )

        const updatedCollections = collectionsAfterMarkers.map((collection) =>
          updateCollectionWithCell(
            collection,
            cellValue,
            cellValueStr,
            colNumber
          )
        )

        return {
          ...stateAfterMetadata,
          activeCollections: updatedCollections
        }
      }, state)

      // Finalize row for each collection
      state.activeCollections = state.activeCollections.map((c) =>
        finalizeRowForCollection(c)
      )

      // Emit completed collections and filter them out
      const completedCollections = state.activeCollections.filter(
        (c) => c.complete
      )
      emitCollectionsToResult(state, completedCollections)
      state.activeCollections = state.activeCollections.filter(
        (c) => !c.complete
      )
    }

    // Emit remaining collections at worksheet end
    emitCollectionsToResult(state, state.activeCollections)
    state.activeCollections = []
  }

  return state.result
}
