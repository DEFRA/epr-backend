import { addRounded, toNumber } from '#common/helpers/decimal-utils.js'
import { monthKeyForDate } from '#common/helpers/dates/year-month.js'
import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { indexAccreditations } from '#waste-balances/application/accreditation-index.js'
import { classifyRecordForWasteBalance } from '#waste-balances/domain/waste-balance-classification.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'
import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
import {
  addFigures,
  monthlyContribution,
  NO_FIGURES,
  withNetCredit
} from '#market-insights/domain/waste-balance-figures.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#overseas-sites/repository/port.js').OverseasSitesRepository} OverseasSitesRepository
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').WasteBalanceFigures} WasteBalanceFigures
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').PublishedWasteBalanceFigures} PublishedWasteBalanceFigures
 * @typedef {import('#waste-balances/application/accreditation-index.js').AccreditationIndex} AccreditationIndex
 * @typedef {import('#waste-balances/repository/ledger-port.js').LatestSubmittedSummaryLogPerLedger} LatestSubmittedSummaryLogPerLedger
 * @typedef {import('#waste-records/repository/port.js').SubmittedRowState} SubmittedRowState
 * @typedef {import('#domain/organisations/registration.js').Registration} Registration
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').MonthlyContribution} MonthlyContribution
 */

/**
 * @typedef {Object} PublishedPartition
 * @property {string} summaryLogId - the partition's latest submission
 * @property {import('#domain/organisations/registration.js').Registration} registration
 * @property {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 * @property {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 */

/**
 * The figures for one material, accreditation type and reporting month, summed
 * across every operator that reported into it.
 *
 * @typedef {Object} WasteBalanceCell
 * @property {string} material
 * @property {string} accreditationType
 * @property {string} month - `YYYY-MM`
 * @property {WasteBalanceFigures} figures
 */

/**
 * @typedef {{ material: string, accreditationType: string, month: string } & PublishedWasteBalanceFigures} WasteBalanceTableRow
 */

/**
 * @typedef {Object} WasteBalanceTable
 * @property {{ generatedAt: string, reportingYear: number }} meta
 * @property {WasteBalanceTableRow[]} data
 */

/**
 * @param {{ organisationId: string, registrationId: string, accreditationId: string | null }} ledgerId
 * @returns {string}
 */
const partitionKey = ({ organisationId, registrationId, accreditationId }) =>
  JSON.stringify([organisationId, registrationId, accreditationId])

/**
 * @param {Pick<WasteBalanceCell, 'material' | 'accreditationType' | 'month'>} cell
 * @returns {string}
 */
const cellKey = ({ material, accreditationType, month }) =>
  `${material}::${accreditationType}::${month}`

/**
 * @param {WasteBalanceTableRow} a
 * @param {WasteBalanceTableRow} b
 * @returns {number}
 */
const compareRows = (a, b) =>
  a.material.localeCompare(b.material) ||
  a.accreditationType.localeCompare(b.accreditationType) ||
  a.month.localeCompare(b.month)

/**
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {string} accreditationId
 */
const warnAboutUnmatchedPartition = (logger, accreditationId) => {
  logger.warn({
    message: `Market insights waste balance left out a ledger partition whose accreditation no longer resolves: ${accreditationId}. Everything that partition reported is absent from the publication.`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: 'market_insights_partition_unmatched',
      reference: accreditationId
    }
  })
}

/**
 * @param {LatestSubmittedSummaryLogPerLedger[]} entries
 * @param {AccreditationIndex} accreditations
 * @param {Map<string, import('#overseas-sites/repository/port.js').OverseasSite>} sitesById
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @returns {Map<string, PublishedPartition>}
 */
