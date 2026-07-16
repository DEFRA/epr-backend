import { creditedTonnageByMonth } from '#waste-balances/domain/credited-tonnage.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'
import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { monthKeyForDate } from '#common/helpers/dates/year-month.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} SummaryLogRowStateRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#domain/organisations/model.js').Organisation} Organisation
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger
 */

/**
 * The report covers a fixed window: January 2026 (the first reporting month)
 * through the current month, as of generation. "Current month" is the
 * Europe/London calendar month — consistent with the project's month-boundary
 * decisions — so a submission just before UK midnight at a month end lands in
 * the month the operator sees, not the UTC one. Row dates themselves are
 * date-only strings bucketed in UTC by the domain, and are unaffected.
 */
const REPORT_START_MONTH = '2026-01'

const REPORT_TIME_ZONE = 'Europe/London'

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/**
 * A single flat row of the report — one accreditation in one month.
 *
 * @typedef {Object} CreditedTonnageRow
 * @property {string} month - `YYYY-MM`
 * @property {{ id: string, reference: string }} organisation - internal id and external reference
 * @property {{ id: string, accreditationNumber: string, processingType: string, material: string }} accreditation
 * @property {{ totalCredited: number, eligibleForWasteBalance: number, deductibleFromCredited: number }} tonnage
 */

/**
 * The report payload: generation metadata and the flat, sorted rows.
 *
 * @typedef {Object} CreditedTonnageReport
 * @property {{ generatedAt: string }} meta
 * @property {CreditedTonnageRow[]} data
 */

/**
 * The organisation context attached to an accreditation for the report: the
 * owning organisation, the linked registration (which carries the material and
 * processing type), and the accreditation itself.
 *
 * @typedef {Object} AccreditationContext
 * @property {Organisation} organisation
 * @property {import('#domain/organisations/registration.js').Registration} registration
 * @property {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 */

/**
 * The accreditation index plus the set of accreditation ids belonging to
 * dropped test organisations, so an unmatched ledger entry can be told apart:
 * a test-org accreditation is dropped by design, anything else is an orphan.
 *
 * @typedef {Object} AccreditationIndex
 * @property {Map<string, AccreditationContext>} index
 * @property {Set<string>} testOrgAccreditationIds
 */

/**
 * Index every non-test organisation's accreditations by id, carrying the linked
 * registration and owning organisation. No status filtering: suspended and
 * cancelled accreditations are indexed too — the row-level classification, not
 * the accreditation's current status, decides eligibility. A registered-only
 * registration (no accreditation) contributes nothing to the index. Test
 * organisations' accreditation ids are collected separately rather than indexed.
 *
 * @param {Organisation[]} organisations
 * @returns {AccreditationIndex}
 */
const indexAccreditations = (organisations) => {
  /** @type {Map<string, AccreditationContext>} */
  const index = new Map()
  /** @type {Set<string>} */
  const testOrgAccreditationIds = new Set()
  for (const organisation of organisations) {
    if (TEST_ORGANISATIONS.has(organisation.orgId)) {
      for (const accreditation of organisation.accreditations) {
        testOrgAccreditationIds.add(accreditation.id)
      }
      continue
    }
    const accreditationById = new Map(
      organisation.accreditations.map((accreditation) => [
        accreditation.id,
        accreditation
      ])
    )
    for (const registration of organisation.registrations) {
      const accreditation = registration.accreditationId
        ? accreditationById.get(registration.accreditationId)
        : undefined
      if (accreditation) {
        index.set(accreditation.id, {
          organisation,
          registration,
          accreditation
        })
      }
    }
  }
  return { index, testOrgAccreditationIds }
}

/**
 * Sort rows by material, then processing type, then organisation reference
 * (numerically), then accreditation (so one accreditation's months stay
 * contiguous), then month ascending.
 *
 * @param {CreditedTonnageRow} a
 * @param {CreditedTonnageRow} b
 * @returns {number}
 */
