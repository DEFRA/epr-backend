import { it as base } from 'vitest'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryRegistrationAccreditationAdminRepository } from './inmemory.js'
import { testRegistrationAccreditationAdminRepositoryContract } from './port.contract.js'

/** @import { OrganisationsRepositoryFactory } from '#repositories/organisations/port.js' */

const it = base.extend({
  organisationsRepository: async (
    // eslint-disable-next-line no-empty-pattern
    /** @type {object} */ {},
    /** @type {(factory: OrganisationsRepositoryFactory) => Promise<void>} */ use
  ) => {
    const organisations = createInMemoryOrganisationsRepository([])
    const admin =
      createInMemoryRegistrationAccreditationAdminRepository(organisations())
    await use(() => ({ ...organisations(), ...admin() }))
  }
})

describe('In-memory registration and accreditation admin repository', () => {
  testRegistrationAccreditationAdminRepositoryContract(it)
})
