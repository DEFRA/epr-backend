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
  const normalisedValue =
    cellValue === null || cellValue === undefined || cellValue === ''
      ? null
      : cellValue
  return {
    ...collection,
    currentRow: [...collection.currentRow, normalisedValue]
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

const emitCollectionsToResult = (result, collections) =>
  collections.reduce((acc, collection) => {
    if (acc[collection.sectionName]) {
      throw new Error(`Duplicate data section name: ${collection.sectionName}`)
    }
    return {
      ...acc,
      [collection.sectionName]: {
        location: collection.location,
        headers: collection.headers,
        rows: collection.rows
      }
    }
  }, result)

const initializeCurrentRows = (collections) =>
  collections.map((collection) => ({ ...collection, currentRow: [] }))

const processCellsInRow = (state, cells, worksheet, rowNumber) =>
  cells.reduce((acc, { cell, colNumber }) => {
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
      updateCollectionWithCell(collection, cellValue, cellValueStr, colNumber)
    )

    return {
      ...stateAfterMetadata,
      activeCollections: updatedCollections
    }
  }, state)

const finalizeAndEmitCollections = (state) => {
  const finalizedCollections = state.activeCollections.map((collection) =>
    finalizeRowForCollection(collection)
  )

  const [completedCollections, activeCollections] = finalizedCollections.reduce(
    ([completed, active], collection) =>
      collection.complete
        ? [[...completed, collection], active]
        : [completed, [...active, collection]],
    [[], []]
  )

  return {
    ...state,
    result: {
      ...state.result,
      data: emitCollectionsToResult(state.result.data, completedCollections)
    },
    activeCollections
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

const processRow = (state, row, rowNumber, worksheet) => {
  const cells = collectCellsFromRow(row)
  const stateWithInitializedRows = {
    ...state,
    activeCollections: initializeCurrentRows(state.activeCollections)
  }
  const stateAfterCells = processCellsInRow(
    stateWithInitializedRows,
    cells,
    worksheet,
    rowNumber
  )
  return finalizeAndEmitCollections(stateAfterCells)
}

const processWorksheet = (state, worksheet) => {
  const rows = collectRowsFromWorksheet(worksheet)
  const stateAfterRows = rows.reduce(
    (acc, { row, rowNumber }) => processRow(acc, row, rowNumber, worksheet),
    state
  )

  return {
    ...stateAfterRows,
    result: {
      ...stateAfterRows.result,
      data: emitCollectionsToResult(
        stateAfterRows.result.data,
        stateAfterRows.activeCollections
      )
    },
    activeCollections: []
  }
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

  const finalState = workbook.worksheets.reduce(
    (state, worksheet) => processWorksheet(state, worksheet),
    initialState
  )

  return finalState.result
}
