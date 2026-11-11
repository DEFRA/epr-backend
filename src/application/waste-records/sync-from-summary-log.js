/** @import {SummaryLogFileId} from '#domain/summary-logs/ids.js' */
import { transformFromSummaryLog } from './transform-from-summary-log.js'
import { resolveOverseasSites } from './resolve-overseas-sites.js'
import { writeSummaryLogRowStates } from '#waste-records/application/write-summary-log-row-states.js'
import { summaryLogRowStatesForRegistration } from '#waste-records/application/read-summary-log-row-states.js'
import { classifyRecordChanges } from '#application/summary-logs/classify-record-changes.js'
import { RECORD_CHANGE } from '#application/summary-logs/record-change.js'
import { decemberRowCountFor } from '#waste-balances/application/december-credit-total.js'
import { classifyWasteRecord } from '#waste-balances/application/target-amount.js'
import {
  createTableSchemaGetter,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'
import {
  isEprMarker,
  SKIP_HEADER_ROW_TEXT
} from '#domain/summary-logs/markers.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/**
 * @import { TypedLogger } from '#common/helpers/logging/logger.js'
 * @import { ParsedSummaryLog } from '#domain/summary-logs/extractor/port.js'
 * @import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
 */

/**
 * @typedef {import('./transform-from-summary-log.js').TransformableRow} TransformableRow
 * @typedef {import('./transform-from-summary-log.js').ValidatedWasteRecord} ValidatedWasteRecord
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
 * @param {(string | null)[]} headers - Array of header names
 * @param {{rowNumber: number, values: *[]}[]} rows - Array of row objects with row number and values
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

/**
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Accreditation } from '#domain/organisations/accreditation.js'
 * @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js'
 */

/**
 * The numbers a summary log names its registration and accreditation by. The
 * accreditation number is `null` for a registered-only submission.
 *
 * @typedef {{
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber,
 *   accreditationNumber: AccreditationNumber | null
 * }} SubmissionNumbers
 */

/**
 * The accreditation a submit writes to: the one the summary log's
 * accreditation number names, or none for a registered-only submission.
 *
 * @param {Organisation} organisation
 * @param {AccreditationNumber | null} accreditationNumber
 * @returns {Accreditation | null}
 */
const findAccreditation = (organisation, accreditationNumber) => {
  if (accreditationNumber === null) {
    return null
  }

  const accreditation = organisation.accreditations.find(
    (candidate) => candidate.accreditationNumber === accreditationNumber
  )
  if (!accreditation) {
    throw new Error(`Accreditation not found: ${accreditationNumber}`)
  }
  return accreditation
}

/**
 * The accreditation a submission writes to, found by the summary log's
 * numbers, and the ledger it names.
 *
 * @param {import('#repositories/organisations/administration-port.js').OrganisationAdministrationRepository} organisationAdministrationRepository
 * @param {SubmissionNumbers} summaryLog
 * @returns {Promise<{ accreditation: Accreditation | null, ledgerId: WasteBalanceLedgerId }>}
 */
const resolveSubmissionLedger = async (
  organisationAdministrationRepository,
  summaryLog
) => {
  const organisation =
    await organisationAdministrationRepository.findByOrganisationNumber(
      summaryLog.organisationNumber
    )
  if (!organisation) {
    throw new Error(`Organisation not found: ${summaryLog.organisationNumber}`)
  }

  const holdsRegistration = organisation.registrations.some(
    (candidate) =>
      candidate.registrationNumber === summaryLog.registrationNumber
  )
  if (!holdsRegistration) {
    throw new Error(`Registration not found: ${summaryLog.registrationNumber}`)
  }

  const accreditation = findAccreditation(
    organisation,
    summaryLog.accreditationNumber
  )
  return {
    accreditation,
    ledgerId: {
      organisationNumber: summaryLog.organisationNumber,
      registrationNumber: summaryLog.registrationNumber,
      accreditationNumber: summaryLog.accreditationNumber
    }
  }
}

/**
 * @param {object} params
 * @param {ParsedSummaryLog} params.parsedData
 * @param {import('#domain/organisations/accreditation.js').Accreditation} params.accreditation
 * @param {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} params.wasteBalanceService
 * @param {{ record: import('#domain/waste-records/model.js').WasteRecord }[]} params.wasteRecords
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {SummaryLogFileId} params.summaryLogId
 * @param {WasteBalanceLedgerId} params.ledgerId
 */
const updateWasteBalances = async ({
  ledgerId,
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
      { user, accreditation, overseasSites, summaryLogId, ledgerId }
    )
  }
}

