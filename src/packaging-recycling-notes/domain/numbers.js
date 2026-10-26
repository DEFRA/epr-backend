/** @import { PackagingRecyclingNote } from './model.js' */
/** @import { PrnNumbers } from '#packaging-recycling-notes/repository/port.js' */

/**
 * The organisation and registration numbers a PRN holds, each undefined where
 * the PRN was stored without it.
 *
 * @param {Pick<PackagingRecyclingNote, 'organisation' | 'registration'>} prn
 * @returns {PrnNumbers}
 */
export const numbersHeld = (prn) => ({
  organisationNumber: prn.organisation.organisationNumber,
  registrationNumber: prn.registration?.registrationNumber
})
