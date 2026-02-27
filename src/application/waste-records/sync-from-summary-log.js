import { transformFromSummaryLog } from './transform-from-summary-log.js'
import {
  createTableSchemaGetter,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'
import {
  isEprMarker,
  SKIP_HEADER_ROW_TEXT
} from '#domain/summary-logs/markers.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/**
 * @typedef {import('./transform-from-summary-log.js').TransformableRow} TransformableRow
 */

/**
 * Prepares rows for transformation by building data objects
 *
 * @param {Array<string|null>} headers - Array of header names
 * @param {Array<{rowNumber: number, values: Array<*>}>} rows - Array of row objects with row number and values
 * @returns {TransformableRow[]} Array of rows with data objects built
 */
const isTemplateRow = (rowIdValue) => {
  if (rowIdValue === null || rowIdValue === undefined) {
    return true
  }
  if (
    typeof rowIdValue === 'string' &&
    rowIdValue.startsWith(SKIP_HEADER_ROW_TEXT)
  ) {
    return true
  }
  return false
}

const prepareRows = (headers, rows, rowIdField) => {
  // Build header to index map, excluding EPR markers and nulls
  const headerToIndexMap = new Map()
  for (const [index, header] of headers.entries()) {
    if (header !== null && !isEprMarker(header)) {
      headerToIndexMap.set(header, index)
    }
  }

  const rowIdIndex = headerToIndexMap.get(rowIdField)

  return rows.flatMap((row) => {
    const { values } = row

    if (rowIdIndex !== undefined && isTemplateRow(values[rowIdIndex])) {
      return []
    }

    const data = {}
    for (const [headerName, colIndex] of headerToIndexMap) {
      data[headerName] = values[colIndex]
    }

    return [{ data }]
  })
}

/**
 * Prepares parsed data by building row data objects
 *
 * Only processes tables that have schemas defined.
 *
 * @param {Object} parsedData - The parsed summary log data
 * @returns {Object} New structure with row data objects built
 */
const prepareRowsForTransformation = (parsedData) => {
  const processingType = parsedData?.meta?.PROCESSING_TYPE?.value
  const getTableSchema = createTableSchemaGetter(
    processingType,
    PROCESSING_TYPE_TABLES
  )
  const transformedData = {}

  for (const [tableName, tableData] of Object.entries(parsedData.data)) {
    const tableSchema = getTableSchema(tableName)
    if (!tableSchema) {
      transformedData[tableName] = tableData
      continue
    }
    transformedData[tableName] = {
      ...tableData,
      rows: prepareRows(
        tableData.headers,
        tableData.rows,
        tableSchema.rowIdField
      )
    }
  }

  return {
    ...parsedData,
    data: transformedData
  }
}

const resolveAccreditationId = async (summaryLog, organisationsRepository) => {
  if (summaryLog.accreditationId) {
    return summaryLog.accreditationId
  }

  if (organisationsRepository) {
    const registration = await organisationsRepository.findRegistrationById(
      summaryLog.organisationId,
      summaryLog.registrationId
    )
    return registration?.accreditationId
  }

  return undefined
}

const updateWasteBalances = async ({
  parsedData,
  accreditationId,
  wasteBalancesRepository,
  wasteRecords,
  user
}) => {
  // We only calculate waste balance for exporters and reprocessor inputs currently
  const processingType = parsedData?.meta?.PROCESSING_TYPE?.value
  const shouldCalculateWasteBalance =
    processingType === PROCESSING_TYPES.EXPORTER ||
    processingType === PROCESSING_TYPES.REPROCESSOR_INPUT ||
    processingType === PROCESSING_TYPES.REPROCESSOR_OUTPUT

  if (accreditationId && shouldCalculateWasteBalance) {
    await wasteBalancesRepository.updateWasteBalanceTransactions(
      wasteRecords.map((r) => r.record),
      accreditationId,
      user
    )
  }
}

const transformToWasteRecords = (
  preparedData,
  summaryLog,
  accreditationId,
  timestamp,
  existingRecords
) => {
  const summaryLogContext = {
    summaryLog: {
      id: summaryLog.file.id,
      uri: summaryLog.file.uri
    },
    organisationId: summaryLog.organisationId,
    registrationId: summaryLog.registrationId,
    accreditationId,
    timestamp
  }

  return transformFromSummaryLog(
    preparedData,
    summaryLogContext,
    existingRecords
  )
}

const prepareWasteRecordVersions = (wasteRecords) => {
  const wasteRecordVersions = new Map()
  for (const { record } of wasteRecords) {
    if (!wasteRecordVersions.has(record.type)) {
      wasteRecordVersions.set(record.type, new Map())
    }

    // Get the latest version (last in array) and its data
    const latestVersion = record.versions[record.versions.length - 1]
    wasteRecordVersions.get(record.type).set(record.rowId, {
      version: latestVersion,
      data: record.data
    })
  }
  return wasteRecordVersions
}

const calculateMetrics = (wasteRecords) => {
  const created = wasteRecords.filter((wr) => wr.change === 'created').length
  const updated = wasteRecords.filter((wr) => wr.change === 'updated').length

  return { created, updated }
}

/**
 * Orchestrates the extraction, transformation, and persistence of waste records from a summary log
 *
 * @param {Object} dependencies - The service dependencies
 * @param {Object} dependencies.extractor - The summary log extractor
 * @param {Object} dependencies.wasteRecordRepository - The waste record repository
 * @param {Object} dependencies.wasteBalancesRepository - The waste balances repository
 * @param {Object} dependencies.organisationsRepository - The organisations repository
 * @returns {Function} A function that accepts a summary log and returns a Promise
 */
export const syncFromSummaryLog = (dependencies) => {
  const {
    extractor,
    wasteRecordRepository,
    wasteBalancesRepository,
    organisationsRepository
  } = dependencies

  /**
   * @param {Object} summaryLog - The summary log to process
   * @param {Object} summaryLog.file - The file information
   * @param {string} summaryLog.file.id - The file ID
   * @param {string} summaryLog.file.uri - The S3 URI (e.g., s3://bucket/key)
   * @param {string} summaryLog.organisationId - The organisation ID
   * @param {string} summaryLog.registrationId - The registration ID
   * @param {string} [summaryLog.accreditationId] - The optional accreditation ID
   * @param {import('#common/helpers/auth/types.js').CommandUser} user - User context for audit logging
   * @returns {Promise<{created: number, updated: number}>} Counts of created and updated waste records
   */
  return async (summaryLog, user) => {
    const timestamp = new Date().toISOString()

    // 1. Extract/parse the summary log
    const parsedData = await extractor.extract(summaryLog)

    // 2. Extract row IDs for transformation
    const preparedData = prepareRowsForTransformation(parsedData)

    // 3. Load all existing waste records for this org/reg
    const existingRecordsArray = await wasteRecordRepository.findByRegistration(
      summaryLog.organisationId,
      summaryLog.registrationId
    )

    const accreditationId = await resolveAccreditationId(
      summaryLog,
      organisationsRepository
    )

    // 4. Convert to Map keyed by type:rowId for efficient lookup
    const existingRecords = new Map(
      existingRecordsArray.map((record) => [
        `${record.type}:${record.rowId}`,
        record
      ])
    )

    // 5. Transform to waste records
    const wasteRecords = transformToWasteRecords(
      preparedData,
      summaryLog,
      accreditationId,
      timestamp,
      existingRecords
    )

    // 6. Convert waste records to wasteRecordVersions Map structure
    const wasteRecordVersions = prepareWasteRecordVersions(wasteRecords)

    // 7. Append versions
    await wasteRecordRepository.appendVersions(
      summaryLog.organisationId,
      summaryLog.registrationId,
      wasteRecordVersions
    )

    // 8. Update waste balances if accreditation ID exists
    await updateWasteBalances({
      parsedData,
      accreditationId,
      wasteBalancesRepository,
      wasteRecords,
      user
    })

    // 9. Count created/updated records for metrics
    // The change property is set by transformFromSummaryLog
    return calculateMetrics(wasteRecords)
  }
}