/**
 * How many of this submission's changed rows (added or adjusted) are
 * December rows eligible for the waste balance, for observability metrics.
 * `0` for registered-only submissions (`accreditation` is `null`).
 *
 * @param {ValidatedWasteRecord[]} changedRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 * @returns {number}
 */
const decemberWasteRowCountFor = (
  changedRecords,
  accreditation,
  overseasSites
) => {
  if (accreditation === null) {
    return 0
  }

  const classifiedRows = changedRecords.map(({ record }) =>
    classifyWasteRecord(
      record,
      record.data?.processingType,
      accreditation,
      overseasSites
    )
  )

  return decemberRowCountFor(classifiedRows, accreditation)
}

/**
 * Counts how the submission's rows changed against the registration's latest
 * committed submission — the same comparison the check-page classification
 * runs — for observability metrics. Added rows count as created, adjusted rows
 * as updated; unchanged rows do not count. Reads the committed head before the
 * commit, so it reflects the previous submission.
 *
 * `decemberWasteRowCount` is scoped to the same added-or-adjusted rows: an
 * unchanged December row carried over from a prior submission is not this
 * submission's activity, so it must not inflate the count.
 *
 * @param {object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} params.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @returns {Promise<{ created: number, updated: number, decemberWasteRowCount: number }>}
 */
const countRecordChanges = async ({
  wasteRecords,
  accreditation,
  overseasSites,
  ledgerId,
  ledgerRepository,
  summaryLogRowStatesRepository
}) => {
  const previousRowStates = await summaryLogRowStatesForRegistration({
    ...ledgerId,
    ledgerRepository,
    summaryLogRowStatesRepository
  })

  const submittedRowStatesByKey = new Map(
    previousRowStates.map((state) => [
      `${state.wasteRecordType}:${state.rowId}`,
      state
    ])
  )

  const recordChanges = classifyRecordChanges({
    wasteRecords,
    submittedRowStatesByKey,
    accreditation,
    overseasSites
  })

  let created = 0
  let updated = 0
  const changedRecords = []
  for (const wasteRecord of wasteRecords) {
    const change = recordChanges.get(
      `${wasteRecord.record.type}:${wasteRecord.record.rowId}`
    )
    if (change === RECORD_CHANGE.ADDED) {
      created += 1
    } else if (change === RECORD_CHANGE.ADJUSTED) {
      updated += 1
    } else {
      continue
    }
    changedRecords.push(wasteRecord)
  }

  return {
    created,
    updated,
    decemberWasteRowCount: decemberWasteRowCountFor(
      changedRecords,
      accreditation,
      overseasSites
    )
  }
}

/**
 * Commits the per-row state for every submission (keyed by accreditation
 * existence) and, for an accredited balance-bearing submission, its waste
 * balance.
 *
 * Every submission records a summary-log-submitted event marking that the
 * summary log was submitted. For an accredited submission that event also
 * carries the waste-balance delta (written via updateWasteBalances). A
 * registered-only / no-accreditation submission has no balance, so its event is
 * zero-delta — the submission is still recorded, it just moves no tonnage.
 *
 * @param {object} params
 * @param {SummaryLogFileId} params.summaryLogId
 * @param {WasteBalanceLedgerId} params.ledgerId
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} params.accreditation
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {ParsedSummaryLog} params.parsedData
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {ReturnType<typeof createWasteBalanceService>} params.wasteBalanceService
 */
