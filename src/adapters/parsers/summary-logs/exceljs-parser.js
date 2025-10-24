import ExcelJS from 'exceljs'

export class ExcelJSSummaryLogsParser {
  /**
   * @param {Buffer} summaryLogBuffer
   * @returns {Promise<Object>}
   */
  async parse(summaryLogBuffer) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(summaryLogBuffer)

    const result = { meta: {}, data: {} }
    // eslint-disable-next-line no-unused-vars
    const activeCollections = [] // Used in later tasks for data section tracking
    let metadataContext = null

    workbook.eachSheet((worksheet) => {
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const cellValue = cell.value
          const cellValueStr = cellValue?.toString() || ''

          if (!metadataContext && cellValueStr.startsWith('__EPR_META_')) {
            const metadataName = cellValueStr.replace('__EPR_META_', '')
            metadataContext = {
              metadataName
            }
          } else if (metadataContext) {
            result.meta[metadataContext.metadataName] = {
              value: cellValue,
              location: {
                sheet: worksheet.name,
                row: rowNumber,
                column: this.columnToLetter(colNumber)
              }
            }
            metadataContext = null
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

  /**
   * @param {string} letter
   * @returns {number}
   */
  letterToColumnNumber(letter) {
    let result = 0
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 64)
    }
    return result
  }
}
