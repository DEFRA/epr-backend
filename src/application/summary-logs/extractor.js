import {
  parse,
  PARSE_DEFAULTS
} from '#adapters/parsers/summary-logs/exceljs-parser.js'
import {
  PROCESSING_TYPE_TABLES,
  aggregateUnfilledValues
} from '#domain/summary-logs/table-schemas/index.js'

/**
 * @import { TypedLogger } from '#common/helpers/logging/logger.js'
 */

/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/model.js').StoredSummaryLog} StoredSummaryLog */

const FILE_PROCESSING_CATEGORY = 'file-processing'

/**
 * Summary log spreadsheet parse options.
 * Uses parser defaults with summary-log-specific worksheet requirement
 * and per-column placeholder normalisation from domain schemas.
 */
const SUMMARY_LOG_PARSE_OPTIONS = {
  requiredWorksheet: 'Cover',
  ...PARSE_DEFAULTS,
  unfilledValues: aggregateUnfilledValues(PROCESSING_TYPE_TABLES)
}

/**
 * @param {TypedLogger} logger
 * @param {ParsedSummaryLog} parsedData
 */
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
    headerCount: value.headers.length,
    rowCount: value.rows.length,
    location: value.location
  }))

  logger.info({
    message: 'Summary log parsing completed',
    event: {
      action: 'summary-log-parsed',
      category: FILE_PROCESSING_CATEGORY,
      reason: `metadataEntries=${metadataEntries.length} dataTables=${dataEntries.length}`
    }
  })

  for (const meta of metadataEntries) {
    logger.info({
      message: `Metadata: ${meta.name} = ${meta.value}`,
      event: {
        action: 'metadata-parsed',
        category: FILE_PROCESSING_CATEGORY,
        reason: `at ${meta.location.sheet}:${meta.location.row}:${meta.location.column}`
      }
    })
  }

  for (const data of dataEntries) {
    logger.info({
      message: `Data table: ${data.tableName}`,
      event: {
        action: 'data-table-parsed',
        category: FILE_PROCESSING_CATEGORY,
        reason: `headers=${data.headerCount} rows=${data.rowCount} at ${data.location.sheet}:${data.location.row}:${data.location.column}`
      }
    })
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

      const parsedData = await parse(
        summaryLogBuffer,
        SUMMARY_LOG_PARSE_OPTIONS
      )

      logParsingSummary(logger, parsedData)

      return parsedData
    }
  }
}
