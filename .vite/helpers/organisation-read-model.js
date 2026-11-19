import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/test-support.js'

/** @import { OrganisationReadRepository } from '#organisation-read-model/index.js' */

/**
 * An organisation read repository that serves no organisations.
 *
 * @returns {OrganisationReadRepository}
 */
export const emptyOrganisationReadRepository = () =>
  createInMemoryOrganisationReadRepository()()
