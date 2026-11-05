import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import { toReadModelOrganisations } from '#organisation-read-model/repository/to-read-model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

/**
 * @typedef {{
 *   overseasSites?: object[]
 *   overseasSitesRepository?: Pick<OverseasSitesRepository, 'findByIds'>
 * }} ReadModelOptions
 */

/**
 * The organisations as the read model shows them, given in the shape tests
 * build them for the organisations repository. Each one is stored and read
 * back first, so its current statuses are derived as they are in production.
 *
 * @param {object[]} organisations
 * @param {ReadModelOptions} [options]
 * @returns {Promise<Organisation[]>}
 */
export const toReadModel = async (
  organisations,
  { overseasSites = [], overseasSitesRepository } = {}
) => {
  const stored = await createInMemoryOrganisationsRepository(
    /** @type {any[]} */ (organisations)
  )().findAll()
  return toReadModelOrganisations(stored, {
    overseasSitesRepository:
      overseasSitesRepository ??
      createInMemoryOverseasSitesRepository(
        /** @type {any[]} */ (overseasSites)
      )(),
    logger: { warn: () => {} }
  })
}

/**
 * An in-memory organisation read repository holding, in the read model's
 * shape, what `organisationsRepository` holds now. Later writes to it are not
 * seen.
 *
 * @param {Pick<import('#repositories/organisations/port.js').OrganisationsRepository, 'findAll'>} organisationsRepository
 * @param {Pick<ReadModelOptions, 'overseasSitesRepository'>} [options]
 */
export const organisationReadRepositoryFrom = async (
  organisationsRepository,
  { overseasSitesRepository } = {}
) =>
  createInMemoryOrganisationReadRepository(
    await toReadModelOrganisations(await organisationsRepository.findAll(), {
      overseasSitesRepository:
        overseasSitesRepository ?? createInMemoryOverseasSitesRepository()(),
      logger: { warn: () => {} }
    })
  )

/**
 * An organisation read repository that takes a fresh snapshot of
 * `organisationsRepository` on every read, for a route that reads the read
 * model both before and after it writes, as linking does.
 *
 * The organisations repository is read through `findByOrganisationNumber`, so
 * a read for `minimumVersion` waits for the write to land as it does there.
 *
 * @param {Pick<import('#repositories/organisations/port.js').OrganisationsRepository, 'findAll' | 'findByOrganisationNumber'>} organisationsRepository
 * @param {Pick<ReadModelOptions, 'overseasSitesRepository'>} [options]
 * @returns {import('#organisation-read-model/repository/port.js').OrganisationReadRepository}
 */
export const organisationReadRepositoryOver = (
  organisationsRepository,
  { overseasSitesRepository } = {}
) => ({
  findByOrganisationNumber: async (organisationNumber, minimumVersion) => {
    const stored = await organisationsRepository.findByOrganisationNumber(
      organisationNumber,
      minimumVersion
    )
    const readModel = await toReadModelOrganisations(stored ? [stored] : [], {
      overseasSitesRepository:
        overseasSitesRepository ?? createInMemoryOverseasSitesRepository()(),
      logger: { warn: () => {} }
    })
    return createInMemoryOrganisationReadRepository(
      readModel
    )().findByOrganisationNumber(organisationNumber, minimumVersion)
  },
  find: async (params) =>
    (
      await organisationReadRepositoryFrom(organisationsRepository, {
        overseasSitesRepository
      })
    )().find(params)
})

/**
 * An in-memory organisation read repository holding `organisations` in the
 * read model's shape, for a test server's `organisationReadRepository`.
 *
 * @param {object[]} organisations
 * @param {ReadModelOptions} [options]
 */
export const organisationReadRepositoryOf = async (organisations, options) =>
  createInMemoryOrganisationReadRepository(
    await toReadModel(organisations, options)
  )
