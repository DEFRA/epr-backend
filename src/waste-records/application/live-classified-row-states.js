import { latestSubmittedSummaryLogId } from '#waste-balances/application/latest-submitted-summary-log-id.js'
import { resolveAccreditation } from '#domain/organisations/registration-utils.js'
import { processingTypeForRegistration } from '#domain/summary-logs/processing-type-for-registration.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'
import { toWasteRecordState } from './read-summary-log-row-states.js'
import { reclassifyWasteRecordStates } from './reclassify-waste-record-states.js'

/**
 * @import {WasteRecordState} from './read-summary-log-row-states.js'
 * @import {SummaryLogRowState} from '#waste-records/repository/schema.js'
 * @import {ProcessingType} from '#domain/summary-logs/meta-fields.js'
 */

/**
 * A row state records the template it was submitted under, and the registration
 * names the template it reports under. The two describe the same thing, so a
 * disagreement means a row is being read for a registration other than the one
 * that wrote it, and reclassifying it here would produce a wrong reading.
 *
 * @param {SummaryLogRowState[]} rowStates
 * @param {ProcessingType} processingType
 */
const assertRowStatesReportUnder = (rowStates, processingType) => {
  const divergent = rowStates.find(
    (rowState) => rowState.processingType !== processingType
  )
  if (divergent) {
    throw new Error(
      `Row state ${divergent.rowId} was submitted under ${divergent.processingType}, but its registration reports under ${processingType}`
    )
  }
}

/**
 * A registration's committed row states at its latest submission, classified
 * against current rules and reference data rather than the reading stamped when
 * each row was submitted.
 *
 * A drop-in for `summaryLogRowStatesForRegistration`: same arguments plus the
 * repositories the current context is read from, same return shape. A consumer
 * that must answer "does this row count now" calls this one instead.
 *
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId & {
 *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *   summaryLogRowStateRepository: import('#waste-records/repository/port.js').SummaryLogRowStateRepository,
 *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
 *   overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository
 * }} context
 * @returns {Promise<WasteRecordState[]>}
 */
export const liveClassifiedRowStatesForRegistration = async ({
  ledgerRepository,
  summaryLogRowStateRepository,
  organisationsRepository,
  overseasSitesRepository,
  organisationId,
  registrationId,
  accreditationId
}) => {
  const ledgerId = { organisationId, registrationId, accreditationId }

  const head = await latestSubmittedSummaryLogId(ledgerRepository, ledgerId)
  if (head === null) {
    return []
  }

  const rowStates =
    await summaryLogRowStateRepository.findRowStatesForSummaryLog(
      ledgerId,
      head
    )

  const [organisation, registration] = await Promise.all([
    organisationsRepository.findById(organisationId),
    organisationsRepository.findRegistrationById(organisationId, registrationId)
  ])

  // A ledger carries an accreditationId only once the accreditation is
  // numbered, and no later status change takes that id away, so the partition
  // names the template its rows were submitted under.
  const accreditation = resolveAccreditation(registration, organisation)
  const processingType = processingTypeForRegistration(registration, {
    accredited: accreditationId !== null
  })

  assertRowStatesReportUnder(rowStates, processingType)

  const sites = await overseasSitesRepository.findAll()
  const overseasSites = buildOverseasSitesContext(
    registration,
    new Map(sites.map((site) => [site.id, site]))
  )

  return reclassifyWasteRecordStates(rowStates.map(toWasteRecordState), {
    processingType,
    accreditation,
    overseasSites
  })
}
