import ExcelJS from 'exceljs'
import { produce } from 'immer'
import { columnNumberToLetter } from '#common/helpers/spreadsheet/columns.js'
import {
  DATA_PREFIX,
  MATERIAL_PLACEHOLDER_TEXT,
  META_PREFIX,
  PLACEHOLDER_TEXT,
  ROW_ID_HEADER,
  SKIP_COLUMN,
  SKIP_EXAMPLE_ROW_TEXT,
  SKIP_HEADER_ROW_TEXT
} from '#domain/summary-logs/markers.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'

/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogParser} SummaryLogParser */

/**
 * Error thrown when spreadsheet structure validation fails.
 * This allows callers to distinguish structural issues from other errors.
 */
export class SpreadsheetValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SpreadsheetValidationError'
  }
}

/**
 * Threshold for consecutive empty rows/columns before assuming phantom data.
 * These are not configurable - they're tuned for detecting phantom data
 * in Excel files while allowing legitimate gaps in data.
 */
const MAX_CONSECUTIVE_EMPTY_ROWS = 100
const MAX_CONSECUTIVE_EMPTY_COLUMNS = 100

/**
 * Default sanity limits for workbook structure validation.
 * These can be overridden via parse options.
 *
 * @property {number} maxWorksheets - Maximum number of worksheets allowed (default: 20)
 * @property {number} maxRowsPerSheet - Maximum rows per worksheet (default: 55,000)
 * @property {number} maxColumnsPerSheet - Maximum columns per worksheet (default: 1,000)
 */
export const PARSE_DEFAULTS = Object.freeze({
  maxWorksheets: 20,
  maxRowsPerSheet: 55_000,
  maxColumnsPerSheet: 1_000
})

const CollectionState = {
  HEADERS: 'HEADERS',
  ROWS: 'ROWS'
}

/**
 * Validates workbook structure before parsing begins.
 * Throws SpreadsheetValidationError if the workbook fails any validation check.
 *
 * @param {Object} workbook - ExcelJS workbook instance
 * @param {Object} options - Validation options
 * @param {string|null} options.requiredWorksheet - Name of required worksheet, or null to skip check
 * @param {number} options.maxWorksheets - Maximum allowed worksheets
 * @param {number} options.maxRowsPerSheet - Maximum allowed rows per worksheet
 * @param {number} options.maxColumnsPerSheet - Maximum allowed columns per worksheet
 */
const validateWorkbookStructure = (workbook, options) => {
  const {
    requiredWorksheet,
    maxWorksheets,
    maxRowsPerSheet,
    maxColumnsPerSheet
  } = options

  if (requiredWorksheet) {
    const worksheetNames = workbook.worksheets.map((ws) => ws.name)

    if (!worksheetNames.includes(requiredWorksheet)) {
      throw new SpreadsheetValidationError(
        `Missing required '${requiredWorksheet}' worksheet`
      )
    }
  }

  if (workbook.worksheets.length > maxWorksheets) {
    throw new SpreadsheetValidationError(
      `Too many worksheets (${workbook.worksheets.length}, maximum ${maxWorksheets})`
    )
  }

  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount > maxRowsPerSheet) {
      throw new SpreadsheetValidationError(
        `Worksheet '${worksheet.name}' has too many rows (${worksheet.rowCount}, maximum ${maxRowsPerSheet})`
      )
    }

    if (worksheet.columnCount > maxColumnsPerSheet) {
      throw new SpreadsheetValidationError(
        `Worksheet '${worksheet.name}' has too many columns (${worksheet.columnCount}, maximum ${maxColumnsPerSheet})`
      )
    }
  }
}

