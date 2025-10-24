import ExcelJS from 'exceljs'

export class ExcelJSSummaryLogsParser {
  /**
   * @param {Buffer} summaryLogBuffer
   * @returns {Promise<Object>}
   */
  async parse(summaryLogBuffer) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(summaryLogBuffer)
    return {
      meta: {},
      data: {}
    }
  }
}
