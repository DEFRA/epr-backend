import { ExcelJSSummaryLogsParser } from '#adapters/parsers/summary-logs/exceljs-parser.js'

/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */

/**
 * Creates a production summary log extractor that fetches from S3 and parses with ExcelJS
 * @param {Object} params
 * @param {UploadsRepository} params.uploadsRepository
 * @returns {SummaryLogExtractor}
 */
export const createSummaryLogExtractor = ({ uploadsRepository }) => {
  const parser = new ExcelJSSummaryLogsParser()

  return {
    /**
     * @param {SummaryLog} summaryLog
     * @returns {Promise<ParsedSummaryLog>}
     */
    extract: async (summaryLog) => {
      const {
        file: {
          s3: { bucket, key }
        }
      } = summaryLog

      const summaryLogBuffer = await uploadsRepository.findByLocation({
        bucket,
        key
      })

      if (!summaryLogBuffer) {
        throw new Error(
          'Something went wrong while retrieving your file upload'
        )
      }

      // @ts-expect-error - ExcelJS parser currently returns Workbook, will be converted to ParsedSummaryLog in future
      return parser.parse(summaryLogBuffer)
    }
  }
}
