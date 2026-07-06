import { transformFromSummaryLog } from './transform-from-summary-log.js'
import { resolveOverseasSites } from './resolve-overseas-sites.js'
import { writeSummaryLogRowStates } from '#waste-records/application/write-summary-log-row-states.js'
import {
  createTableSchemaGetter,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'
import {
  isEprMarker,
  SKIP_HEADER_ROW_TEXT
} from '#domain/summary-logs/markers.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_CHANGE } from '#domain/waste-records/model.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/**
 * @import { TypedLogger } from '#common/helpers/logging/logger.js'
 */

/**
 * @typedef {import('./transform-from-summary-log.js').TransformableRow} TransformableRow
 */

/**
 * Is this a template row?
 *
 * @param {string | null | undefined} rowIdValue
 * @returns {boolean}
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

/**
 * Prepares rows for transformation by building data objects
 *
 * Row values are stored as ExcelJS produced them. Schema-driven type
 * coercion happens at read time (see #reports/domain/aggregation/
 * coerce-waste-record.js), so the persisted record preserves the
 * user's original input.
 *
 * @param {Array<string|null>} headers - Array of header names
 * @param {Array<{rowNumber: number, values: Array<*>}>} rows - Array of row objects with row number and values
 * @param {string} rowIdField - The header name used to identify the row ID
 * @returns {TransformableRow[]} Array of rows with data objects built
 */
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

    // Sync re-syncs already-validated records; outcome required by type, unread here.
    return [{ data, outcome: ROW_OUTCOME.INCLUDED }]
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

  const registration = await organisationsRepository.findRegistrationById(
    summaryLog.organisationId,
    summaryLog.registrationId
  )
  return registration?.accreditationId
}

const resolveAccreditation = async (
  organisationsRepository,
  organisationId,
  accreditationId
) => {
  const accreditation = await organisationsRepository.findAccreditationById(
    organisationId,
    accreditationId
  )

  if (!accreditation) {
    throw new Error(`Accreditation not found: ${accreditationId}`)
  }

  return accreditation
}

/**
 * @param {object} params
 * @param {object} params.parsedData
 * @param {import('#domain/organisations/accreditation.js').Accreditation} params.accreditation
 * @param {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} params.wasteBalanceService
 * @param {Array<{ record: import('#domain/waste-records/model.js').WasteRecord }>} params.wasteRecords
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {string} params.summaryLogId
 */
