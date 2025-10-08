import ExcelJS from 'exceljs'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../enums/index.js'
import { logger } from '../logging/logger.js'

const WORKSHEET = {
  Received: 0,
  Processed: 1,
  'Sent on': 2
}

const COLUMN = {
  FIRST: 6,
  LAST: 17
}

const ROW = {
  HEADERS: 6,
  INITIAL: 10,
  INITIAL_INC: 3,
  REGULAR: 25
}

const PLACEHOLDER = 'Choose option'

const findLastRowNumber = (worksheet) => {
  let lastRowNumber = 0

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber >= ROW.INITIAL) {
      const rawValue = row.getCell(COLUMN.LAST).value

      if (
        rawValue !== null &&
        rawValue !== undefined &&
        rawValue !== PLACEHOLDER
      ) {
        lastRowNumber = rowNumber
      }
    }
  })

  return lastRowNumber
}

const getRawCellValue = (row, colNumber) => {
  const rawValue = row.getCell(colNumber).value

  if (rawValue === null || rawValue === undefined || rawValue === PLACEHOLDER) {
    return null
  }

  if (rawValue instanceof Date) {
    return rawValue.toISOString()
  }

  if (typeof rawValue === 'object') {
    if (rawValue.richText) {
      return rawValue.richText.map((t) => t.text).join('')
    }

    if (rawValue.formula || rawValue.sharedFormula || rawValue.result) {
      const result = rawValue.result

      if (result === null || result === undefined) {
        return null
      }

      return result
    }

    return null
  }

  if (typeof rawValue === 'string') {
    if (rawValue === 'Yes') {
      return true
    }

    if (rawValue === 'No') {
      return false
    }
  }

  return rawValue
}

const getCellValue = (row, colNumber) => {
  const rawValue = getRawCellValue(row, colNumber)

  if (typeof rawValue === 'string') {
    return rawValue.replace(/\n/g, ' ').trim()
  }

  return rawValue
}

const getRowValues = (worksheet, rowNumber) => {
  const values = []

  const row = worksheet.getRow(rowNumber)

  for (let colNumber = COLUMN.FIRST; colNumber <= COLUMN.LAST; colNumber++) {
    const value = getCellValue(row, colNumber)
    values.push(value)
  }

  return values
}

const getContent = (worksheet) => {
  const content = []

  const lastRowNumber = findLastRowNumber(worksheet)

  for (
    let rowNumber = ROW.INITIAL;
    rowNumber < ROW.REGULAR;
    rowNumber += ROW.INITIAL_INC
  ) {
    const values = getRowValues(worksheet, rowNumber)
    content.push(values)
  }

  for (let rowNumber = ROW.REGULAR; rowNumber <= lastRowNumber; rowNumber++) {
    const values = getRowValues(worksheet, rowNumber)
    content.push(values)
  }

  return content
}

const getHeaders = (worksheet) => {
  const headers = []

  const row = worksheet.getRow(ROW.HEADERS)

  for (let colNumber = COLUMN.FIRST; colNumber <= COLUMN.LAST; colNumber++) {
    const value = getCellValue(row, colNumber)
    headers.push(value)
  }

  return headers
}

export async function parseSummaryLog({ summaryLog, filename }) {
  try {
    const workbook = new ExcelJS.Workbook()

    await workbook.xlsx.load(summaryLog)

    const actualWorksheets = workbook.worksheets.length
    const expectedWorksheets = Object.keys(WORKSHEET).length

    if (actualWorksheets < expectedWorksheets) {
      throw new Error(
        `Invalid summary log [${filename}] (expected ${expectedWorksheets} worksheets but found ${actualWorksheets})`
      )
    }

    const received = workbook.worksheets[WORKSHEET.Received]

    const headers = getHeaders(received)
    const content = getContent(received)

    return {
      sections: [
        {
          headers,
          content
        }
      ]
    }
  } catch (err) {
    logger.error(err, {
      message: `Failed to parse summary log: ${filename}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    throw err
  }
}
