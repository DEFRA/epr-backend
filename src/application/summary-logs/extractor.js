import { parse } from '#adapters/parsers/summary-logs/exceljs-parser.js'

/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */

const logParsingSummary = (logger, parsedData) => {
  const metadataEntries = Object.entries(parsedData.meta).map(
    ([key, value]) => ({
      name: key,
      value: value.value,
      location: value.location
    })
  )

  const dataEntries = Object.entries(parsedData.data).map(([key, value]) => ({
    tableName: key,
    headers: value.headers,
    exampleRow: value.rows[0] || null,
    rowCount: value.rows.length,
    location: value.location
  }))

  logger.info(
    {
      event: {
        action: 'summary-log-parsed',
        category: 'file-processing'
      }
    },
    'Summary log parsing completed: %d metadata entries, %d data tables',
    metadataEntries.length,
    dataEntries.length
  )

  metadataEntries.forEach((meta) => {
    logger.info(
      {
        event: {
          action: 'metadata-parsed',
          category: 'file-processing'
        }
      },
      'Metadata: %s = %s (at %s:%d:%s)',
      meta.name,
      meta.value,
      meta.location.sheet,
      meta.location.row,
      meta.location.column
    )
  })

  dataEntries.forEach((data) => {
    logger.info(
      {
        event: {
          action: 'data-table-parsed',
          category: 'file-processing'
        }
      },
      'Data table: %s - Headers: %s, Example row: %s, Row count: %d (at %s:%d:%s)',
      data.tableName,
      JSON.stringify(data.headers),
      JSON.stringify(data.exampleRow),
      data.rowCount,
      data.location.sheet,
      data.location.row,
      data.location.column
    )
  })
}

/**
 * Creates a production summary log extractor that fetches from S3 and parses with ExcelJS
 * @param {Object} params
 * @param {UploadsRepository} params.uploadsRepository
 * @param {import('#common/helpers/logging/logger.js').TypedLogger} params.logger
 * @returns {SummaryLogExtractor}
 */
export const createSummaryLogExtractor = ({ uploadsRepository, logger }) => {
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

      const parsedData = await parse(summaryLogBuffer)

      logParsingSummary(logger, parsedData)

      return parsedData
    }
  }
}