const updateWasteBalances = async ({
  parsedData,
  accreditation,
  wasteBalanceService,
  wasteRecords,
  user,
  overseasSites,
  summaryLogId
}) => {
  // We only calculate waste balance for exporters and reprocessor inputs currently
  const processingType = parsedData?.meta?.PROCESSING_TYPE?.value
  const shouldCalculateWasteBalance =
    processingType === PROCESSING_TYPES.EXPORTER ||
    processingType === PROCESSING_TYPES.REPROCESSOR_INPUT ||
    processingType === PROCESSING_TYPES.REPROCESSOR_OUTPUT

  if (shouldCalculateWasteBalance) {
    await wasteBalanceService.submitSummaryLog(
      wasteRecords.map((r) => r.record),
      { user, accreditation, overseasSites, summaryLogId }
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
  const created = wasteRecords.filter(
    (wr) => wr.change === WASTE_RECORD_CHANGE.CREATED
  ).length
  const updated = wasteRecords.filter(
    (wr) => wr.change === WASTE_RECORD_CHANGE.UPDATED
  ).length

  return { created, updated }
}

/**
 * Resolves the accreditation (when one exists, any status) and commits the
 * per-row state for every submission (flag-gated, keyed by accreditation
 * existence).
 *
 * Every submission records a summary-log-submitted event marking that the
 * summary log was submitted. For an accredited submission that event also
 * carries the waste-balance delta (written via updateWasteBalances). A
 * registered-only / no-accreditation submission has no balance, so its event is
 * zero-delta — the submission is still recorded, it just moves no tonnage. That
 * zero-delta emission is flag-gated.
 *
 * @param {object} params
 * @param {object} params.summaryLog
 * @param {string | undefined} params.accreditationId
 * @param {Array<{ record: import('#domain/waste-records/model.js').WasteRecord }>} params.wasteRecords
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {object} params.parsedData
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {object} params.organisationsRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.featureFlags]
 * @param {object} params.wasteBalanceService
 */
const commitStateAndBalance = async ({
  summaryLog,
  accreditationId,
  wasteRecords,
  overseasSites,
  parsedData,
  user,
  organisationsRepository,
  summaryLogRowStateRepository,
  featureFlags,
  wasteBalanceService
}) => {
  const accreditation = accreditationId
    ? await resolveAccreditation(
        organisationsRepository,
        summaryLog.organisationId,
        accreditationId
      )
    : null

  await writeSummaryLogRowStates({
    summaryLogRowStateRepository,
    featureFlags,
    wasteRecords: wasteRecords.map((wasteRecord) => wasteRecord.record),
    accreditation,
    ledgerId: {
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      accreditationId: accreditationId ?? null
    },
    overseasSites,
    summaryLogId: summaryLog.file.id
  })

  if (accreditationId) {
    await updateWasteBalances({
      parsedData,
      accreditation,
      wasteBalanceService,
      wasteRecords,
      user,
      overseasSites,
      summaryLogId: summaryLog.file.id
    })
  } else if (featureFlags?.isRegisteredOnlySubmittedEventsEnabled()) {
    await wasteBalanceService.commitSummaryLogSubmittedEvent(
      {
        registrationId: summaryLog.registrationId,
        accreditationId: null,
        organisationId: summaryLog.organisationId
      },
      { summaryLogId: summaryLog.file.id, creditTotal: 0 },
      {
        id: user.id,
        ...(user.name && { name: user.name }),
        email: user.email
      }
    )
  } else {
    // Registered-only submission with the flag off: its summary-log-submitted
    // event is not recorded yet.
  }
}

/**
 * Orchestrates the extraction, transformation, and persistence of waste records from a summary log
 *
 * @param {Object} dependencies - The service dependencies
 * @param {Object} dependencies.extractor - The summary log extractor
 * @param {Object} dependencies.wasteRecordRepository - The waste record repository
 * @param {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} dependencies.wasteBalanceService - The waste balance application service
 * @param {Object} dependencies.organisationsRepository - The organisations repository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} dependencies.overseasSitesRepository - The overseas sites repository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} dependencies.summaryLogRowStateRepository - The summary-log row states repository
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [dependencies.featureFlags] - Feature flags gating the row-state write
 * @param {TypedLogger} dependencies.logger - Logger forwarded to extractor for trace correlation
 * @returns {Function} A function that accepts a summary log and returns a Promise
 */
export const syncFromSummaryLog = (dependencies) => {
  const {
    extractor,
    wasteRecordRepository,
    wasteBalanceService,
    organisationsRepository,
    overseasSitesRepository,
    summaryLogRowStateRepository,
    featureFlags,
    logger
  } = dependencies

  /**
   * @param {Object} summaryLog - The summary log to process
   * @param {Object} summaryLog.file - The file information
   * @param {string} summaryLog.file.id - The file ID
   * @param {string} summaryLog.file.uri - The S3 URI (e.g., s3://bucket/key)
   * @param {string} summaryLog.organisationId - The organisation ID
   * @param {string} summaryLog.registrationId - The registration ID
   * @param {string} [summaryLog.accreditationId] - The optional accreditation ID
   * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} user - Authenticated user driving the submit
   * @returns {Promise<{created: number, updated: number}>} Counts of created and updated waste records
   */
  return async (summaryLog, user) => {
    const timestamp = new Date().toISOString()

    // 1. Extract/parse the summary log
    const parsedData = await extractor.extract(summaryLog, { logger })

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

    // 8. Resolve overseas sites for exporter ORS validation (VAL014)
    const processingType = parsedData?.meta?.PROCESSING_TYPE?.value
    const overseasSites =
      processingType === PROCESSING_TYPES.EXPORTER
        ? await resolveOverseasSites(
            organisationsRepository,
            overseasSitesRepository,
            summaryLog.organisationId,
            summaryLog.registrationId
          )
        : ORS_VALIDATION_DISABLED

    // 9. Commit per-row state for every submission and the balance for
    // accredited balance-bearing ones.
    await commitStateAndBalance({
      summaryLog,
      accreditationId,
      wasteRecords,
      overseasSites,
      parsedData,
      user,
      organisationsRepository,
      summaryLogRowStateRepository,
      featureFlags,
      wasteBalanceService
    })

    // 10. Count created/updated records for metrics
    // The change property is set by transformFromSummaryLog
    return calculateMetrics(wasteRecords)
  }
}
