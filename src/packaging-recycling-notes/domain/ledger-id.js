import { toAccreditationNumber } from '#domain/organisations/numbers.js'

/** @import {AccreditationNumber} from '#domain/organisations/numbers.js' */
/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {PackagingRecyclingNote} from './model.js' */

/**
 * The ledger of the accreditation a PRN was raised against, for the year of
 * that accreditation.
 *
 * @param {PackagingRecyclingNote} prn
 * @returns {WasteBalanceLedgerId & { accreditationNumber: AccreditationNumber }}
 */
export const prnLedgerId = (prn) => ({
  organisationNumber: prn.organisation.organisationNumber,
  registrationNumber: prn.registration.registrationNumber,
  accreditationNumber: toAccreditationNumber(
    prn.accreditation.accreditationNumber
  ),
  year: prn.accreditation.accreditationYear
})
