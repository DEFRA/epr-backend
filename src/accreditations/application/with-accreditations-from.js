import Boom from '@hapi/boom'
import { LOCALLY_HELD_YEAR } from '../model.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { AccreditationsSource } from '../port.js' */

/**
 * The scheme year the organisations' accreditations are read for. One year for
 * the POC; reading several is the 2027 step.
 */
const YEAR = LOCALLY_HELD_YEAR

/**
 * Replaces each organisation's accreditations with those the source holds
 * that its registrations link to.
 *
 * @param {Organisation[]} organisations
 * @param {Accreditation[]} accreditations
 * @returns {Organisation[]}
 */
const attach = (organisations, accreditations) => {
  const byId = new Map(accreditations.map((a) => [a.id, a]))

  return organisations.map((organisation) => ({
    ...organisation,
    accreditations: organisation.registrations.flatMap(
      ({ accreditationId }) => {
        const accreditation = accreditationId && byId.get(accreditationId)
        return accreditation ? [accreditation] : []
      }
    )
  }))
}

/**
 * @param {AccreditationsSource} source
 * @param {Organisation[]} organisations
 * @returns {Promise<Organisation[]>}
 */
const hydrate = async (source, organisations) => {
  const registrationIds = organisations.flatMap((organisation) =>
    organisation.registrations.map((registration) => registration.id)
  )
  if (registrationIds.length === 0) {
    return organisations
  }

  return attach(
    organisations,
    await source.list({ year: YEAR, registrationIds })
  )
}

/**
 * @param {AccreditationsSource} source
 * @param {Organisation | null} organisation
 */
const hydrateOne = async (source, organisation) =>
  organisation && (await hydrate(source, [organisation]))[0]

/**
 * An organisations repository whose reads carry accreditations from `source`
 * instead of from the organisation documents.
 *
 * Covered: every read that returns whole organisations, plus the registration
 * and accreditation lookups built on `findById`.
 *
 * Not covered, reading the stored accreditations still:
 * - queries that match on accreditation fields (`find` by accreditation id or
 *   number, `findByAccreditationNumber`) — they match stored data, though what
 *   they return is hydrated
 * - `findAllIds`, `findAllBySchemaVersion`, `findAllLinked` (a projection
 *   without accreditations) and the overseas-sites admin list
 * - every write
 *
 * @param {OrganisationsRepository} repository
 * @param {AccreditationsSource} source
 * @returns {OrganisationsRepository}
 */
export const withAccreditationsFrom = (repository, source) => {
  /** @type {OrganisationsRepository['findById']} */
  const findById = async (id, minimumVersion) =>
    /** @type {Organisation} */ (
      await hydrateOne(source, await repository.findById(id, minimumVersion))
    )

  return {
    ...repository,

    findAll: async () => {
      const organisations = await repository.findAll()
      return attach(organisations, await source.list({ year: YEAR }))
    },

    find: async (params) => {
      const result = await repository.find(params)
      return { ...result, items: await hydrate(source, result.items) }
    },

    findByIds: async (ids) => hydrate(source, await repository.findByIds(ids)),

    findByRegistrationIds: async (registrationIds) =>
      hydrate(source, await repository.findByRegistrationIds(registrationIds)),

    findById,

    findByLinkedDefraOrgId: async (defraOrgId) =>
      hydrateOne(source, await repository.findByLinkedDefraOrgId(defraOrgId)),

    findByAccreditationNumber: async (accreditationNumber) =>
      hydrateOne(
        source,
        await repository.findByAccreditationNumber(accreditationNumber)
      ),

    findByRegistrationNumber: async (registrationNumber) =>
      hydrateOne(
        source,
        await repository.findByRegistrationNumber(registrationNumber)
      ),

    findAllLinkableForUser: async (email) =>
      hydrate(source, await repository.findAllLinkableForUser(email)),

    findByOrgId: async (orgId) =>
      hydrateOne(source, await repository.findByOrgId(orgId)),

    findRegistrationById: async (
      organisationId,
      registrationId,
      minimumOrgVersion
    ) => {
      const organisation = await findById(organisationId, minimumOrgVersion)
      const registration = organisation.registrations.find(
        (r) => r.id === registrationId
      )
      if (!registration) {
        throw Boom.notFound(`Registration with id ${registrationId} not found`)
      }

      const accreditation = organisation.accreditations.find(
        (a) => a.id === registration.accreditationId
      )
      return accreditation ? { ...registration, accreditation } : registration
    },

    findAccreditationById: async (
      organisationId,
      accreditationId,
      minimumOrgVersion
    ) => {
      const organisation = await findById(organisationId, minimumOrgVersion)
      const accreditation = organisation.accreditations.find(
        (a) => a.id === accreditationId
      )
      if (!accreditation) {
        throw Boom.notFound(
          `Accreditation with id ${accreditationId} not found`
        )
      }
      return accreditation
    }
  }
}
