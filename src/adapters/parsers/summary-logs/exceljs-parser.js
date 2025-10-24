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
    const activeCollections = []
    let metadataContext = null

    workbook.eachSheet((worksheet) => {
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const cellValue = cell.value
          const cellValueStr = cellValue?.toString() || ''

          // Check for metadata marker
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

          // Check for data marker
          if (cellValueStr.startsWith('__EPR_DATA_')) {
            const sectionName = cellValueStr.replace('__EPR_DATA_', '')
            activeCollections.push({
              sectionName,
              state: 'HEADERS',
              startColumn: colNumber + 1,
              headers: [],
              rows: [],
              location: {
                sheet: worksheet.name,
                row: rowNumber,
                column: this.columnToLetter(colNumber + 1)
              }
            })
          }

          // Process active collections
          activeCollections.forEach((collection) => {
            if (colNumber >= collection.startColumn) {
              if (collection.state === 'HEADERS') {
                if (cellValueStr === '') {
                  // Empty cell marks end of headers
                  collection.state = 'ROWS'
                } else {
                  collection.headers.push(cellValueStr)
                }
              }
            }
          })
        })

        // At end of row, transition collections from HEADERS to ROWS
        activeCollections.forEach((collection) => {
          if (collection.state === 'HEADERS') {
            collection.state = 'ROWS'
          }
        })

        // Emit collections with headers but no rows yet
        const toEmit = activeCollections.filter(
          (c) => c.state === 'ROWS' && c.rows.length === 0
        )
        toEmit.forEach((collection) => {
          result.data[collection.sectionName] = {
            location: collection.location,
            headers: collection.headers,
            rows: []
          }
        })
        // Remove emitted collections
        activeCollections.splice(
          0,
          activeCollections.length,
          ...activeCollections.filter((c) => !toEmit.includes(c))
        )
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
