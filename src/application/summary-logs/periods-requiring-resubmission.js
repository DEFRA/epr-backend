import { getOrsDetailsMap } from '#overseas-sites/application/get-ors-details-map.js'
import { getIssuedTonnage } from '#packaging-recycling-notes/application/get-issued-tonnage.js'
import { aggregateReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import {
  extractFigures,
  figuresAreEquivalent
} from '#reports/domain/resubmission/figures-equivalence.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { projectSummaryLogRowState } from '#waste-records/application/project-summary-log-row-state.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {PeriodRef} from '#reports/domain/period-key.js' */
/** @import {ReportsService} from '#reports/application/report-service.js' */
/** @import {PackagingRecyclingNotesRepository} from '#packaging-recycling-notes/repository/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {ReportableWasteRecordState} from '#reports/domain/aggregation/aggregate-report-detail.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Cadence} from '#reports/domain/cadence.js' */
/** @import {OperatorCategory} from '#reports/domain/operator-category.js' */
/** @import {OrsDetails} from '#overseas-sites/application/get-ors-details-map.js' */
/** @import {WasteRecordType} from '#domain/waste-records/model.js' */

/**
 * The per-period-invariant context aggregateAfterFigures needs, computed once
 * for the whole upload.
 *
 * @typedef {Object} AfterFiguresContext
 * @property {ReportableWasteRecordState[]} newHeadRowStates
 * @property {OperatorCategory} operatorCategory
 * @property {Map<string, OrsDetails>} orsDetailsMap
 * @property {Registration} registration
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {PackagingRecyclingNotesRepository} packagingRecyclingNotesRepository
 */

// The after-state is generated from this upload's in-memory rows, not a
// persisted head, so it has no submission provenance. extractFigures excludes
// source, so the nulls never reach the diff.
const NO_SOURCE = { summaryLogId: null, lastUploadedAt: null }

/**
 * Maps this upload's validated waste records to the row-state shape the report
 * aggregation reads, excluding IGNORED rows (out of the reporting range, so they
 * never contribute to a period's figures). Each summary log is a full snapshot,
 * so this upload IS the new head. Rows are projected through the same seam the
 * submit path persists them with, so the data (coerced tonnages, normalised
 * shape) matches the frozen report's head exactly.
 *
 * @param {ValidatedWasteRecord[]} wasteRecords
 * @param {Accreditation | null} accreditation
 * @param {OverseasSitesContext} overseasSites
 * @returns {ReportableWasteRecordState[]}
 */
const toNewHeadRowStates = (wasteRecords, accreditation, overseasSites) =>
  wasteRecords
    .filter((wasteRecord) => wasteRecord.outcome !== ROW_OUTCOME.IGNORED)
    .map((wasteRecord) => ({
      wasteRecordType: /** @type {WasteRecordType} */ (
        wasteRecord.wasteRecordType
      ),
      data: projectSummaryLogRowState(
        wasteRecord.record,
        accreditation,
        overseasSites
      ).data
    }))

/**
 * The id of the current stored report for a closed period. A closed period
 * always has a submitted current report, so this resolves in practice; the
 * optional-chaining is a defensive lookup the invariant makes unreachable.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {PeriodRef} period
 * @returns {string | undefined}
 */
/* v8 ignore start -- defensive lookup; the closed-period invariant guarantees the slot */
const currentReportIdForPeriod = (periodicReports, { year, cadence, period }) =>
  periodicReports.find((pr) => pr.year === year)?.reports?.[cadence]?.[period]
    ?.current?.id
/* v8 ignore stop */

/**
 * Generates the reported figures this upload would produce for one period: the
 * summary-log aggregation of the new head plus the current PRN issued tonnage,
 * matching the assembly the stored report was frozen from.
 *
 * @param {AfterFiguresContext & { period: PeriodRef }} params
 */
const aggregateAfterFigures = async ({
  period: { year, cadence, period },
  newHeadRowStates,
  operatorCategory,
  orsDetailsMap,
  registration,
  organisationId,
  registrationId,
  packagingRecyclingNotesRepository
}) => {
  const detail = aggregateReportDetail(newHeadRowStates, {
    operatorCategory,
    cadence: /** @type {Cadence} */ (cadence),
    year,
    period,
    source: NO_SOURCE,
    orsDetailsMap
  })

  const prn = await getIssuedTonnage(packagingRecyclingNotesRepository, {
    organisationId,
    registrationId,
    accreditationId: registration.accreditationId,
    startDate: detail.startDate,
    endDate: detail.endDate
  })

  return { ...detail, prn }
}

/**
 * Whether a closed period's reported figures changed between its frozen report
 * and what this upload would now produce.
 *
 * @param {object} params
 * @param {PeriodRef} params.period
 * @param {PeriodicReport[]} params.periodicReports
 * @param {ReportsService} params.reportsService
 * @param {AfterFiguresContext} params.afterContext
 * @returns {Promise<boolean>}
 */
const periodFiguresChanged = async ({
  period,
  periodicReports,
  reportsService,
  afterContext
}) => {
  const currentReportId = currentReportIdForPeriod(periodicReports, period)
  /* v8 ignore next 3 -- a closed period always has a current stored report */
  if (!currentReportId) {
    return true
  }

  const before = await reportsService.findReportById(currentReportId)
  const after = await aggregateAfterFigures({ period, ...afterContext })

  return !figuresAreEquivalent(extractFigures(before), extractFigures(after))
}

/**
 * Narrows the closed periods this upload touched to those whose reported figures
 * actually changed, so resubmission is required only when it carries new
 * information. Reads each period's frozen report as the before-state and
 * compares it against the figures this upload would now produce.
 *
 * @param {object} params
 * @param {PeriodRef[]} params.closedPeriods
 * @param {PeriodicReport[]} params.periodicReports
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {Registration | undefined} params.registration
 * @param {OverseasSitesContext} params.overseasSites
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {ReportsService} params.reportsService
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @returns {Promise<PeriodRef[]>}
 */
export const computePeriodsRequiringResubmission = async ({
  closedPeriods,
  periodicReports,
  wasteRecords,
  registration,
  overseasSites,
  organisationId,
  registrationId,
  reportsService,
  packagingRecyclingNotesRepository,
  overseasSitesRepository
}) => {
  if (closedPeriods.length === 0) {
    return []
  }
  /* v8 ignore next 3 -- closed periods only arise for a classified registration */
  if (!registration) {
    return []
  }

  const operatorCategory = getOperatorCategory(registration)
  const orsDetailsMap = await getOrsDetailsMap(
    overseasSitesRepository,
    registration.overseasSites
  )
  const newHeadRowStates = toNewHeadRowStates(
    wasteRecords,
    registration.accreditation ?? null,
    overseasSites
  )

  const afterContext = {
    newHeadRowStates,
    operatorCategory,
    orsDetailsMap,
    registration,
    organisationId,
    registrationId,
    packagingRecyclingNotesRepository
  }

  const changed = await Promise.all(
    closedPeriods.map((period) =>
      periodFiguresChanged({
        period,
        periodicReports,
        reportsService,
        afterContext
      })
    )
  )

  return closedPeriods.filter((_, index) => changed[index])
}
