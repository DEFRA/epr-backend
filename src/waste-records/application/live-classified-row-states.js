import Boom from '@hapi/boom'

import { latestSubmittedSummaryLogId } from '#waste-balances/application/latest-submitted-summary-log-id.js'
import { resolveAccreditation } from '#domain/organisations/registration-utils.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'
import { toWasteRecordState } from './read-summary-log-row-states.js'
import { reclassifyWasteRecordStates } from './reclassify-waste-record-states.js'

/**
 * @import {WasteRecordState} from './read-summary-log-row-states.js'
 * @import {SummaryLogRowStateEntry} from '#waste-records/repository/schema.js'
 */

/**
 * Classify already-read row states against current rules and reference data
 * rather than the reading stamped when each row was submitted.
 *
 * Pure — the resolved context is the input, not the repositories it came from,
 * so a caller reading many partitions loads the reference data once for the
 * whole run instead of once per partition.
 *
 * @param {SummaryLogRowStateEntry[]} rowStates
 * @param {Object} context
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} context.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} context.overseasSites
 * @returns {WasteRecordState[]}
 */
export const liveClassifiedRowStates = (
  rowStates,
  { accreditation, overseasSites }
) => {
  if (rowStates.length === 0) {
    return []
  }

  // One summary log is one uploaded workbook, so every row in it reports under
  // that workbook's template, and the rows record which one.
  const [{ processingType }] = rowStates

  return reclassifyWasteRecordStates(rowStates.map(toWasteRecordState), {
    processingType,
    accreditation,
    overseasSites
  })
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
  if (rowStates.length === 0) {
    return []
  }

  const organisation = await organisationsRepository.findById(organisationId)
  const registration = organisation.registrations?.find(
    (candidate) => candidate.id === registrationId
  )
  if (!registration) {
    throw Boom.notFound(`Registration with id ${registrationId} not found`)
  }

  // Resolved from the partition being read rather than the registration's
  // current pointer, so rows stay with the accreditation that credited them.
  const accreditation = resolveAccreditation({ accreditationId }, organisation)

  const sites = await overseasSitesRepository.findByIds(
    Object.values(registration.overseasSites ?? {}).map(
      ({ overseasSiteId }) => overseasSiteId
    )
  )
  const overseasSites = buildOverseasSitesContext(
    registration,
    new Map(sites.map((site) => [site.id, site]))
  )

  return liveClassifiedRowStates(rowStates, { accreditation, overseasSites })
}
