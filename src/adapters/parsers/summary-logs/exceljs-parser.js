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

    workbook.eachSheet((worksheet) => {
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const cellValue = cell.value

          if (
            typeof cellValue === 'string' &&
            cellValue.startsWith('__EPR_META_')
          ) {
            const markerName = cellValue.substring('__EPR_META_'.length)
            const valueCell = row.getCell(colNumber + 1)

            result.meta[markerName] = {
              value: valueCell.value,
              location: {
                sheet: worksheet.name,
                row: rowNumber,
                column: this.columnToLetter(colNumber + 1)
              }
            }
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
