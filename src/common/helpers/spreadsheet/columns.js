/**
 * Spreadsheet column helper functions
 * Converts between Excel-style column letters (A, B, ..., Z, AA, AB, ...) and numbers
 */

const ALPHABET_SIZE = 26
const ASCII_CODE_OFFSET = 65 // 'A' character code

/**
 * Converts a column number to Excel-style column letter(s)
 * @param {number} colNumber - 1-based column number (1 = A, 2 = B, 27 = AA)
 * @returns {string} Column letter(s)
 * @example
 * columnNumberToLetter(1)  // 'A'
 * columnNumberToLetter(26) // 'Z'
 * columnNumberToLetter(27) // 'AA'
 * columnNumberToLetter(702) // 'ZZ'
 */
export const columnNumberToLetter = (colNumber) => {
  const toLetterRecursive = (n, acc = '') => {
    if (n <= 0) {
      return acc
    }
    const remainder = (n - 1) % ALPHABET_SIZE
    const letter = String.fromCodePoint(ASCII_CODE_OFFSET + remainder)
    return toLetterRecursive(Math.floor((n - 1) / ALPHABET_SIZE), letter + acc)
  }
  return toLetterRecursive(colNumber)
}

/**
 * Converts Excel-style column letter(s) to a column number
 * @param {string} colLetter - Column letter(s) (A, B, ..., Z, AA, AB, ...)
 * @returns {number} 1-based column number
 * @example
 * columnLetterToNumber('A')  // 1
 * columnLetterToNumber('Z')  // 26
 * columnLetterToNumber('AA') // 27
 * columnLetterToNumber('ZZ') // 702
 */
export const columnLetterToNumber = (colLetter) => {
  let result = 0
  for (let i = 0; i < colLetter.length; i++) {
    const charCode = colLetter.charCodeAt(i) - ASCII_CODE_OFFSET + 1
    result = result * ALPHABET_SIZE + charCode
  }
  return result
}

/**
 * Calculates a new column letter by adding an offset to a base column
 * @param {string} baseColumn - Starting column letter (e.g., 'B', 'AA')
 * @param {number} offset - Number of columns to offset (0-based)
 * @returns {string} New column letter
 * @example
 * offsetColumn('B', 0)  // 'B'
 * offsetColumn('B', 3)  // 'E'
 * offsetColumn('Y', 3)  // 'AB'
 */
export const offsetColumn = (baseColumn, offset) => {
  const baseNumber = columnLetterToNumber(baseColumn)
  const newNumber = baseNumber + offset
  return columnNumberToLetter(newNumber)
}
