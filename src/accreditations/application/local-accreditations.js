import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import { LOCALLY_HELD_YEAR } from '../model.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/**
 * Every accreditation an organisation holds, paired with the registration that
 * links to it. An accreditation no registration links to belongs to no
 * registration, so it is left out.
 *
 * @param {Organisation} organisation
 * @returns {{ registrationId: string, accreditation: Accreditation }[]}
 */
const heldBy = (organisation) =>
  organisation.registrations.flatMap((registration) =>
    accreditationsForRegistration(registration, organisation).map(
      (accreditation) => ({ registrationId: registration.id, accreditation })
    )
  )

/**
 * The accreditation a registration holds for a year, whatever its status, or
 * null when it holds none.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {{ registrationId: string, year: number }} params
 * @returns {Promise<Accreditation | null>}
 */
export const findLocalAccreditation = async (
  organisationsRepository,
  { registrationId, year }
) => {
  if (year !== LOCALLY_HELD_YEAR) {
    return null
  }

  const {
    items: [organisation]
  } = await organisationsRepository.find({
    registrationId,
    page: 1,
    pageSize: 1
  })

  if (!organisation) {
    return null
  }

  return (
    heldBy(organisation).find((held) => held.registrationId === registrationId)
      ?.accreditation ?? null
  )
}

/**
 * Every accreditation held for a year, optionally narrowed to some
 * registrations, ordered by id.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {{ year: number, registrationIds?: string[] }} params
 * @returns {Promise<Accreditation[]>}
 */
export const listLocalAccreditations = async (
  organisationsRepository,
  { year, registrationIds }
) => {
  const held =
    year === LOCALLY_HELD_YEAR
      ? (await organisationsRepository.findAll()).flatMap(heldBy)
      : []

  const wanted = registrationIds && new Set(registrationIds)
  return held
    .filter(({ registrationId }) => !wanted || wanted.has(registrationId))
    .map(({ accreditation }) => accreditation)
    .sort((a, b) => a.id.localeCompare(b.id))
}
