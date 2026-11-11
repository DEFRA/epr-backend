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
 * Index every organisation's accreditations, test organisations included, by the `ledgerKey` of the
 * ledger they write to, carrying the linked registration and owning
 * organisation. No status filtering: suspended and cancelled accreditations
 * are indexed too. A registered-only registration contributes nothing.
 *
 * @param {Organisation[]} organisations
 * @returns {Map<string, AccreditationContext>}
 */
export const indexAccreditationsByLedger = (organisations) => {
  /** @type {Map<string, AccreditationContext>} */
  const index = new Map()
  for (const organisation of organisations) {
    for (const context of linkedAccreditations(organisation)) {
      index.set(
        ledgerKey({
          organisationNumber: organisation.organisationNumber,
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
