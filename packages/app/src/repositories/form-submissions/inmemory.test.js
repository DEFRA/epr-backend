import { describe, beforeEach, expect, it as base } from 'vitest'
import { createFormSubmissionsRepository } from './inmemory.js'
import { testFormSubmissionsRepositoryContract } from './port.contract.js'
import {
  buildAccreditation,
  buildRegistration,
  buildOrganisation
} from './contract/test-data.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  accreditations: async ({}, use) => {
    const data = []
    await use(data)
  },

  // eslint-disable-next-line no-empty-pattern
  registrations: async ({}, use) => {
    const data = []
    await use(data)
  },

  // eslint-disable-next-line no-empty-pattern
  organisations: async ({}, use) => {
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
    await use(async () => {
      const acc1 = buildAccreditation()
      const acc2 = buildAccreditation()
      const acc3 = buildAccreditation()
      const testData = [acc1, acc2, acc3]
      accreditations.push(...testData)
      return testData
    })
  },

  seedRegistrations: async ({ registrations }, use) => {
    await use(async () => {
      const reg1 = buildRegistration()
      const reg2 = buildRegistration()
      const reg3 = buildRegistration()
      const testData = [reg1, reg2, reg3]
      registrations.push(...testData)
      return testData
    })
  },

  seedOrganisations: async ({ organisations }, use) => {
    await use(async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()
      const testData = [org1, org2, org3]
      organisations.push(...testData)
      return testData
    })
  }
})

describe('In-memory form submissions repository', () => {
  beforeEach(async ({ accreditations, registrations, organisations }) => {
    accreditations.length = 0
    registrations.length = 0
    organisations.length = 0
  })

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
