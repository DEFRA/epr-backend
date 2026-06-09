import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  PROCESSING_TYPE_TABLES,
  findSchemaForProcessingType
} from '#domain/summary-logs/table-schemas/index.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { isNil } from '#common/helpers/is-nil.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { buildTransactionAmounts } from './transaction-amounts.js'
import { classifyByPeriodStatus } from './period-status.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {LoadsByPeriodStatus} from './period-status.js' */

/**
 * @typedef {Object} LoadCategory
 * @property {number} count - Total count of loads
 * @property {string[]} rowIds - Row IDs (truncated to MAX_ROW_IDS)
 */

/**
 * @typedef {Object} LoadValidity
 * @property {LoadCategory} valid - Valid loads (no issues)
 * @property {LoadCategory} invalid - Invalid loads (has issues)
 * @property {LoadCategory} included - Loads included in Waste Balance calculation
 * @property {LoadCategory} excluded - Loads excluded from Waste Balance calculation
 */

/**
 * @typedef {Object} ValidityCounts
 * @property {LoadCategory} valid - Valid loads (no issues)
 * @property {LoadCategory} invalid - Invalid loads (has issues)
 */

/**
 * @typedef {Object} InclusionCounts
 * @property {LoadCategory} included - Loads included in Waste Balance calculation
 * @property {LoadCategory} excluded - Loads excluded from Waste Balance calculation
 */

/**
 * @typedef {Object} Loads
 * @property {LoadValidity} added - Loads added in this upload
 * @property {LoadValidity} unchanged - Loads unchanged from previous uploads
 * @property {LoadValidity} adjusted - Loads adjusted in this upload
 */

/**
 * @typedef {{ wasteRecordType: string, sheetName: string } & Loads} LoadsByWasteRecordTypeEntry
 * @typedef {LoadsByWasteRecordTypeEntry[]} LoadsByWasteRecordType
 */

const MAX_ROW_IDS = 100

/**
 * Creates a fresh empty load category
 *
 * @returns {LoadCategory}
 */
export const createEmptyLoadCategory = () => ({ count: 0, rowIds: [] })

/**
 * Creates a fresh empty load validity structure
 *
 * @returns {LoadValidity}
 */
export const createEmptyLoadValidity = () => ({
  valid: createEmptyLoadCategory(),
  invalid: createEmptyLoadCategory(),
  included: createEmptyLoadCategory(),
  excluded: createEmptyLoadCategory()
})

/**
 * Creates an empty loads structure
 *
 * @returns {Loads}
 */
export const createEmptyLoads = () => ({
  added: createEmptyLoadValidity(),
  unchanged: createEmptyLoadValidity(),
  adjusted: createEmptyLoadValidity()
})

const emptyValidityBucket = () => ({
  valid: createEmptyLoadCategory(),
  invalid: createEmptyLoadCategory()
})

const emptyInclusionBucket = () => ({
  included: createEmptyLoadCategory(),
  excluded: createEmptyLoadCategory()
})

/**
 * Determines the classification for a transformed record
 *
 * Classification is based on whether a version was added in this upload:
 * - added: Record was created in this upload (1 version, status CREATED, matching summaryLogId)
 * - adjusted: Record had a version added in this upload (last version has status UPDATED and matching summaryLogId)
 * - unchanged: No version was added in this upload
 *
 * @param {ValidatedWasteRecord['record']} record - The waste record
 * @param {string} summaryLogId - The current summary log ID
 * @returns {'added'|'unchanged'|'adjusted'} The classification
 */
const determineRecordStatus = (record, summaryLogId) => {
  const lastVersion = record.versions[record.versions.length - 1]

  // Check if the last version was created in this upload
  if (lastVersion.summaryLog?.id !== summaryLogId) {
    return 'unchanged'
  }

  // Version was added in this upload - determine if added or adjusted
  return lastVersion.status === VERSION_STATUS.CREATED ? 'added' : 'adjusted'
}

/**
 * Returns a new load category with the rowId added (up to MAX_ROW_IDS)
 *
 * @param {LoadCategory} category - The existing category
 * @param {string} rowId - The row ID to append
 * @returns {LoadCategory}
 */
const addToCategory = (category, rowId) => ({
  count: category.count + 1,
  rowIds:
    category.rowIds.length < MAX_ROW_IDS
      ? [...category.rowIds, rowId]
      : category.rowIds
})