const extractCellValue = (cellValue) => {
  if (cellValue && typeof cellValue === 'object') {
    // Handle Date objects - extract date-only (YYYY-MM-DD) for consistent comparison
    // We only care about dates, not times, in this system
    if (cellValue instanceof Date) {
      return cellValue.toISOString().slice(0, 10)
    }
    // Handle formula cells (both regular and shared formulas)
    if (
      'result' in cellValue &&
      ('formula' in cellValue || 'sharedFormula' in cellValue)
    ) {
      // Recursively extract in case result is a Date or other complex type
      return extractCellValue(cellValue.result)
    }
    // Handle formula cells without a result
    if ('formula' in cellValue || 'sharedFormula' in cellValue) {
      return null
    }
    // Handle richText cells - concatenate all text segments
    if ('richText' in cellValue && Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((segment) => segment.text).join('')
    }
    // Handle hyperlink cells - extract just the text
    if ('text' in cellValue && 'hyperlink' in cellValue) {
      return cellValue.text
    }
    // Handle error cells - treat as no valid value
    if ('error' in cellValue) {
      return null
    }
    // Unknown object type - fail fast so we can add explicit handling
    // ExcelJS ValueType enum: Null, Merge, Number, String, Date, Hyperlink,
    // Formula, SharedString, RichText, Boolean, Error
    // All known object types should be handled above
    throw new Error(
      `Unknown cell value type: ${JSON.stringify(cellValue)}. ` +
        'This may indicate a new ExcelJS cell type that needs explicit handling.'
    )
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

    // Normalize MATERIAL placeholder to null
    const metadataName = draftState.metadataContext.metadataName
    const normalisedValue =
      metadataName === SUMMARY_LOG_META_FIELDS.MATERIAL &&
      cellValue === MATERIAL_PLACEHOLDER_TEXT
        ? null
        : cellValue

    draftState.result.meta[metadataName] = {
      value: normalisedValue,
      location: {
        sheet: worksheet.name,
        row: rowNumber,
        column: columnNumberToLetter(colNumber)
      }
    }
    draftState.metadataContext = null
  } else {
    // Cell is not related to metadata
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
      skipColumnIndices: [],
      rows: [],
      currentRow: [],
      currentRowNumber: null,
      location: {
        sheet: worksheet.name,
        row: rowNumber,
        column: columnNumberToLetter(colNumber + 1)
      }
    })
  }
}

const processHeaderCell = (draftCollection, cellValueStr) => {
  if (cellValueStr === '') {
    draftCollection.state = CollectionState.ROWS
  } else if (cellValueStr === SKIP_COLUMN) {
    draftCollection.skipColumnIndices.push(draftCollection.headers.length)
    draftCollection.headers.push(null)
  } else {
    draftCollection.headers.push(cellValueStr)
  }
}

const processRowCell = (draftCollection, cellValue) => {
  const normalisedValue =
    cellValue === null ||
    cellValue === undefined ||
    cellValue === '' ||
    cellValue === PLACEHOLDER_TEXT
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
  } else {
    // Cell is outside collection boundaries
  }
}

const shouldSkipRow = (draftCollection) => {
  // Skip "example" rows
  for (const skipIndex of draftCollection.skipColumnIndices) {
    const cellValue = draftCollection.currentRow[skipIndex]
    if (cellValue === SKIP_EXAMPLE_ROW_TEXT) {
      return true
    }
  }

  const rowIdIndex = draftCollection.headers.indexOf(ROW_ID_HEADER)
  if (rowIdIndex !== -1) {
    const cellValue = draftCollection.currentRow[rowIdIndex]

    // Skip textual (user-facing) header rows
    if (
      typeof cellValue === 'string' &&
      cellValue.startsWith(SKIP_HEADER_ROW_TEXT)
    ) {
      return true
    }

    // Skip rows where ROW_ID is empty (null/undefined)
    if (cellValue === null || cellValue === undefined) {
      return true
    }
  }

  return false
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
    } else if (shouldSkipRow(draftCollection)) {
      draftCollection.currentRow = []
    } else {
      draftCollection.rows.push({
        rowNumber: draftCollection.currentRowNumber,
        values: draftCollection.currentRow
      })
      draftCollection.currentRow = []
    }
  } else {
    // Current row is empty, nothing to finalize
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

/**
 * Checks if a cell value is considered empty.
 * Used for phantom column detection.
 */
const isCellEmpty = (cellValue) => {
  const value = extractCellValue(cellValue)
  return value === null || value === undefined || value === ''
}

/**
 * Collects cells from a row, stopping after MAX_CONSECUTIVE_EMPTY_COLUMNS
 * consecutive empty cells to avoid iterating through phantom columns.
 *
 * Some Excel files have formatting applied to columns far beyond the actual
 * data (e.g., column XEN = 16,000+). This function stops collecting cells
 * early when it detects we've moved beyond meaningful data.
 *
 * Note: ExcelJS's eachCell callback cannot be broken out of early, so we use
 * a flag to track when we've hit phantom columns and skip all subsequent cells.
 */
const collectCellsFromRow = (row) => {
  const cells = []
  let consecutiveEmptyCells = 0
  let hitPhantomColumns = false

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (hitPhantomColumns) {
      return // Once we've hit phantom columns, skip all remaining cells
    }

    if (isCellEmpty(cell.value)) {
      consecutiveEmptyCells++

      if (consecutiveEmptyCells >= MAX_CONSECUTIVE_EMPTY_COLUMNS) {
        hitPhantomColumns = true
        return
      }
    } else {
      consecutiveEmptyCells = 0
    }

    cells.push({ cell, colNumber })
  })

  return cells
}

