import { describe, it as base } from 'vitest'
import { createAuditEventsRepository } from './inmemory.js'
import { testAuditEventsRepositoryContract } from './port.contract.js'

const it = base.extend({
  auditEventsRepository: async ({}, use) => {
    // Return a factory-like function that creates a fresh repository with current state
    const factory = () => createAuditEventsRepository()(null)
    await use(factory)
  }
})

describe('In memory audit events repository', () => {
  describe('audit events repository contract', () => {
    testAuditEventsRepositoryContract(it)
  })
})