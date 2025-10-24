import ExcelJS from 'exceljs'

export class ExcelJSSummaryLogsParser {
  static ALPHABET_SIZE = 26
  static ASCII_CODE_OFFSET = 65

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
        const cells = []
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cells.push({ cell, colNumber })
        })

        // Initialize current row for each active collection in ROWS state
        activeCollections.forEach((collection) => {
          if (collection.state === 'ROWS') {
            collection.currentRow = []
          }
        })

        // Process each cell
        cells.forEach(({ cell, colNumber }) => {
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
              currentRow: [],
              location: {
                sheet: worksheet.name,
                row: rowNumber,
                column: this.columnToLetter(colNumber + 1)
              }
            })
          }

          // Process active collections
          activeCollections.forEach((collection) => {
            const columnIndex = colNumber - collection.startColumn

            if (columnIndex >= 0 && collection.state === 'HEADERS') {
              // Capturing headers
              if (cellValueStr === '') {
                collection.state = 'ROWS'
              } else if (cellValueStr === '__EPR_SKIP_COLUMN') {
                collection.headers.push(null)
              } else {
                collection.headers.push(cellValueStr)
              }
            } else if (
              columnIndex >= 0 &&
              columnIndex < collection.headers.length &&
              collection.state === 'ROWS'
            ) {
              // Add cell value to current row
              collection.currentRow.push(
                cellValue === null ||
                  cellValue === undefined ||
                  cellValue === ''
                  ? null
                  : cellValue
              )
            }
          })
        })

        // At end of row, process collections
        activeCollections.forEach((collection) => {
          if (collection.state === 'HEADERS') {
            collection.state = 'ROWS'
          } else if (
            collection.state === 'ROWS' &&
            collection.currentRow.length > 0
          ) {
            // Check if row is all empty
            const isEmptyRow = collection.currentRow.every(
              (val) => val === null
            )

            if (isEmptyRow) {
              // Emit collection and mark for removal
              result.data[collection.sectionName] = {
                location: collection.location,
                headers: collection.headers,
                rows: collection.rows
              }
              collection.complete = true
            } else {
              // Append row to collection
              collection.rows.push(collection.currentRow)
            }
          }
        })

        // Remove completed collections
        activeCollections.splice(
          0,
          activeCollections.length,
          ...activeCollections.filter((c) => !c.complete)
        )
      })

      // At end of worksheet, emit remaining collections
      activeCollections.forEach((collection) => {
        result.data[collection.sectionName] = {
          location: collection.location,
          headers: collection.headers,
          rows: collection.rows
        }
      })
      activeCollections.splice(0, activeCollections.length)
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
      const remainder = (colNumber - 1) % ExcelJSSummaryLogsParser.ALPHABET_SIZE
      column =
        String.fromCharCode(
          ExcelJSSummaryLogsParser.ASCII_CODE_OFFSET + remainder
        ) + column
      colNumber = Math.floor(
        (colNumber - 1) / ExcelJSSummaryLogsParser.ALPHABET_SIZE
      )
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
      result =
        result * ExcelJSSummaryLogsParser.ALPHABET_SIZE +
        (letter.charCodeAt(i) - 64)
    }
    return result
  }
}