const compareRows = (a, b) =>
  a.accreditation.material.localeCompare(b.accreditation.material) ||
  a.accreditation.processingType.localeCompare(
    b.accreditation.processingType
  ) ||
  Number(a.organisation.reference) - Number(b.organisation.reference) ||
  a.accreditation.id.localeCompare(b.accreditation.id) ||
  a.month.localeCompare(b.month)

/**
 * Build the credited-tonnage report: one row per accredited-partition per month
 * (January 2026 → the month of `now`, zero-filled) derived from each
 * accreditation's latest submitted summary log.
 *
 * The ledger query yields one entry per accredited partition with a submission,
 * so accreditations with no submission never appear. Each entry's row states
 * are read at that submission's head and aggregated by the pure domain
 * function; the organisation join attaches the external reference, accreditation
 * number, processing type and effective material, and drops test organisations.
 * Rows dropped for a bad month-assignment date are counted per accreditation in
 * a structured log line.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {TypedLogger} params.logger
 * @param {Date} params.now - clock reading supplied by the caller; the report's upper month bound
 * @returns {Promise<CreditedTonnageReport>}
 */
export const buildCreditedTonnageReport = async ({
  ledgerRepository,
  summaryLogRowStateRepository,
  organisationsRepository,
  logger,
  now
}) => {
  const monthRange = {
    fromMonth: REPORT_START_MONTH,
    toMonth: /** @type {string} */ (monthKeyForDate(now, REPORT_TIME_ZONE))
  }

  const [entries, organisations] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationsRepository.findAll()
  ])

  const { index, testOrgAccreditationIds } = indexAccreditations(organisations)

  /** @type {CreditedTonnageRow[]} */
  const rows = []

  for (const { ledgerId, summaryLogId } of entries) {
    // The ledger query only ever yields accredited partitions, so
    // `accreditationId` is non-null here despite the ledger id's wider type.
    const accreditationId = /** @type {string} */ (ledgerId.accreditationId)
    const context = index.get(accreditationId)
    if (!context) {
      if (!testOrgAccreditationIds.has(accreditationId)) {
        logger.warn({
          message: `Credited tonnage report skipped a ledger entry with no matching accreditation: ${accreditationId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: 'credited_tonnage_ledger_entry_unmatched',
            reference: accreditationId
          }
        })
      }
      continue
    }

    const { organisation, registration, accreditation } = context

    const rowStates = await wasteRecordStatesForHead(
      summaryLogRowStateRepository,
      ledgerId,
      summaryLogId
    )

    const { months, skippedRowCount } = creditedTonnageByMonth(
      rowStates,
      {
        wasteProcessingType: /** @type {WasteProcessingTypeValue} */ (
          registration.wasteProcessingType
        ),
        reprocessingType: registration.reprocessingType
      },
      monthRange
    )

    if (skippedRowCount > 0) {
      logger.info({
        message: `Credited tonnage report skipped ${skippedRowCount} row(s) with a missing, unparseable or out-of-range date for accreditation ${accreditation.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: 'credited_tonnage_rows_skipped',
          reference: accreditation.id
        }
      })
    }

    const material = resolveDetailedMaterial(registration)
    const reference = String(organisation.orgId)
    const accreditationNumber = accreditation.accreditationNumber ?? ''

    for (const month of months) {
      rows.push({
        month: month.month,
        organisation: { id: organisation.id, reference },
        accreditation: {
          id: accreditation.id,
          accreditationNumber,
          processingType: registration.wasteProcessingType,
          material
        },
        tonnage: {
          totalCredited: month.totalCredited,
          eligibleForWasteBalance: month.eligibleForWasteBalance,
          deductibleFromCredited: month.deductibleFromCredited
        }
      })
    }
  }

  rows.sort(compareRows)

  return { meta: { generatedAt: now.toISOString() }, data: rows }
}
