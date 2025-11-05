import { describe, beforeEach, expect, it as base } from 'vitest'
import { createFormSubmissionsRepository } from './inmemory.js'
import { testFindBehaviour } from './contract/find.contract.js'
import { buildAccreditation, buildRegistration } from './contract/test-data.js'

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

  formSubmissionsRepository: async ({ accreditations, registrations }, use) => {
    // Return a factory-like function that creates a fresh repository with current state
    const factory = () =>
      createFormSubmissionsRepository(accreditations, registrations)()
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
  }
})

describe('In-memory form submissions repository', () => {
  beforeEach(async ({ accreditations, registrations }) => {
    accreditations.length = 0
    registrations.length = 0
  })

  it('should create repository instance', async ({
    formSubmissionsRepository
  }) => {
    const repository = formSubmissionsRepository()
    expect(repository).toBeDefined()
    expect(repository.findAllRegistrations).toBeDefined()
    expect(repository.findAllAccreditations).toBeDefined()
  })

  testFindBehaviour(it)
})