/**
 * Counts validation results (valid/invalid) for ALL rows, grouped by record status.
 * Skips IGNORED rows.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - All waste records (all tables)
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {{ added: ValidityCounts, unchanged: ValidityCounts, adjusted: ValidityCounts }}
 */
export const countByValidity = ({ wasteRecords, summaryLogId }) =>
  wasteRecords
    .filter((wr) => wr.outcome !== ROW_OUTCOME.IGNORED)
    .reduce(
      (acc, { record, issues }) => {
        const status = determineRecordStatus(record, summaryLogId)
        const key =
          /** @type {ValidationIssue[]} */ (issues).length > 0
            ? 'invalid'
            : 'valid'
        return {
          ...acc,
          [status]: {
            ...acc[status],
            [key]: addToCategory(acc[status][key], record.rowId)
          }
        }
      },
      {
        added: emptyValidityBucket(),
        unchanged: emptyValidityBucket(),
        adjusted: emptyValidityBucket()
      }
    )

/**
 * Classifies loads by included/excluded for waste-balance table rows only.
 * IGNORED rows are counted as excluded for added and adjusted loads.
 * IGNORED unchanged loads are skipped — re-uploaded with no data change, so no new user action to surface.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Waste-balance table records only
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {{ added: InclusionCounts, unchanged: InclusionCounts, adjusted: InclusionCounts }}
 */
export const countByWasteBalanceInclusion = ({ wasteRecords, summaryLogId }) =>
  wasteRecords.reduce(
    (acc, { record, outcome }) => {
      const status = determineRecordStatus(record, summaryLogId)
      if (outcome === ROW_OUTCOME.IGNORED && status === 'unchanged') {
        return acc
      }
      const key = outcome === ROW_OUTCOME.INCLUDED ? 'included' : 'excluded'
      return {
        ...acc,
        [status]: {
          ...acc[status],
          [key]: addToCategory(acc[status][key], record.rowId)
        }
      }
    },
    {
      added: emptyInclusionBucket(),
      unchanged: emptyInclusionBucket(),
      adjusted: emptyInclusionBucket()
    }
  )

/**
 * Merges validation results (valid/invalid) and classification results (included/excluded)
 * into the full Loads structure.
 *
 * @param {{ added: ValidityCounts, unchanged: ValidityCounts, adjusted: ValidityCounts }} validationResults
 * @param {{ added: InclusionCounts, unchanged: InclusionCounts, adjusted: InclusionCounts }} classificationResults
 * @returns {Loads}
 */
export const mergeLoads = (validationResults, classificationResults) => ({
  added: { ...validationResults.added, ...classificationResults.added },
  unchanged: {
    ...validationResults.unchanged,
    ...classificationResults.unchanged
  },
  adjusted: { ...validationResults.adjusted, ...classificationResults.adjusted }
})

/**
 * Groups waste records by wasteRecordType and computes per-type load counts.
 * Uses a Map to guarantee unique wasteRecordType entries by construction.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - All waste records with tableName and wasteRecordType
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords - Waste-balance-eligible records only
 * @param {string} params.summaryLogId - The current summary log ID
 * @param {Object<string, { sheetName: string, wasteRecordType: string }>} params.tableSchemas - Table schemas keyed by table name
 * @returns {LoadsByWasteRecordType}
 */
export const countByWasteRecordType = ({
  wasteRecords,
  wasteBalanceRecords,
  summaryLogId,
  tableSchemas
}) => {
  const wasteBalancesGroupedByType = Map.groupBy(
    wasteBalanceRecords,
    (wr) => wr.wasteRecordType
  )
  const wasteRecordsGroupedByType = Map.groupBy(
    wasteRecords,
    (wr) => wr.wasteRecordType
  )

  const expectedTypes = new Map(
    Object.values(tableSchemas).map(({ wasteRecordType, sheetName }) => [
      wasteRecordType,
      sheetName
    ])
  )

  return Array.from(expectedTypes.entries()).map(([type, sheetName]) => ({
    wasteRecordType: type,
    sheetName,
    ...mergeLoads(
      countByValidity({
        wasteRecords: wasteRecordsGroupedByType.get(type) ?? [],
        summaryLogId
      }),
      countByWasteBalanceInclusion({
        wasteRecords: wasteBalancesGroupedByType.get(type) ?? [],
        summaryLogId
      })
    )
  }))
}

