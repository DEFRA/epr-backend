import Boom from '@hapi/boom'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { LOCALLY_HELD_YEAR } from '../model.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { AccreditationsSource } from '../port.js' */
/** @import { AccreditationRecord } from '../model.js' */

/**
 * The scheme year the organisations' accreditations are read for. One year for
 * the POC; reading several is the 2027 step.
 */
const YEAR = LOCALLY_HELD_YEAR

/**
 * Rebuilds an accreditation from the contract and the registration it belongs
 * to. What the accreditation shares with its registration comes from the
 * registration, and `validTo` from the year.
 *
 * Form-submission detail the contract does not carry — the submission itself,
 * the business plan, uploaded files — is left off, so writing a rebuilt
 * accreditation back fails validation rather than losing it.
 *
 * @param {AccreditationRecord} record
 * @param {Registration} registration
 * @returns {Accreditation}
 */
const toAccreditation = (record, registration) =>
  /** @type {Accreditation} */ (
    /** @type {unknown} */ ({
      id: record.id,
      status: record.status,
      statusHistory: record.statusHistory,
      accreditationNumber: record.accreditationNumber,
      ...(record.validFrom && {
        validFrom: record.validFrom,
        validTo: `${record.year}-12-31`
      }),
      prnIssuance: record.prnIssuance,
      submitterContactDetails: record.submitterContactDetails,
      material: registration.material,
      wasteProcessingType: registration.wasteProcessingType,
      reprocessingType: registration.reprocessingType,
      glassRecyclingProcess: registration.glassRecyclingProcess,
      submittedToRegulator: registration.submittedToRegulator,
      orgName: registration.orgName,
      ...(registration.wasteProcessingType ===
        WASTE_PROCESSING_TYPE.REPROCESSOR && {
        site: {
          address: {
            line1: registration.site.address.line1,
            postcode: registration.site.address.postcode
          }
        }
      })
    })
  )

/**
 * Replaces each organisation's accreditations with those the source holds for
 * its registrations, linking each registration to the one it holds.
 *
 * @param {Organisation[]} organisations
 * @param {AccreditationRecord[]} records
 * @returns {Organisation[]}
 */
const attach = (organisations, records) => {
  const byRegistrationId = new Map(records.map((r) => [r.registrationId, r]))

  return organisations.map((organisation) => {
    const accreditations = []
    const registrations = organisation.registrations.map((registration) => {
      const record = byRegistrationId.get(registration.id)
      if (!record) {
        return registration
      }
      accreditations.push(toAccreditation(record, registration))
      return { ...registration, accreditationId: record.id }
    })

    return { ...organisation, registrations, accreditations }
  })
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