const processRow = (draftState, row, rowNumber, worksheet) => {
  const cells = collectCellsFromRow(row)

  for (const collection of draftState.activeCollections) {
    collection.currentRow = []
    collection.currentRowNumber = rowNumber
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

/**
 * Checks if a row contains any non-empty content.
 */
const rowHasContent = (row) => {
  const cells = collectCellsFromRow(row)
  return cells.some(({ cell }) => {
    const value = extractCellValue(cell.value)
    return value !== null && value !== undefined && value !== ''
  })
}

/**
 * Determines whether a row should be skipped during phantom row detection.
 *
 * A row should be processed (not skipped) if:
 * - There are active data collections that need this row for termination detection
 * - It contains any non-empty content (markers or otherwise)
 */
const shouldSkipForPhantomDetection = (row, hasActiveCollections) => {
  if (hasActiveCollections) {
    return false
  }

  return !rowHasContent(row)
}

const processWorksheet = (draftState, worksheet) => {
  let consecutiveEmptyRows = 0

  const rows = collectRowsFromWorksheet(worksheet)

  for (const { row, rowNumber } of rows) {
    const hasActiveCollections = draftState.activeCollections.length > 0

    if (shouldSkipForPhantomDetection(row, hasActiveCollections)) {
      consecutiveEmptyRows++

      if (consecutiveEmptyRows >= MAX_CONSECUTIVE_EMPTY_ROWS) {
        break
      }
    } else {
      consecutiveEmptyRows = 0
      processRow(draftState, row, rowNumber, worksheet)
    }
  }

  emitCollectionsToResult(draftState.result.data, draftState.activeCollections)

  draftState.activeCollections = []
}

// Exported for testing - allows direct unit testing of cell value extraction
export { extractCellValue }

/**
 * @typedef {Object} ParseOptions
 * @property {string|null} [requiredWorksheet] - Name of required worksheet, or null to skip check
 * @property {number} [maxWorksheets] - Maximum allowed worksheets
 * @property {number} [maxRowsPerSheet] - Maximum allowed rows per worksheet
 * @property {number} [maxColumnsPerSheet] - Maximum allowed columns per worksheet
 */

/**
 * Parses an Excel buffer and extracts metadata and data sections.
 *
 * @param {Buffer} buffer - Excel file buffer
 * @param {ParseOptions} [options] - Validation options
 * @returns {Promise<ParsedSummaryLog>} Parsed summary log data
 * @throws {SpreadsheetValidationError} If the spreadsheet fails structural validation
 */
export const parse = async (buffer, options = {}) => {
  const {
    requiredWorksheet = null,
    maxWorksheets = PARSE_DEFAULTS.maxWorksheets,
    maxRowsPerSheet = PARSE_DEFAULTS.maxRowsPerSheet,
    maxColumnsPerSheet = PARSE_DEFAULTS.maxColumnsPerSheet
  } = options

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(
    /** @type {import('exceljs').Buffer} */ (/** @type {unknown} */ (buffer))
  )

  validateWorkbookStructure(workbook, {
    requiredWorksheet,
    maxWorksheets,
    maxRowsPerSheet,
    maxColumnsPerSheet
  })

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
