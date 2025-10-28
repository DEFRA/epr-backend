import ExcelJS from 'exceljs'
import { produce } from 'immer'

/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogParser} SummaryLogParser */

const ALPHABET_SIZE = 26
const ASCII_CODE_OFFSET = 65

const META_PREFIX = '__EPR_META_'
const DATA_PREFIX = '__EPR_DATA_'
const SKIP_COLUMN = '__EPR_SKIP_COLUMN'

const CollectionState = {
  HEADERS: 'HEADERS',
  ROWS: 'ROWS'
}

/**
 * @param {number} colNumber
 * @returns {string}
 */
const columnToLetter = (colNumber) => {
  const toLetterRecursive = (n, acc = '') => {
    if (n <= 0) return acc
    const remainder = (n - 1) % ALPHABET_SIZE
    const letter = String.fromCodePoint(ASCII_CODE_OFFSET + remainder)
    return toLetterRecursive(Math.floor((n - 1) / ALPHABET_SIZE), letter + acc)
  }
  return toLetterRecursive(colNumber)
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
  draftState
) => {
  if (!draftState.metadataContext && cellValueStr.startsWith(META_PREFIX)) {
    const metadataName = cellValueStr.replace(META_PREFIX, '')
    if (draftState.result.meta[metadataName]) {
      throw new Error(`Duplicate metadata name: ${metadataName}`)
    }
    draftState.metadataContext = { metadataName }
  } else if (draftState.metadataContext) {
    if (cellValueStr.startsWith(META_PREFIX)) {
      throw new Error(
        'Malformed sheet: metadata marker found in value position'
      )
    }
    draftState.result.meta[draftState.metadataContext.metadataName] = {
      value: cellValue,
      location: {
        sheet: worksheet.name,
        row: rowNumber,
        column: columnToLetter(colNumber)
      }
    }
    draftState.metadataContext = null
  }
}

const processDataMarker = (
  cellValueStr,
  worksheet,
  rowNumber,
  colNumber,
  draftCollections
) => {
  if (cellValueStr.startsWith(DATA_PREFIX)) {
    draftCollections.push({
      sectionName: cellValueStr.replace(DATA_PREFIX, ''),
      state: CollectionState.HEADERS,
      startColumn: colNumber + 1,
      headers: [],
      rows: [],
      currentRow: [],
      location: {
        sheet: worksheet.name,
        row: rowNumber,
        column: columnToLetter(colNumber + 1)
      }
    })
  }
}

const processHeaderCell = (draftCollection, cellValueStr) => {
  if (cellValueStr === '') {
    draftCollection.state = CollectionState.ROWS
  } else if (cellValueStr === SKIP_COLUMN) {
    draftCollection.headers.push(null)
  } else {
    draftCollection.headers.push(cellValueStr)
  }
}

const processRowCell = (draftCollection, cellValue) => {
  const normalisedValue =
    cellValue === null || cellValue === undefined || cellValue === ''
      ? null
      : cellValue
  draftCollection.currentRow.push(normalisedValue)
}

const updateCollectionWithCell = (
  draftCollection,
  cellValue,
  cellValueStr,
  colNumber
) => {
  const columnIndex = colNumber - draftCollection.startColumn

  if (columnIndex >= 0 && draftCollection.state === CollectionState.HEADERS) {
    processHeaderCell(draftCollection, cellValueStr)
  } else if (
    columnIndex >= 0 &&
    columnIndex < draftCollection.headers.length &&
    draftCollection.state === CollectionState.ROWS
  ) {
    processRowCell(draftCollection, cellValue)
  }
}

const finalizeRowForCollection = (draftCollection) => {
  if (draftCollection.state === CollectionState.HEADERS) {
    draftCollection.state = CollectionState.ROWS
    draftCollection.currentRow = []
  } else if (
    draftCollection.state === CollectionState.ROWS &&
    draftCollection.currentRow.length > 0
  ) {
    const isEmptyRow = draftCollection.currentRow.every((val) => val === null)
    if (isEmptyRow) {
      draftCollection.complete = true
    } else {
      draftCollection.rows.push(draftCollection.currentRow)
      draftCollection.currentRow = []
    }
  }
}

const emitCollectionsToResult = (draftResult, collections) => {
  for (const collection of collections) {
    if (draftResult[collection.sectionName]) {
      throw new Error(`Duplicate data section name: ${collection.sectionName}`)
    }
    draftResult[collection.sectionName] = {
      location: collection.location,
      headers: collection.headers,
      rows: collection.rows
    }
  }
}

const collectRowsFromWorksheet = (worksheet) => {
  const rows = []
  worksheet.eachRow((row, rowNumber) => {
    rows.push({ row, rowNumber })
  })
  return rows
}

const collectCellsFromRow = (row) => {
  const cells = []
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cells.push({ cell, colNumber })
  })
  return cells
}

const processRow = (draftState, row, rowNumber, worksheet) => {
  const cells = collectCellsFromRow(row)

  for (const collection of draftState.activeCollections) {
    collection.currentRow = []
  }

  for (const { cell, colNumber } of cells) {
    const rawCellValue = cell.value
    const cellValue = extractCellValue(rawCellValue)
    const cellValueStr = cellValue?.toString() || ''

    processCellForMetadata(
      cellValue,
      cellValueStr,
      worksheet,
      rowNumber,
      colNumber,
      draftState
    )

    processDataMarker(
      cellValueStr,
      worksheet,
      rowNumber,
      colNumber,
      draftState.activeCollections
    )

    for (const collection of draftState.activeCollections) {
      updateCollectionWithCell(collection, cellValue, cellValueStr, colNumber)
    }
  }

  const completedCollections = []
  const activeCollections = []

  for (const collection of draftState.activeCollections) {
    finalizeRowForCollection(collection)
    if (collection.complete) {
      completedCollections.push(collection)
    } else {
      activeCollections.push(collection)
    }
  }

  emitCollectionsToResult(draftState.result.data, completedCollections)
  draftState.activeCollections = activeCollections
}

const processWorksheet = (draftState, worksheet) => {
  const rows = collectRowsFromWorksheet(worksheet)

  for (const { row, rowNumber } of rows) {
    processRow(draftState, row, rowNumber, worksheet)
  }

  emitCollectionsToResult(draftState.result.data, draftState.activeCollections)
  draftState.activeCollections = []
}

/** @type {SummaryLogParser} */
export const parse = async (summaryLogBuffer) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(summaryLogBuffer)

  const initialState = {
    result: { meta: {}, data: {} },
    activeCollections: [],
    metadataContext: null
  }

  return produce(initialState, (draft) => {
    for (const worksheet of workbook.worksheets) {
      processWorksheet(draft, worksheet)
    }
  }).result
}