const resolvePublishedPartitions = (
  entries,
  { index, testOrgAccreditationIds },
  sitesById,
  logger
) => {
  /** @type {Map<string, PublishedPartition>} */
  const partitions = new Map()
  for (const { ledgerId, summaryLogId } of entries) {
    const { accreditationId } = ledgerId
    if (accreditationId === null) {
      continue
    }
    const context = index.get(accreditationId)
    if (context === undefined) {
      if (!testOrgAccreditationIds.has(accreditationId)) {
        warnAboutUnmatchedPartition(logger, accreditationId)
      }
      continue
    }
    partitions.set(partitionKey(ledgerId), {
      summaryLogId,
      registration: context.registration,
      accreditation: context.accreditation,
      overseasSites: buildOverseasSitesContext(context.registration, sitesById)
    })
  }
  return partitions
}

/**
 * Eligibility is derived against today's accreditation and overseas-site data
 * rather than read from the classification stamped at submission.
 *
 * @param {SubmittedRowState} rowState
 * @param {Map<string, PublishedPartition>} partitions
 * @returns {PublishedRow | null}
 */
const publishedContribution = (rowState, partitions) => {
  const partition = partitions.get(partitionKey(rowState))
  if (partition === undefined) {
    return null
  }
  const { registration, accreditation, overseasSites } = partition
  const classification = classifyRecordForWasteBalance(
    { type: rowState.wasteRecordType, data: rowState.data },
    rowState.processingType,
    accreditation,
    overseasSites
  )

  const contribution = monthlyContribution(
    { ...rowState, classification },
    {
      wasteProcessingType: /** @type {WasteProcessingTypeValue} */ (
        registration.wasteProcessingType
      ),
      reprocessingType: registration.reprocessingType
    }
  )

  return contribution === null ? null : { registration, contribution }
}

/**
 * @typedef {Object} PublishedRow
 * @property {Registration} registration
 * @property {MonthlyContribution} contribution
 */

/**
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {Pick<WasteBalanceCell, 'material' | 'accreditationType' | 'month'>} cell
 * @param {WasteBalanceFigures} figures
 */
const foldIntoCell = (cells, cell, figures) => {
  const key = cellKey(cell)

  cells.set(key, {
    ...cell,
    figures: addFigures(cells.get(key)?.figures ?? NO_FIGURES, figures)
  })
}

/**
 * @typedef {Object} UnattributedRegistration
 * @property {Registration} registration
 * @property {WasteBalanceFigures} figures
 */

/**
 * @param {Map<string, UnattributedRegistration>} unattributed
 * @param {Registration} registration
 * @param {WasteBalanceFigures} figures
 */
const recordUnattributed = (unattributed, registration, figures) => {
  const seen = unattributed.get(registration.id)
  unattributed.set(registration.id, {
    registration,
    figures: addFigures(seen?.figures ?? NO_FIGURES, figures)
  })
}

/**
 * A month later than the clock cannot have happened, so a mis-keyed future date
 * is held back rather than published as supply.
 *
 * @param {number} reportingYear
 * @param {Date} now - clock reading supplied by the caller
 * @returns {(month: string) => boolean}
 */
const publishableMonthsOf = (reportingYear, now) => {
  const monthPrefix = `${reportingYear}-`
  const currentMonth = /** @type {string} */ (
    monthKeyForDate(now, UK_TIME_ZONE)
  )
  return (month) =>
    month.startsWith(monthPrefix) && month.localeCompare(currentMonth) <= 0
}

/**
 * @typedef {Object} UndatedTally
 * @property {{ rowCount: number, tonnage: number }} credits
 * @property {{ rowCount: number, tonnage: number }} deductions
 */

/** @returns {UndatedTally} */
const newUndatedTally = () => ({
  credits: { rowCount: 0, tonnage: 0 },
  deductions: { rowCount: 0, tonnage: 0 }
})

/**
 * @param {UndatedTally} undated
 * @param {import('#market-insights/domain/waste-balance-figures.js').MonthlyContribution} contribution
 */
const recordUndated = (undated, { deducts, figures }) => {
  const side = deducts ? undated.deductions : undated.credits
  const tonnage = deducts ? figures.sentOnDeductions : figures.totalCredited
  side.rowCount += 1
  side.tonnage = toNumber(addRounded(side.tonnage, tonnage, 2))
}

