import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import { LOCALLY_HELD_YEAR, toAccreditationRecord } from '../model.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { AccreditationRecord } from '../model.js' */

/**
 * Every accreditation an organisation holds, each through the registration
 * that links to it. An accreditation no registration links to belongs to no
 * registration, so it has no place in the contract and is left out.
 *
 * @param {Organisation} organisation
 * @returns {AccreditationRecord[]}
 */
const recordsFor = (organisation) =>
  organisation.registrations.flatMap((registration) =>
    accreditationsForRegistration(registration, organisation).map(
      (accreditation) => toAccreditationRecord(accreditation, registration.id)
    )
  )

/**
 * The accreditation a registration holds for a year, whatever its status, or
 * null when it holds none.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {{ registrationId: string, year: number }} params
 * @returns {Promise<AccreditationRecord | null>}
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
    recordsFor(organisation).find(
      (record) => record.registrationId === registrationId
    ) ?? null
  )
}

/**
 * A page of the accreditations held for a year, optionally narrowed to some
 * registrations. Ordered by id, so a page holds the same accreditations
 * however often it is asked for.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {{ year: number, registrationIds?: string[], page: number, pageSize: number }} params
 */
export const listLocalAccreditations = async (
  organisationsRepository,
  { year, registrationIds, page, pageSize }
) => {
  const records =
    year === LOCALLY_HELD_YEAR
      ? (await organisationsRepository.findAll()).flatMap(recordsFor)
      : []

  const wanted = registrationIds && new Set(registrationIds)
  const matching = records
    .filter((record) => !wanted || wanted.has(record.registrationId))
    .sort((a, b) => a.id.localeCompare(b.id))

  const start = (page - 1) * pageSize

  return {
    items: matching.slice(start, start + pageSize),
    page,
    pageSize,
    totalItems: matching.length,
    totalPages: Math.ceil(matching.length / pageSize)
  }
}
