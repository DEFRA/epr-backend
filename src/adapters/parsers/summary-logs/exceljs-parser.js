import ExcelJS from 'exceljs'

/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */

/**
 * ExcelJS-based implementation of SummaryLogsParser
 * @implements {SummaryLogsParser}
 */
export class ExcelJSSummaryLogsParser {
  /**
   * @param {Buffer} summaryLogBuffer
   * @returns {Promise<ExcelJS.Workbook>}
   */
  async parse(summaryLogBuffer) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(summaryLogBuffer)
    return workbook
  }
}