/**
 * Computes aggregate, per-waste-record-type, and per-period-status load
 * counts for validated summary logs.
 *
 * @param {Object} params
 * @param {string} params.status - Summary log status after validation
 * @param {ValidatedWasteRecord[] | null} params.wasteRecords
 * @param {string} params.summaryLogId
 * @param {import('#domain/summary-logs/meta-fields.js').ProcessingType} [params.processingType]
 * @param {Registration} [params.registration]
 * @param {Map<string, WasteRecord>} [params.existingRecordsMap]
 * @param {PeriodicReport[] | null} [params.submittedReports] - null skips period-status classification
 * @returns {{ loads: Loads | null, loadsByWasteRecordType: LoadsByWasteRecordType | null, loadsByPeriodStatus: LoadsByPeriodStatus | null }}
 */
export const classifyLoads = ({
  processingType,
  status,
  summaryLogId,
  wasteRecords,
  registration,
  existingRecordsMap,
  submittedReports
}) => {
  if (status !== SUMMARY_LOG_STATUS.VALIDATED || !wasteRecords) {
    return {
      loads: null,
      loadsByWasteRecordType: null,
      loadsByPeriodStatus: null
    }
  }

  const tableSchemas = PROCESSING_TYPE_TABLES[processingType]
  const wasteBalanceRecords = filterWasteBalanceRecords(
    wasteRecords,
    processingType
  )

  const loads = mergeLoads(
    countByValidity({ wasteRecords, summaryLogId }),
    countByWasteBalanceInclusion({
      wasteRecords: wasteBalanceRecords,
      summaryLogId
    })
  )

  const loadsByWasteRecordType = countByWasteRecordType({
    wasteRecords,
    wasteBalanceRecords,
    summaryLogId,
    tableSchemas
  })

  const loadsByPeriodStatus = computePeriodStatus({
    wasteRecords,
    wasteBalanceRecords,
    summaryLogId,
    registration,
    existingRecordsMap,
    submittedReports,
    tableSchemas
  })

  return { loads, loadsByWasteRecordType, loadsByPeriodStatus }
}

/**
 * Computes loadsByPeriodStatus when all preconditions are met.
 * Returns null if any required input is missing.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords
 * @param {string} params.summaryLogId
 * @param {Registration} [params.registration]
 * @param {Map<string, WasteRecord>} [params.existingRecordsMap]
 * @param {PeriodicReport[] | null} [params.submittedReports]
 * @param {Record<string, import('#domain/summary-logs/table-schemas/index.js').TableSchema>} [params.tableSchemas]
 * @returns {LoadsByPeriodStatus | null}
 */
const computePeriodStatus = ({
  wasteRecords,
  wasteBalanceRecords,
  summaryLogId,
  registration,
  existingRecordsMap,
  submittedReports,
  tableSchemas
}) => {
  if (
    !registration ||
    !existingRecordsMap ||
    !tableSchemas ||
    !submittedReports
  ) {
    return null
  }

  /** @param {string} wasteRecordType */
  const findSchema = (wasteRecordType) => {
    const match = Object.values(tableSchemas).find(
      (s) => s.wasteRecordType === wasteRecordType
    )
    return match ?? null
  }

  const transactionAmounts = buildTransactionAmounts({
    wasteBalanceRecords,
    summaryLogId,
    existingRecordsMap,
    findSchema,
    context: {
      accreditation: registration.accreditation ?? null,
      overseasSites: ORS_VALIDATION_DISABLED
    }
  })

  return classifyByPeriodStatus({
    wasteRecords,
    summaryLogId,
    registration,
    submittedReports,
    tableSchemas,
    transactionAmounts,
    existingRecordsMap
  })
}

/**
 * Filters waste records to only those from tables that participate in waste balance.
 *
 * @param {ValidatedWasteRecord[] | null} wasteRecords
 * @param {string} [processingType]
 * @returns {ValidatedWasteRecord[]}
 */
export const filterWasteBalanceRecords = (wasteRecords, processingType) => {
  if (!processingType) {
    return []
  }
  return (
    wasteRecords?.filter((wr) => {
      const schema = findSchemaForProcessingType(processingType, wr.record.type)
      return !isNil(schema?.classifyForWasteBalance)
    }) ?? []
  )
}
