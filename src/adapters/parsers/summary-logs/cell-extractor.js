/**
 * Checks if the cell value is a formula cell (regular or shared).
 */
const isFormulaCell = (cellValue) =>
  'formula' in cellValue || 'sharedFormula' in cellValue

/**
 * Checks if the cell value is a richText cell.
 */
const isRichTextCell = (cellValue) =>
  'richText' in cellValue && Array.isArray(cellValue.richText)

/**
 * Checks if the cell value is a hyperlink cell.
 */
const isHyperlinkCell = (cellValue) =>
  'text' in cellValue && 'hyperlink' in cellValue

/**
 * Checks if the cell value is an error cell.
 */
const isErrorCell = (cellValue) => 'error' in cellValue

/**
 * Extracts value from an object cell type.
 * Returns undefined if not a recognised object type.
 */
const extractObjectCellValue = (cellValue, recursiveExtract) => {
  // Date objects - extract date-only (YYYY-MM-DD)
  // We only care about dates, not times, in this system
  if (cellValue instanceof Date) {
    if (isNaN(cellValue.getTime())) {
      return null
    }
    return cellValue.toISOString().slice(0, 10)
  }

  // Formula cells with result - recursively extract
  if ('result' in cellValue && isFormulaCell(cellValue)) {
    return recursiveExtract(cellValue.result)
  }

  // Formula cells without result
  if (isFormulaCell(cellValue)) {
    return null
  }

  // RichText cells - concatenate all text segments
  if (isRichTextCell(cellValue)) {
    return cellValue.richText.map((segment) => segment.text).join('')
  }

  // Hyperlink cells - extract just the text
  if (isHyperlinkCell(cellValue)) {
    return cellValue.text
  }

  // Error cells - treat as no valid value
  if (isErrorCell(cellValue)) {
    return null
  }

  return undefined
}

/**
 * Extracts a primitive value from an ExcelJS cell value.
 * Handles all ExcelJS ValueTypes: Null, Merge, Number, String, Date,
 * Hyperlink, Formula, SharedString, RichText, Boolean, Error.
 */
export const extractCellValue = (cellValue) => {
  if (!cellValue || typeof cellValue !== 'object') {
    return cellValue
  }

  const extracted = extractObjectCellValue(cellValue, extractCellValue)

  if (extracted !== undefined) {
    return extracted
  }

  // Unknown object type - fail fast so we can add explicit handling
  throw new Error(
    `Unknown cell value type: ${JSON.stringify(cellValue)}. ` +
      'This may indicate a new ExcelJS cell type that needs explicit handling.'
  )
}

/**
 * Checks if a cell value is considered empty.
 * Used for phantom column detection.
 */
export const isCellEmpty = (cellValue) => {
  const value = extractCellValue(cellValue)
  return value === null || value === undefined || value === ''
}
