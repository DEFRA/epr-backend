import Boom from '@hapi/boom'

import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { requireStoredNumbers } from '#domain/organisations/numbers.js'
import {
  readModelAccreditedPeriod,
  readModelOverseasSitesContext
} from '#waste-balances/domain/classification-context.js'
import { reclassifyWasteRecordStates } from './reclassify-waste-record-states.js'

/**
 * @import {WasteRecordState} from './read-summary-log-row-states.js'
 */

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
 *   summaryLogRowStatesRepository: import('#waste-records/repository/port.js').SummaryLogRowStatesRepository,
 *   organisationReadRepository: import('#organisation-read-model/repository/port.js').OrganisationReadRepository
 * }} context
 * @returns {Promise<WasteRecordState[]>}
 */
export const liveClassifiedRowStatesForRegistration = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationReadRepository,
  organisationId,
  registrationId,
  accreditationId
}) => {
  const ledgerId = { organisationId, registrationId, accreditationId }

  // The head event carries the numbers beside its ids; the row states port
  // projects them away, so they are read from here.
  const headEvent = await ledgerRepository.findLatestInLedgerByKind(
    ledgerId,
    LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
  )
  if (headEvent === null) {
    return []
  }
  const { summaryLogId: head } =
    /** @type {import('#waste-balances/repository/ledger-schema.js').SummaryLogSubmittedPayload} */ (
      headEvent.payload
    )

  const rowStates =
    await summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
      ledgerId,
      head
    )
  if (rowStates.length === 0) {
    return []
  }

  // Resolved from the partition being read, by the numbers its head carries,
  // rather than the registration's current pointer, so rows stay with the
  // accreditation that credited them.
  const { organisationNumber, registrationNumber, accreditationNumber } =
    requireStoredNumbers(headEvent, `ledger head event of ${head}`)

  /** @type {import('#waste-balances/domain/classification-context.js').AccreditedPeriod | null} */
  let accreditation = null
  /** @type {import('#waste-balances/domain/classification-context.js').OverseasSitesContext} */
  let overseasSites = {}

  if (accreditationNumber === null) {
    const found = await organisationReadRepository.findRegistrationByNumber(
      organisationNumber,
      registrationNumber
    )
    if (!found) {
      throw Boom.notFound(
        `Registration ${registrationNumber} of organisation ${organisationNumber} not found`
      )
    }
    // The REGISTERED_ONLY template is NOT_APPLICABLE whatever the sites.
  } else {
    const found = await organisationReadRepository.findAccreditationByNumber(
      organisationNumber,
      registrationNumber,
      accreditationNumber
    )
    if (!found) {
      throw Boom.notFound(
        `Accreditation ${accreditationNumber} of registration ${registrationNumber} of organisation ${organisationNumber} not found`
      )
    }
    accreditation = readModelAccreditedPeriod(found.accreditation, found.year)
    overseasSites = readModelOverseasSitesContext(
      found.registration,
      found.accreditation
    )
  }

  return reclassifyWasteRecordStates(rowStates, {
    accreditation,
    overseasSites
  })
}