const commitStateAndBalance = async ({
  summaryLogId,
  ledgerId,
  accreditation,
  wasteRecords,
  overseasSites,
  parsedData,
  user,
  summaryLogRowStatesRepository,
  wasteBalanceService
}) => {
  await writeSummaryLogRowStates({
    summaryLogRowStatesRepository,
    wasteRecords: wasteRecords.map((wasteRecord) => wasteRecord.record),
    accreditation,
    ledgerId,
    overseasSites,
    summaryLogId
  })

  if (accreditation) {
    await updateWasteBalances({
      ledgerId,
      parsedData,
      accreditation,
      wasteBalanceService,
      wasteRecords,
      user,
      overseasSites,
      summaryLogId
    })
  } else {
    await wasteBalanceService.commitSummaryLogSubmittedEvent(
      ledgerId,
      { summaryLogId, creditTotal: 0 },
      {
        id: user.id,
        ...(user.name && { name: user.name }),
        email: user.email
      }
    )
  }
}

/**
 * Orchestrates the extraction, transformation, and persistence of a summary log
 * submission: it commits the per-row state to the row-state collection and,
 * for accredited balance-bearing submissions, the waste balance.
 *
 * @param {Object} dependencies - The service dependencies
 * @param {Object} dependencies.extractor - The summary log extractor
 * @param {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} dependencies.wasteBalanceService - The waste balance application service
 * @param {Object} dependencies.organisationAdministrationRepository - The organisations repository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} dependencies.overseasSitesRepository - The overseas sites repository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} dependencies.summaryLogRowStatesRepository - The summary-log row states repository
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} dependencies.ledgerRepository - The ledger repository, read to classify created/updated against the committed head
 * @param {TypedLogger} dependencies.logger - Logger forwarded to extractor for trace correlation
 * @returns {Function} A function that accepts a summary log and returns a Promise
 */
export const syncFromSummaryLog = (dependencies) => {
  const {
    extractor,
    wasteBalanceService,
    organisationAdministrationRepository,
    overseasSitesRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    logger
  } = dependencies

  /**
   * @param {Object} summaryLog - The summary log to process
   * @param {Object} summaryLog.file - The file information
   * @param {SummaryLogFileId} summaryLog.file.id - The file ID
   * @param {string} summaryLog.file.uri - The S3 URI (e.g., s3://bucket/key)
   * @param {OrganisationNumber} summaryLog.organisationNumber
   * @param {RegistrationNumber} summaryLog.registrationNumber
   * @param {AccreditationNumber | null} summaryLog.accreditationNumber - `null` for a registered-only submission
   * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} user - Authenticated user driving the submit
   * @returns {Promise<{created: number, updated: number, decemberWasteRowCount: number}>} Counts of created and updated waste records, and how many changed rows carry December-attributable tonnage
   */
  return async (summaryLog, user) => {
    // 1. Extract/parse the summary log
    const parsedData = await extractor.extract(summaryLog, { logger })

    // 2. Extract row IDs for transformation
    const preparedData = prepareRowsForTransformation(parsedData)

    const { accreditation, ledgerId } = await resolveSubmissionLedger(
      organisationAdministrationRepository,
      summaryLog
    )

    // 3. Transform to waste records
    const wasteRecords = transformFromSummaryLog(preparedData)

    // 4. Resolve overseas sites for exporter ORS validation (VAL014)
    const processingType = parsedData?.meta?.PROCESSING_TYPE?.value
    const overseasSites =
      processingType === PROCESSING_TYPES.EXPORTER
        ? await resolveOverseasSites(
            organisationAdministrationRepository,
            overseasSitesRepository,
            summaryLog.organisationNumber,
            summaryLog.registrationNumber
          )
        : ORS_VALIDATION_DISABLED

    // 5. Classify created/updated against the committed head, before committing
    const metrics = await countRecordChanges({
      wasteRecords,
      accreditation,
      overseasSites,
      ledgerId,
      ledgerRepository,
      summaryLogRowStatesRepository
    })

    // 6. Commit per-row state for every submission and the balance for
    // accredited balance-bearing ones.
    await commitStateAndBalance({
      summaryLogId: summaryLog.file.id,
      ledgerId,
      accreditation,
      wasteRecords,
      overseasSites,
      parsedData,
      user,
      summaryLogRowStatesRepository,
      wasteBalanceService
    })

    return metrics
  }
}
