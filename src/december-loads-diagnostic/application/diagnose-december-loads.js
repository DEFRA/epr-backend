import { processingTypeFor } from '#waste-balances/domain/credited-tonnage.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import {
  accreditationDecemberKey,
  countDecemberContributingRows
} from '#december-loads-diagnostic/domain/december-contributing-rows.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#domain/organisations/model.js').Organisation} Organisation
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger
 */

/**
 * One affected summary log: an accreditation whose current submission already
 * holds rows that would move its December waste portion.
 *
 * @typedef {Object} DecemberLoadRow
 * @property {string} organisationId - internal id
 * @property {string} organisationReference - external org reference
 * @property {string} accreditationId
 * @property {string} accreditationNumber
 * @property {string} processingType
 * @property {string} decemberKey - `YYYY-12`
 * @property {number} decemberRowCount
 */

/**
 * @typedef {Object} DecemberLoadsSummary
 * @property {number} scannedAccreditations - accredited submissions matched and scanned
 * @property {number} affectedAccreditations - scanned submissions with a nonzero count
 * @property {number} totalDecemberRows - sum of December-affecting rows across the affected set
 */

/**
 * @typedef {Object} DecemberLoadsReport
 * @property {DecemberLoadRow[]} reports
 * @property {DecemberLoadsSummary} summary
 */

/**
 * @typedef {Object} AccreditationContext
 * @property {Organisation} organisation
 * @property {import('#domain/organisations/registration.js').Registration} registration
 * @property {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 */

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/**
 * Index every non-test organisation's accreditations by id, carrying the linked
 * registration and owning organisation. No status filtering: the diagnostic
 * reports on what a submission holds, not the accreditation's current status.
 * Test organisations' accreditation ids are collected separately so an
 * unmatched ledger entry can be told apart from an orphan.
 *
 * @param {Organisation[]} organisations
 * @returns {{ index: Map<string, AccreditationContext>, testOrgAccreditationIds: Set<string> }}
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
 * Sort affected rows by organisation reference (numerically) then accreditation
 * id, so a diagnostic run reads in a stable order.
 *
 * @param {DecemberLoadRow} a
 * @param {DecemberLoadRow} b
 * @returns {number}
 */
const compareRows = (a, b) =>
  Number(a.organisationReference) - Number(b.organisationReference) ||
  a.accreditationId.localeCompare(b.accreditationId)

/**
 * Count the December-affecting rows an accreditation's current submission holds,
 * reading its row states at the submitted head.
 *
 * @param {Object} params
 * @param {AccreditationContext} params.context
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {string} params.summaryLogId
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @returns {Promise<DecemberLoadRow | null>}
 */
const scanAccreditation = async ({
  context,
  ledgerId,
  summaryLogId,
  summaryLogRowStatesRepository
}) => {
  const { organisation, registration, accreditation } = context
  const processingType = processingTypeFor({
    wasteProcessingType: /** @type {WasteProcessingTypeValue} */ (
      registration.wasteProcessingType
    ),
    reprocessingType: registration.reprocessingType
  })
  const decemberKey = accreditationDecemberKey(accreditation)

  const rowStates =
    await summaryLogRowStatesRepository.findRowStatesForSummaryLog(
      ledgerId,
      summaryLogId
    )
  const decemberRowCount = countDecemberContributingRows(
    rowStates,
    processingType,
    decemberKey
  )

  if (decemberRowCount === 0) {
    return null
  }

  return {
    organisationId: organisation.id,
    organisationReference: String(organisation.orgId),
    accreditationId: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber ?? '',
    processingType,
    decemberKey: /** @type {string} */ (decemberKey),
    decemberRowCount
  }
}

/**
 * Sweep every accreditation's latest submitted summary log and report those
 * that already hold December-dated loads — rows whose balance-affecting date
 * lands in the accreditation-year December, so they would move a December waste
 * portion. Read-only: it counts, it does not write. Reprocessor-output
 * submissions never accrue December, so they are scanned but never reported.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {TypedLogger} params.logger
 * @returns {Promise<DecemberLoadsReport>}
 */
export const buildDecemberLoadsReport = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationsRepository,
  logger
}) => {
  const [entries, organisations] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationsRepository.findAll()
  ])

  const accreditedEntries = entries.filter(
    (entry) => entry.ledgerId.accreditationId !== null
  )
  const { index, testOrgAccreditationIds } = indexAccreditations(organisations)

  /** @type {DecemberLoadRow[]} */
  const reports = []
  let scannedAccreditations = 0

  for (const { ledgerId, summaryLogId } of accreditedEntries) {
    const accreditationId = /** @type {string} */ (ledgerId.accreditationId)
    const context = index.get(accreditationId)
    if (!context) {
      if (!testOrgAccreditationIds.has(accreditationId)) {
        logger.warn({
          message: `December loads diagnostic skipped a ledger entry with no matching accreditation: ${accreditationId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: 'december_loads_ledger_entry_unmatched',
            reference: accreditationId
          }
        })
      }
      continue
    }

    scannedAccreditations += 1
    const row = await scanAccreditation({
      context,
      ledgerId,
      summaryLogId,
      summaryLogRowStatesRepository
    })
    if (row) {
      reports.push(row)
    }
  }

  reports.sort(compareRows)

  return {
    reports,
    summary: {
      scannedAccreditations,
      affectedAccreditations: reports.length,
      totalDecemberRows: reports.reduce((sum, r) => sum + r.decemberRowCount, 0)
    }
  }
}
