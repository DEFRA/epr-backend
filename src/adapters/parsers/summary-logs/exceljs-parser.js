import unzipper from 'unzipper'
import { createDraft, finishDraft } from 'immer'
import WorksheetReader from 'exceljs/lib/stream/xlsx/worksheet-reader.js'
import WorkbookXform from 'exceljs/lib/xlsx/xform/book/workbook-xform.js'
import RelationshipsXform from 'exceljs/lib/xlsx/xform/core/relationships-xform.js'
import SharedStringsXform from 'exceljs/lib/xlsx/xform/strings/shared-strings-xform.js'
import StylesXform from 'exceljs/lib/xlsx/xform/style/styles-xform.js'
import { columnNumberToLetter } from '#common/helpers/spreadsheet/columns.js'
import { VALIDATION_CODE } from '#common/enums/validation.js'
import {
  DATA_PREFIX,
  META_PREFIX,
  SKIP_COLUMN,
  SKIP_EXAMPLE_ROW_TEXT
} from '#domain/summary-logs/markers.js'
import { extractCellValue, isCellEmpty } from './cell-extractor.js'

/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogParser} SummaryLogParser */

/**
 * Error thrown when spreadsheet structure validation fails.
 * This allows callers to distinguish structural issues from other errors.
 */
export class SpreadsheetValidationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} [code] - Validation code for i18n/translation on the client side
   * @param {ErrorOptions} [options] - Standard Error options (e.g. `{ cause }`)
   */
  constructor(
    message,
    code = VALIDATION_CODE.SPREADSHEET_INVALID_ERROR,
    options = {}
  ) {
    super(message, options)
    this.name = 'SpreadsheetValidationError'
    /** @type {string} */
    this.code = code
  }
}

/**
 * Error message thrown by exceljs when it dereferences a missing XML
 * element (e.g. `.richText` on a malformed shared-strings entry). Comes
 * out as a TypeError. Both the modern and legacy V8 wordings match.
 */
const DEREFERENCE_UNDEFINED_MESSAGE =
  /cannot read (?:properties|property\s+\S+) of (?:undefined|null)/i

/**
 * Error messages from yauzl / jszip / unzipper for non-zip buffers or
 * corrupt-zip streams (an xlsx is a zip archive under the hood).
 */
const CORRUPT_ZIP_MESSAGE =
  /central directory|invalid signature|compressed\/uncompressed size|corrupted zip|end of data reached|FILE_ENDED|MISSING_PASSWORD|BAD_PASSWORD/i

/**
 * Error messages from exceljs' own XML layer when an xlsx's XML parts are
 * malformed. Saxes-originated errors are detected separately via stack
 * origin (see `SAXES_STACK_ORIGIN`).
 */
const MALFORMED_XML_MESSAGE =
  /invalid character in xml|xml parsing|unexpected token in xml/i

/**
 * Stack-trace marker for errors originating inside the saxes XML parser.
 * Saxes's `makeError` creates plain `Error` instances with `line:column:`
 * prefixed messages ("3:31: unexpected close tag."), so neither `error.name`
 * nor the message wording is a reliable signal on its own. The stack
 * origin is.
 */
const SAXES_STACK_ORIGIN = /node_modules[\\/]saxes[\\/]/

/**
 * Decide whether an error thrown during workbook load should be wrapped
 * as a SpreadsheetValidationError (warn-level log, treated as bad user
 * data) or left to propagate as a system error (error-level log, fires
 * the backend error alert).
 *
 * Wraps when the error matches one of these known bad-workbook signatures:
 * - TypeError dereferencing a missing XML element (e.g. `.richText` on
 *   a malformed shared-strings entry)
 * - yauzl errors for non-zip / corrupt-zip buffers
 * - saxes errors for malformed XML parts
 *
 * Anything else (RangeError, assertion failures, our own bugs) is
 * treated as a system error.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export const shouldWrapAsSpreadsheetError = (error) => {
  if (!(error instanceof Error) || typeof error.message !== 'string') {
    return false
  }

  const { message } = error

  if (
    error instanceof TypeError &&
    DEREFERENCE_UNDEFINED_MESSAGE.test(message)
  ) {
    return true
  }

  if (CORRUPT_ZIP_MESSAGE.test(message)) {
    return true
  }

  if (
    error.name === 'SaxesError' ||
    SAXES_STACK_ORIGIN.test(error.stack ?? '')
  ) {
    return true
  }

  return MALFORMED_XML_MESSAGE.test(message)
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
 * Asserts the streamed worksheet count has not exceeded the configured limit.
 * Called once per worksheet as it arrives from the stream.
 *
 * @param {number} count - Worksheets seen so far (including this one)
 * @param {number} max
 */
