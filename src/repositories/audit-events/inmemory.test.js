import { describe, it as base } from 'vitest'
import { createAuditEventsRepository } from './inmemory.js'
import { testAuditEventsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  auditEventsRepository: async ({}, use) => {
    const factory = () => createAuditEventsRepository()(null)
    await use(factory)
  }
})

describe('In memory audit events repository', () => {
  describe('audit events repository contract', () => {
    testAuditEventsRepositoryContract(it)
  })
})