/**
 * @param {{ cells: Map<string, WasteBalanceCell>, undated: UndatedTally, unattributed: Map<string, UnattributedRegistration>, isPublishedMonth: (month: string) => boolean }} into
 * @param {PublishedRow} published
 */
const recordRow = (
  { cells, undated, unattributed, isPublishedMonth },
  { registration, contribution }
) => {
  const { month, figures } = contribution
  if (month === null) {
    recordUndated(undated, contribution)
    return
  }
  if (!isPublishedMonth(month)) {
    return
  }
  const material = resolveDetailedMaterial(registration) ?? ''
  if (material === '') {
    recordUnattributed(unattributed, registration, figures)
  }
  foldIntoCell(
    cells,
    { material, accreditationType: registration.wasteProcessingType, month },
    figures
  )
}

/**
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {Map<string, UnattributedRegistration>} unattributed
 */
const warnAboutUnattributedTonnage = (logger, unattributed) => {
  for (const [registrationId, { registration, figures }] of unattributed) {
    const processCount = (registration.glassRecyclingProcess ?? []).length
    logger.warn({
      message: `Market insights waste balance published registration ${registrationId} against no material: ${figures.eligibleForWasteBalance} eligible tonnes, ${figures.sentOnDeductions} tonnes sent on, ${figures.totalCredited} gross credited. It is registered for ${registration.material} carrying ${processCount} glass recycling processes, and only a registration left holding exactly one names a published glass row. Two means the forms ingest split never ran on it; none means a stored record the write path would reject today.`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: 'market_insights_material_unresolved',
        reference: registrationId
      }
    })
  }
}

/**
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {number} reportingYear
 * @param {UndatedTally} undated
 */
const warnAboutUndatedRows = (
  logger,
  reportingYear,
  { credits, deductions }
) => {
  if (credits.rowCount + deductions.rowCount === 0) {
    return
  }
  logger.warn({
    message: `Market insights waste balance found ${deductions.rowCount} sent-on row(s) totalling ${deductions.tonnage} tonnes and ${credits.rowCount} crediting row(s) totalling ${credits.tonnage} tonnes with no usable date, understating the deductions and the gross credited tonnage of whichever year they belong to. A row with no date belongs to no reporting year, so this count spans every submission read rather than ${reportingYear} alone.`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: 'market_insights_undated_rows'
    }
  })
}

/**
 * Aggregate the published UK Waste Balance figures for a reporting year, summed
 * by material, accreditation type and reporting month.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {number} params.reportingYear
 * @param {Date} params.now - clock reading supplied by the caller
 * @returns {Promise<WasteBalanceTable>}
 */
export const buildWasteBalanceTable = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationsRepository,
  overseasSitesRepository,
  logger,
  reportingYear,
  now
}) => {
  const [entries, organisations, allSites] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationsRepository.findAll(),
    overseasSitesRepository.findAll()
  ])

  const partitions = resolvePublishedPartitions(
    entries,
    indexAccreditations(organisations),
    new Map(allSites.map((site) => [site.id, site])),
    logger
  )

  const summaryLogIds = entries
    .filter((entry) => partitions.has(partitionKey(entry.ledgerId)))
    .map((entry) => entry.summaryLogId)

  const into = {
    /** @type {Map<string, WasteBalanceCell>} */
    cells: new Map(),
    undated: newUndatedTally(),
    /** @type {Map<string, UnattributedRegistration>} */
    unattributed: new Map(),
    isPublishedMonth: publishableMonthsOf(reportingYear, now)
  }

  for await (const rowState of summaryLogRowStatesRepository.streamRowStatesForSummaryLogs(
    summaryLogIds
  )) {
    const published = publishedContribution(rowState, partitions)
    if (published === null) {
      continue
    }
    recordRow(into, published)
  }

  warnAboutUndatedRows(logger, reportingYear, into.undated)
  warnAboutUnattributedTonnage(logger, into.unattributed)

  const data = [...into.cells.values()]
    .map(({ figures, ...cell }) => ({ ...cell, ...withNetCredit(figures) }))
    .sort(compareRows)

  return {
    meta: { generatedAt: now.toISOString(), reportingYear },
    data
  }
}
