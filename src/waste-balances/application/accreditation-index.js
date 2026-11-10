import { isTestOrganisation } from '#common/helpers/parse-test-organisations.js'
import { organisationNumberOf } from '#domain/organisations/numbers.js'

/**
 * @typedef {import('#domain/organisations/model.js').Organisation} Organisation
 * @typedef {import('#domain/organisations/numbers.js').AccreditationNumber} AccreditationNumber
 * @typedef {import('#domain/organisations/numbers.js').RegistrationNumber} RegistrationNumber
 * @typedef {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * The organisation context attached to an accreditation: the owning
 * organisation, the linked registration (which carries the material and
 * processing type), and the accreditation itself.
 *
 * @typedef {Object} AccreditationContext
 * @property {Organisation} organisation
 * @property {import('#domain/organisations/registration.js').Registration} registration
 * @property {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 */

/**
 * Each registration of the organisation with the accreditation it links to.
 *
 * @param {Organisation} organisation
 * @returns {AccreditationContext[]}
 */
const linkedAccreditations = (organisation) => {
  const accreditationById = new Map(
    organisation.accreditations.map((accreditation) => [
      accreditation.id,
      accreditation
    ])
  )
  return organisation.registrations.flatMap((registration) => {
    const accreditation = registration.accreditationId
      ? accreditationById.get(registration.accreditationId)
      : undefined
    return accreditation ? [{ organisation, registration, accreditation }] : []
  })
}

/**
 * Index every organisation's accreditations by id, carrying the linked
 * registration and owning organisation. No status filtering: suspended and
 * cancelled accreditations are indexed too. A registered-only registration (no
 * accreditation) contributes nothing to the index.
 *
 * @param {Organisation[]} organisations
 * @returns {Map<string, AccreditationContext>}
 */
export const indexAccreditations = (organisations) =>
  new Map(
    organisations
      .flatMap(linkedAccreditations)
      .map((context) => [context.accreditation.id, context])
  )

/**
 * @param {WasteBalanceLedgerId} ledgerId
 * @returns {string}
 */
export const ledgerKey = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) =>
  JSON.stringify([organisationNumber, registrationNumber, accreditationNumber])

/**
 * Index every non-test organisation's accreditations by the `ledgerKey` of the
 * ledger they write to, carrying the linked registration and owning
 * organisation. As `indexAccreditations`, no status filtering.
 *
 * @param {Organisation[]} organisations
 * @returns {Map<string, AccreditationContext>}
 */
export const indexAccreditationsByLedger = (organisations) => {
  /** @type {Map<string, AccreditationContext>} */
  const index = new Map()
  for (const organisation of organisations) {
    if (isTestOrganisation(organisation)) {
      continue
    }
    for (const context of linkedAccreditations(organisation)) {
      index.set(
        ledgerKey({
          organisationNumber: organisationNumberOf(organisation),
          registrationNumber: /** @type {RegistrationNumber} */ (
            context.registration.registrationNumber
          ),
          accreditationNumber: /** @type {AccreditationNumber} */ (
            context.accreditation.accreditationNumber
          )
        }),
        context
      )
    }
  }
  return index
}

/**
 * Find the accreditation a ledger is kept for, with its registration and
 * owning organisation, by the numbers the ledger id carries. The registration
 * must still link to the accreditation by id, unless neither carries one. A
 * test organisation's ledgers find nothing. As `indexAccreditations`, no
 * status filtering.
 *
 * @param {Organisation[]} organisations
 * @returns {(ledgerId: WasteBalanceLedgerId) => AccreditationContext | undefined}
 */
export const accreditationForLedger = (organisations) => {
  const organisationByNumber = new Map(
    organisations
      .filter((organisation) => !isTestOrganisation(organisation))
      .map((organisation) => [organisationNumberOf(organisation), organisation])
  )
  return ({ organisationNumber, registrationNumber, accreditationNumber }) => {
    const organisation = organisationByNumber.get(organisationNumber)
    if (!organisation) {
      return undefined
    }
    const registration = organisation.registrations.find(
      (candidate) => candidate.registrationNumber === registrationNumber
    )
    const accreditation = organisation.accreditations.find(
      (candidate) => candidate.accreditationNumber === accreditationNumber
    )
    if (!registration || !accreditation) {
      return undefined
    }
    return registration.accreditationId === accreditation.id
      ? { organisation, registration, accreditation }
      : undefined
  }
}
