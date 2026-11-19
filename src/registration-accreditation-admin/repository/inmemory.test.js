import { it as base } from 'vitest'
import {
  createOrganisationBuilders,
  prepareOrgUpdate
} from '#repositories/organisations/contract/test-data.js'
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

  base('serves the version before a write until the next tick', async () => {
    const organisations = createInMemoryOrganisationsRepository([])()
    const admin =
      createInMemoryRegistrationAccreditationAdminRepository(organisations)()
    const { buildOrganisation } = createOrganisationBuilders()
    const org = buildOrganisation()
    await organisations.insert(org)
    const stored = await admin.findById(org.id)

    await admin.replace(
      org.id,
      stored.version,
      prepareOrgUpdate(stored, { wasteProcessingTypes: ['exporter'] })
    )

    expect((await admin.findById(org.id)).version).toBe(stored.version)
    expect((await admin.findById(org.id, stored.version + 1)).version).toBe(
      stored.version + 1
    )
  })

  it('refuses an organisations repository that is not in memory', () => {
    expect(() =>
      createInMemoryRegistrationAccreditationAdminRepository({})
    ).toThrow('Expected an in-memory organisations repository')
  })
})
