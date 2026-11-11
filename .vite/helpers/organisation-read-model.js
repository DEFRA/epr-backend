import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js' */

/**
 * @typedef {{
 *   externalAccreditations?: ExternalAccreditation[]
 *   overseasSites?: object[]
 *   overseasSitesRepository?: Pick<OverseasSitesRepository, 'findByIds'>
 *   logger?: Pick<TypedLogger, 'warn'>
 * }} ReadModelOptions
 */

/**
 * @param {ReadModelOptions} [options]
 */
const dependenciesFor = ({
  overseasSites = [],
  overseasSitesRepository,
  logger = { warn: () => {} }
} = {}) => ({
  overseasSitesRepository:
    overseasSitesRepository ??
    createInMemoryOverseasSitesRepository(
      /** @type {any[]} */ (overseasSites)
    )(),
  logger
})

/**
 * An organisation read repository that serves no organisations.
 *
 * @returns {OrganisationReadRepository}
 */
export const emptyOrganisationReadRepository = () =>
  createInMemoryOrganisationReadRepository()(dependenciesFor())

/**
 * An in-memory organisation read repository holding what
 * `organisationAdministrationRepository` holds now, for a test server's
 * `organisationReadRepository`. Later writes to it are not seen.
 *
 * @param {Pick<OrganisationAdministrationRepository, 'findAll'>} organisationAdministrationRepository
 * @param {Pick<ReadModelOptions, 'overseasSitesRepository'>} [options]
 * @returns {Promise<() => OrganisationReadRepository>}
 */
export const organisationReadRepositoryFrom = async (
  organisationAdministrationRepository,
  options
) => {
  const repository = createInMemoryOrganisationReadRepository(
    await organisationAdministrationRepository.findAll()
  )(dependenciesFor(options))
  return () => repository
}

/**
 * An organisation read repository that takes a fresh snapshot of
 * `organisationAdministrationRepository` on every read, for a route that reads the read
 * model both before and after it writes, as linking does.
 *
 * The organisations repository is read through `findByOrganisationNumber`, so
 * a read for `minimumVersion` waits for the write to land as it does there.
 *
 * @param {Pick<OrganisationAdministrationRepository, 'findAll' | 'findByOrganisationNumber'>} organisationAdministrationRepository
 * @param {Pick<ReadModelOptions, 'overseasSitesRepository'>} [options]
 * @returns {OrganisationReadRepository}
 */
export const organisationReadRepositoryOver = (
  organisationAdministrationRepository,
  options
) => ({
  findByOrganisationNumber: async (organisationNumber, minimumVersion) => {
    const stored =
      await organisationAdministrationRepository.findByOrganisationNumber(
        organisationNumber,
        minimumVersion
      )
    return createInMemoryOrganisationReadRepository(stored ? [stored] : [])(
      dependenciesFor(options)
    ).findByOrganisationNumber(organisationNumber, minimumVersion)
  },
  find: async (params) =>
    (
      await organisationReadRepositoryFrom(
        organisationAdministrationRepository,
        options
      )
    )().find(params),
  findAll: async () =>
    (
      await organisationReadRepositoryFrom(
        organisationAdministrationRepository,
        options
      )
    )().findAll()
})

/**
 * An in-memory organisation read repository holding `organisations`, given in
 * the shape tests build them for the organisations repository, for a test
 * server's `organisationReadRepository`. Each one is stored and read back
 * first, so its current statuses are derived as they are in production.
 *
 * @param {object[]} organisations
 * @param {ReadModelOptions} [options]
 * @returns {Promise<() => OrganisationReadRepository>}
 */
export const organisationReadRepositoryOf = async (organisations, options) => {
  const repository = createInMemoryOrganisationReadRepository(
    await createInMemoryOrganisationsRepository(
      /** @type {any[]} */ (organisations)
    )().findAll(),
    options?.externalAccreditations
  )(dependenciesFor(options))
  return () => repository
}
