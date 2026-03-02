import {
  parse,
  PARSE_DEFAULTS
} from '#adapters/parsers/summary-logs/exceljs-parser.js'
import {
  PROCESSING_TYPE_TABLES,
  aggregateUnfilledValues
} from '#domain/summary-logs/table-schemas/index.js'
import { META_PLACEHOLDERS } from '#domain/summary-logs/meta-fields.js'

/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/model.js').StoredSummaryLog} StoredSummaryLog */

const FILE_PROCESSING_CATEGORY = 'file-processing'

/**
 * Summary log spreadsheet parse options.
 * Uses parser defaults with summary-log-specific worksheet requirement,
 * per-column placeholder normalisation from domain schemas, and
 * metadata placeholder normalisation.
 */
const SUMMARY_LOG_PARSE_OPTIONS = {
  requiredWorksheet: 'Cover',
  ...PARSE_DEFAULTS,
  unfilledValues: aggregateUnfilledValues(PROCESSING_TYPE_TABLES),
  metaPlaceholders: META_PLACEHOLDERS
}

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
      'Data table: %s - %d headers, %d rows (at %s:%d:%s)',
      data.tableName,
      data.headerCount,
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

      const parsedData = await parse(
        summaryLogBuffer,
        SUMMARY_LOG_PARSE_OPTIONS
      )

      logParsingSummary(logger, parsedData)

      return parsedData
    }
  }
}
