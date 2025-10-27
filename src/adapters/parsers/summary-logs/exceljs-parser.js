import ExcelJS from 'exceljs'

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
  if (!state.metadataContext && cellValueStr.startsWith(META_PREFIX)) {
    const metadataName = cellValueStr.replace(META_PREFIX, '')
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
    if (cellValueStr.startsWith(META_PREFIX)) {
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
  if (!cellValueStr.startsWith(DATA_PREFIX)) {
    return collections
  }

  return [
    ...collections,
    {
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
    }
  ]
}

const processHeaderCell = (collection, cellValueStr) => {
  if (cellValueStr === '') {
    return { ...collection, state: CollectionState.ROWS }
  } else if (cellValueStr === SKIP_COLUMN) {
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

  if (columnIndex >= 0 && collection.state === CollectionState.HEADERS) {
    return processHeaderCell(collection, cellValueStr)
  } else if (
    columnIndex >= 0 &&
    columnIndex < collection.headers.length &&
    collection.state === CollectionState.ROWS
  ) {
    return processRowCell(collection, cellValue)
  } else {
    return collection
  }
}

const finalizeRowForCollection = (collection) => {
  if (collection.state === CollectionState.HEADERS) {
    return { ...collection, state: CollectionState.ROWS, currentRow: [] }
  } else if (
    collection.state === CollectionState.ROWS &&
    collection.currentRow.length > 0
  ) {
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

/** @type {SummaryLogParser} */
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
