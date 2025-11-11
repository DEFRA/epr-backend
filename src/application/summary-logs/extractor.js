import { parse } from '#adapters/parsers/summary-logs/exceljs-parser.js'

/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */
/** @typedef {import('#domain/summary-logs/model.js').StoredFile} StoredFile */

/**
 * @typedef {Object} StoredSummaryLog
 * @property {import('#domain/summary-logs/status.js').SummaryLogStatus} status
 * @property {StoredFile} file
 * @property {string} [failureReason]
 * @property {import('#domain/summary-logs/model.js').Validation} [validation]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 */

const FILE_PROCESSING_CATEGORY = 'file-processing'

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
    exampleRow: value.rows[1] || null,
    rowCount: value.rows.length,
    location: value.location
  }))

  logger.info(
    {
      event: {
        action: 'summary-log-parsed',
        category: FILE_PROCESSING_CATEGORY
      }
    },
    'Summary log parsing completed: %d metadata entries, %d data tables',
    metadataEntries.length,
    dataEntries.length
  )

  for (const meta of metadataEntries) {
    logger.info(
      {
        event: {
          action: 'metadata-parsed',
          category: FILE_PROCESSING_CATEGORY
        }
      },
      'Metadata: %s = %s (at %s:%d:%s)',
      meta.name,
      meta.value,
      meta.location.sheet,
      meta.location.row,
      meta.location.column
    )
  }

  for (const data of dataEntries) {
    logger.info(
      {
        event: {
          action: 'data-table-parsed',
          category: FILE_PROCESSING_CATEGORY
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
  }
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
     * @param {StoredSummaryLog} summaryLog
     * @returns {Promise<ParsedSummaryLog>}
     */
    extract: async (summaryLog) => {
      const {
        file: { uri }
      } = summaryLog

      const summaryLogBuffer = await uploadsRepository.findByLocation(uri)

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