const assertWorksheetCountWithinLimit = (count, max) => {
  if (count > max) {
    throw new SpreadsheetValidationError(
      `Too many worksheets (${count}, maximum ${max})`
    )
  }
}

/**
 * Asserts the streamed row index has not exceeded the configured limit.
 * Called for each row as it streams in (via row.number, the 1-based index from XML).
 */
const assertRowWithinLimit = (worksheetName, rowNumber, max) => {
  if (rowNumber > max) {
    throw new SpreadsheetValidationError(
      `Worksheet '${worksheetName}' has too many rows (${rowNumber}, maximum ${max})`
    )
  }
}

/**
 * Asserts the streamed column index has not exceeded the configured limit.
 * Called for each cell as it streams in.
 */
const assertColumnWithinLimit = (worksheetName, colNumber, max) => {
  if (colNumber > max) {
    throw new SpreadsheetValidationError(
      `Worksheet '${worksheetName}' has too many columns (${colNumber}, maximum ${max})`
    )
  }
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
      throw new SpreadsheetValidationError(
        `Duplicate metadata name: ${metadataName}`,
        VALIDATION_CODE.SPREADSHEET_MALFORMED_MARKERS
      )
    }
    draftState.metadataContext = { metadataName }
  } else if (draftState.metadataContext) {
    if (cellValueStr.startsWith(META_PREFIX)) {
      throw new SpreadsheetValidationError(
        'Malformed sheet: metadata marker found in value position',
        VALIDATION_CODE.SPREADSHEET_MALFORMED_MARKERS
      )
    }

    const metadataName = draftState.metadataContext.metadataName

    draftState.result.meta[metadataName] = {
      value: cellValue,
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

const processRowCell = (
  draftCollection,
  cellValue,
  columnIndex,
  unfilledValues
) => {
  const headerName = draftCollection.headers[columnIndex]
  const columnUnfilledValues = unfilledValues[headerName] || []
  const trimmedValue =
    typeof cellValue === 'string' ? cellValue.trim() : cellValue
  const normalisedValue =
    cellValue === null ||
    cellValue === undefined ||
    cellValue === '' ||
    columnUnfilledValues.includes(trimmedValue)
      ? null
      : cellValue
  draftCollection.currentRow.push(normalisedValue)
}

const updateCollectionWithCell = (
  draftCollection,
  cellValue,
  cellValueStr,
  colNumber,
  unfilledValues
) => {
  const columnIndex = colNumber - draftCollection.startColumn

  if (columnIndex >= 0 && draftCollection.state === CollectionState.HEADERS) {
    processHeaderCell(draftCollection, cellValueStr)
  } else if (
    columnIndex >= 0 &&
    columnIndex < draftCollection.headers.length &&
    draftCollection.state === CollectionState.ROWS
  ) {
    processRowCell(draftCollection, cellValue, columnIndex, unfilledValues)
  } else {
    // Cell is outside collection boundaries
  }
}

const shouldSkipRow = (draftCollection) => {
  for (const skipIndex of draftCollection.skipColumnIndices) {
    const cellValue = draftCollection.currentRow[skipIndex]
    if (cellValue === SKIP_EXAMPLE_ROW_TEXT) {
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
      throw new SpreadsheetValidationError(
        `Duplicate data section name: ${collection.sectionName}`,
        VALIDATION_CODE.SPREADSHEET_MALFORMED_MARKERS
      )
    }
    draftResult[collection.sectionName] = {
      location: collection.location,
      headers: collection.headers,
      rows: collection.rows
    }
  }
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
      updateCollectionWithCell(
        collection,
        cellValue,
        cellValueStr,
        colNumber,
        draftState.unfilledValues
      )
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

/**
 * @typedef {{number: number, eachCell: any}} StreamingRow
 * @typedef {AsyncIterable<StreamingRow> & {name: string}} StreamingWorksheet
 */

/**
 * Streams rows from a worksheet, applying validation limits and phantom-row
 * detection. Uses `rowHasContent` (which extracts each cell value and treats
 * `null` / '' uniformly) rather than `Row.hasValues` so that cells authored
 * as the empty string still register as content-bearing.
 *
 * Once phantom-row detection trips, remaining rows in this worksheet are
 * still consumed from the stream (to keep the underlying zip pipeline
 * draining cleanly) but not processed.
 *
 * @param {object} draftState - Immer draft of the parser state
 * @param {StreamingWorksheet} worksheet - WorksheetReader instance
 * @param {StreamWorksheetOptions} options
 */
const streamWorksheet = async (draftState, worksheet, options) => {
  const { maxRowsPerSheet, maxColumnsPerSheet } = options
  const counters = { consecutiveEmptyRows: 0, phantomRowsTripped: false }

  for await (const row of worksheet) {
    const rowNumber = row.number
    assertRowWithinLimit(worksheet.name, rowNumber, maxRowsPerSheet)
    processRowAgainstPhantomState(draftState, worksheet, row, rowNumber, {
      maxColumnsPerSheet,
      counters
    })
  }

  emitCollectionsToResult(draftState.result.data, draftState.activeCollections)

  draftState.activeCollections = []
}

/**
 * @param {object} draftState
 * @param {StreamingWorksheet} worksheet
 * @param {StreamingRow} row
 * @param {number} rowNumber
 * @param {{maxColumnsPerSheet: number, counters: {consecutiveEmptyRows: number, phantomRowsTripped: boolean}}} ctx
 */
const processRowAgainstPhantomState = (
  draftState,
  worksheet,
  row,
  rowNumber,
  ctx
) => {
  const { maxColumnsPerSheet, counters } = ctx
  if (counters.phantomRowsTripped) {
    return
  }

  const hasActiveCollections = draftState.activeCollections.length > 0
  if (shouldSkipForPhantomDetection(row, hasActiveCollections)) {
    counters.consecutiveEmptyRows++
    if (counters.consecutiveEmptyRows >= MAX_CONSECUTIVE_EMPTY_ROWS) {
      counters.phantomRowsTripped = true
    }
    return
  }

  counters.consecutiveEmptyRows = 0
  assertWorksheetColumnsWithinLimit(worksheet, row, maxColumnsPerSheet)
  processRow(draftState, row, rowNumber, worksheet)
}

/**
 * @param {{name: string}} worksheet
 * @param {{eachCell: (cb: (cell: object, colNumber: number) => void) => void}} row
 * @param {number} max
 */
const assertWorksheetColumnsWithinLimit = (worksheet, row, max) => {
  row.eachCell((_cell, colNumber) => {
    assertColumnWithinLimit(worksheet.name, colNumber, max)
  })
}

// Exported for testing - allows direct unit testing of cell value extraction
export { extractCellValue }

/**
 * @typedef {Object} ParseOptions
 * @property {string|null} [requiredWorksheet] - Name of required worksheet, or null to skip check
 * @property {number} [maxWorksheets] - Maximum allowed worksheets
 * @property {number} [maxRowsPerSheet] - Maximum allowed rows per worksheet
 * @property {number} [maxColumnsPerSheet] - Maximum allowed columns per worksheet
 * @property {Record<string, string[]>} [unfilledValues] - Per-column values to normalise to null
 */

/**
 * Minimal shape of the workbook-like object that ExcelJS's `WorksheetReader`
 * destructures once at the start of each parse. We provide exactly that
 * surface and nothing more - the SAX path never reaches back into the
 * workbook for anything else.
 *
 * @typedef {Object} WorkbookShim
 * @property {string[]} sharedStrings - Shared strings table indexed by sst index; `[]` when sharedStrings.xml is absent
 * @property {{getStyleModel: (id: number) => object}} styles - Looked up per styled cell to resolve numFmt and format
 * @property {{model?: {date1904?: boolean}}} properties - `model` is undefined when the workbook has no `workbookPr` element
 */

/**
 * @typedef {Object} StreamWorksheetOptions
 * @property {number} maxRowsPerSheet
 * @property {number} maxColumnsPerSheet
 */

const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels'
const WORKBOOK_PATH = 'xl/workbook.xml'
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml'
const STYLES_PATH = 'xl/styles.xml'

/**
 * @param {string} relTarget - Sheet target from the workbook relationships XML (e.g. `worksheets/sheet1.xml` or `/xl/worksheets/sheet1.xml`)
 * @returns {string} Path within the zip archive
 */
const resolveSheetPath = (relTarget) =>
  `xl/${relTarget.replace(/^(\s|\/xl\/)+/, '')}`

/**
 * @typedef {Object} WorkbookParts
 * @property {Map<string, any>} filesByPath - Zip entries indexed by archive path; values expose `.stream()` (unzipper has no published types)
 * @property {Array<any>} workbookRels - Workbook relationships from RelationshipsXform; entries carry `Id`/`Target` strings
 * @property {Array<any>} sheets - Worksheet descriptors from the workbook XML; entries carry `name`/`id`/`rId`
 * @property {WorkbookShim} workbookShim - Tightly typed shim consumed by WorksheetReader
 */

/**
 * Opens the xlsx zip and parses workbook metadata, relationships, styles and
 * shared strings into the structures needed by `WorksheetReader`. Asserts the
 * worksheet count limit before any sheet streaming begins.
 *
 * @param {Buffer} buffer
 * @param {number} maxWorksheets
 * @returns {Promise<WorkbookParts>}
 */
const loadWorkbookParts = async (buffer, maxWorksheets) => {
  const directory = await unzipper.Open.buffer(buffer)
  const filesByPath = new Map(
    directory.files.map((entry) => [entry.path, entry])
  )

  const relsXform = new RelationshipsXform()
  const workbookRels = await relsXform.parseStream(
    filesByPath.get(WORKBOOK_RELS_PATH).stream()
  )

  const workbookXform = new WorkbookXform()
  await workbookXform.parseStream(filesByPath.get(WORKBOOK_PATH).stream())
  const workbookModel = workbookXform.model
  const workbookProperties = workbookXform.map.workbookPr

  const sheets = workbookModel.sheets
  assertWorksheetCountWithinLimit(sheets.length, maxWorksheets)

  const stylesXform = new StylesXform()
  stylesXform.init()
  await stylesXform.parseStream(filesByPath.get(STYLES_PATH).stream())

  const sharedStringsXform = new SharedStringsXform()
  const sharedStringsFile = filesByPath.get(SHARED_STRINGS_PATH)
  if (sharedStringsFile) {
    await sharedStringsXform.parseStream(sharedStringsFile.stream())
  }

  /** @type {WorkbookShim} */
  const workbookShim = {
    sharedStrings: sharedStringsXform.values,
    styles: stylesXform,
    properties: workbookProperties
  }

  return { filesByPath, workbookRels, sheets, workbookShim }
}

/**
 * @param {WorkbookParts} parts
 * @param {any} sheet - Worksheet descriptor with `name`, `id`, `rId`
 * @returns {StreamingWorksheet}
 */
const createWorksheetReader = (parts, sheet) => {
  const rel = parts.workbookRels.find((r) => r.Id === sheet.rId)
  const sheetFile = parts.filesByPath.get(resolveSheetPath(rel.Target))

  const reader = new WorksheetReader({
    workbook: parts.workbookShim,
    id: sheet.id,
    iterator: sheetFile.stream(),
    options: {
      worksheets: 'emit',
      hyperlinks: 'ignore'
    }
  })
  reader.name = sheet.name
  return reader
}

/**
 * Parses an Excel buffer and extracts metadata and data sections.
 *
 * Reads the zip central directory eagerly via `unzipper.Open.buffer` so we
 * can parse workbook metadata, relationships, styles and shared strings in
 * a known order before any worksheet streaming begins. Each worksheet is
 * then streamed through ExcelJS's internal `WorksheetReader`, which SAX-
 * parses the inflated entry without holding the whole worksheet DOM in
 * memory.
 *
 * Bypasses ExcelJS's `WorkbookReader` to avoid the `iterateStream` race
 * (exceljs#1558) that drops the workbook descriptor when shared strings
 * are written after worksheets - the entry order Microsoft Office and
 * LibreOffice always use.
 *
 * @param {Buffer} buffer - Excel file buffer
 * @param {ParseOptions} [options] - Validation options
 * @returns {Promise<ParsedSummaryLog>} Parsed summary log data
 * @throws {SpreadsheetValidationError} If the spreadsheet fails structural validation
 */
export const parse = async (buffer, options = {}) => {
  if (buffer.length === 0) {
    throw new SpreadsheetValidationError('Spreadsheet buffer is empty')
  }

  const {
    requiredWorksheet = null,
    maxWorksheets = PARSE_DEFAULTS.maxWorksheets,
    maxRowsPerSheet = PARSE_DEFAULTS.maxRowsPerSheet,
    maxColumnsPerSheet = PARSE_DEFAULTS.maxColumnsPerSheet,
    unfilledValues = {}
  } = options

  const draft = createDraft({
    result: { meta: {}, data: {} },
    activeCollections: [],
    metadataContext: null,
    unfilledValues
  })

  const seenWorksheetNames = []

  try {
    const parts = await loadWorkbookParts(buffer, maxWorksheets)
    for (const sheet of parts.sheets) {
      seenWorksheetNames.push(sheet.name)
      const reader = createWorksheetReader(parts, sheet)
      await streamWorksheet(draft, reader, {
        maxRowsPerSheet,
        maxColumnsPerSheet
      })
    }
  } catch (error) {
    if (error instanceof SpreadsheetValidationError) {
      throw error
    }
    if (shouldWrapAsSpreadsheetError(error)) {
      throw new SpreadsheetValidationError(
        `Failed to parse spreadsheet: ${error.message}`,
        VALIDATION_CODE.SPREADSHEET_INVALID_ERROR,
        { cause: error }
      )
    }
    throw error
  }

  if (requiredWorksheet && !seenWorksheetNames.includes(requiredWorksheet)) {
    throw new SpreadsheetValidationError(
      `Missing required '${requiredWorksheet}' worksheet`
    )
  }

  return finishDraft(draft).result
}
