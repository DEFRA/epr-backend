import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'

/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

/**
 * An organisation read repository that serves no organisations.
 *
 * @returns {OrganisationReadRepository}
 */
export const emptyOrganisationReadRepository = () =>
  createInMemoryOrganisationReadRepository()()
