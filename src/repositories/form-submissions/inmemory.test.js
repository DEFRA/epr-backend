import { describe, beforeEach, expect, it as base } from 'vitest'
import { createFormSubmissionsRepository } from './inmemory.js'
import { testFormSubmissionsRepositoryContract } from './port.contract.js'
import {
  buildAccreditation,
  buildRegistration,
  buildOrganisation
} from './contract/test-data.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { FormSubmissionsRepositoryFactory } from './port.js'
 *
 * @typedef {{
 *   accreditations: ReturnType<typeof buildAccreditation>[]
 *   registrations: ReturnType<typeof buildRegistration>[]
 *   organisations: ReturnType<typeof buildOrganisation>[]
 *   formSubmissionsRepository: FormSubmissionsRepositoryFactory
 *   seedAccreditations: (overrides?: Parameters<typeof buildAccreditation>[0][]) => Promise<ReturnType<typeof buildAccreditation>[]>
 *   seedRegistrations: (overrides?: Parameters<typeof buildRegistration>[0][]) => Promise<ReturnType<typeof buildRegistration>[]>
 *   seedOrganisations: (overrides?: Parameters<typeof buildOrganisation>[0][]) => Promise<ReturnType<typeof buildOrganisation>[]>
 * }} Fixtures
 */

const it = /** @type {TestAPI<Fixtures>} */ (
  base.extend({
    // eslint-disable-next-line no-empty-pattern
    accreditations: async ({}, use) => {
      /** @type {ReturnType<typeof buildAccreditation>[]} */
      const data = []
      await use(data)
    },

    // eslint-disable-next-line no-empty-pattern
    registrations: async ({}, use) => {
      /** @type {ReturnType<typeof buildRegistration>[]} */
      const data = []
      await use(data)
    },

    // eslint-disable-next-line no-empty-pattern
    organisations: async ({}, use) => {
      /** @type {ReturnType<typeof buildOrganisation>[]} */
      const data = []
      await use(data)
    },

    formSubmissionsRepository: async (
      { accreditations, registrations, organisations },
      use
    ) => {
      // Return a factory-like function that creates a fresh repository with current state
      const factory = () =>
        createFormSubmissionsRepository(
          accreditations,
          registrations,
          organisations
        )()
      await use(factory)
    },

    seedAccreditations: async ({ accreditations }, use) => {
      await use(async (overrides) => {
        const testData = overrides
          ? overrides.map((override) => buildAccreditation(override))
          : [buildAccreditation(), buildAccreditation(), buildAccreditation()]
        accreditations.push(...testData)
        return testData
      })
    },

    seedRegistrations: async ({ registrations }, use) => {
      await use(async (overrides) => {
        const testData = overrides
          ? overrides.map((override) => buildRegistration(override))
          : [buildRegistration(), buildRegistration(), buildRegistration()]
        registrations.push(...testData)
        return testData
      })
    },

    seedOrganisations: async ({ organisations }, use) => {
      await use(async (overrides) => {
        const testData = overrides
          ? overrides.map((override) => buildOrganisation(override))
          : [buildOrganisation(), buildOrganisation(), buildOrganisation()]
        organisations.push(...testData)
        return testData
      })
    }
  })
)

describe('In-memory form submissions repository', () => {
  beforeEach(
    /** @param {Fixtures} fixture */ async ({
      accreditations,
      registrations,
      organisations
    }) => {
      accreditations.length = 0
      registrations.length = 0
      organisations.length = 0
    }
  )

  it('should create repository instance', async ({
    formSubmissionsRepository
  }) => {
    const repository = formSubmissionsRepository()
    expect(repository).toBeDefined()
    expect(repository.findAllRegistrations).toBeDefined()
    expect(repository.findRegistrationsBySystemReference).toBeDefined()
    expect(repository.findRegistrationById).toBeDefined()
    expect(repository.findAllAccreditations).toBeDefined()
    expect(repository.findAccreditationsBySystemReference).toBeDefined()
    expect(repository.findAccreditationById).toBeDefined()
    expect(repository.findAllOrganisations).toBeDefined()
    expect(repository.findOrganisationById).toBeDefined()
  })

  testFormSubmissionsRepositoryContract(it)
})
