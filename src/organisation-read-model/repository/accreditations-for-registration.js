/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

/**
 * Returns the accreditations the registration holds.
 *
 * `registration.accreditationId` names at most one, so the result holds no
 * more than one entry. The result is a collection because a registration will
 * hold several once the model carries them.
 *
 * @param {{ accreditationId?: string | null }} registration
 * @param {{ accreditations: Accreditation[] }} org
 * @returns {Accreditation[]}
 */
export function accreditationsForRegistration(registration, org) {
  const { accreditationId } = registration
  if (!accreditationId) {
    return []
  }

  return org.accreditations.filter(
    (accreditation) => accreditation.id === accreditationId
  )
}
