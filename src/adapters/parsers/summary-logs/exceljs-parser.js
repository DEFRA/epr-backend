import ExcelJS from 'exceljs'

export class ExcelJSSummaryLogsParser {
  static ALPHABET_SIZE = 26
  static ASCII_CODE_OFFSET = 65

  processCellForMetadata(
    cellValue,
    cellValueStr,
    worksheet,
    rowNumber,
    colNumber,
    state
  ) {
    if (!state.metadataContext && cellValueStr.startsWith('__EPR_META_')) {
      const metadataName = cellValueStr.replace('__EPR_META_', '')
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
      if (cellValueStr.startsWith('__EPR_META_')) {
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
                column: this.columnToLetter(colNumber)
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

  processDataMarker(
    cellValueStr,
    worksheet,
    rowNumber,
    colNumber,
    collections
  ) {
    if (!cellValueStr.startsWith('__EPR_DATA_')) {
      return collections
    }

    return [
      ...collections,
      {
        sectionName: cellValueStr.replace('__EPR_DATA_', ''),
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
      }
    ]
  }

  processHeaderCell(collection, cellValueStr) {
    if (cellValueStr === '') {
      return { ...collection, state: 'ROWS' }
    } else if (cellValueStr === '__EPR_SKIP_COLUMN') {
      return { ...collection, headers: [...collection.headers, null] }
    } else {
      return { ...collection, headers: [...collection.headers, cellValueStr] }
    }
  }

  processRowCell(collection, cellValue) {
    const normalizedValue =
      cellValue === null || cellValue === undefined || cellValue === ''
        ? null
        : cellValue
    return {
      ...collection,
      currentRow: [...collection.currentRow, normalizedValue]
    }
  }

  updateCollectionWithCell(collection, cellValue, cellValueStr, colNumber) {
    const columnIndex = colNumber - collection.startColumn

    if (columnIndex >= 0 && collection.state === 'HEADERS') {
      return this.processHeaderCell(collection, cellValueStr)
    } else if (
      columnIndex >= 0 &&
      columnIndex < collection.headers.length &&
      collection.state === 'ROWS'
    ) {
      return this.processRowCell(collection, cellValue)
    } else {
      return collection
    }
  }

  finalizeRowForCollection(collection) {
    if (collection.state === 'HEADERS') {
      return { ...collection, state: 'ROWS', currentRow: [] }
    } else if (
      collection.state === 'ROWS' &&
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

  emitCollectionsToResult(state, collections) {
    for (const collection of collections) {
      if (state.result.data[collection.sectionName]) {
        throw new Error(
          `Duplicate data section name: ${collection.sectionName}`
        )
      }
      state.result.data[collection.sectionName] = {
        location: collection.location,
        headers: collection.headers,
        rows: collection.rows
      }
    }
  }

  async parse(summaryLogBuffer) {
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
          const cellValue = cell.value
          const cellValueStr = cellValue?.toString() || ''

          // Process metadata
          acc = this.processCellForMetadata(
            cellValue,
            cellValueStr,
            worksheet,
            rowNumber,
            colNumber,
            acc
          )

          // Process data markers
          acc.activeCollections = this.processDataMarker(
            cellValueStr,
            worksheet,
            rowNumber,
            colNumber,
            acc.activeCollections
          )

          // Update collections with cell data
          acc.activeCollections = acc.activeCollections.map((collection) =>
            this.updateCollectionWithCell(
              collection,
              cellValue,
              cellValueStr,
              colNumber
            )
          )

          return acc
        }, state)

        // Finalize row for each collection
        state.activeCollections = state.activeCollections.map((c) =>
          this.finalizeRowForCollection(c)
        )

        // Emit completed collections and filter them out
        const completedCollections = state.activeCollections.filter(
          (c) => c.complete
        )
        this.emitCollectionsToResult(state, completedCollections)
        state.activeCollections = state.activeCollections.filter(
          (c) => !c.complete
        )
      }

      // Emit remaining collections at worksheet end
      this.emitCollectionsToResult(state, state.activeCollections)
      state.activeCollections = []
    }

    return state.result
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
        String.fromCodePoint(
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
    if (letter === '') {
      throw new Error('Invalid column letter: empty string')
    }
    if (!/^[A-Z]+$/.test(letter)) {
      throw new Error('Invalid column letter: must be uppercase only')
    }
    let result = 0
    for (let i = 0; i < letter.length; i++) {
      result =
        result * ExcelJSSummaryLogsParser.ALPHABET_SIZE +
        (letter.codePointAt(i) - 64)
    }
    return result
  }
}
