import { expect } from 'vitest'
import { randomUUID } from 'crypto'

/** @import {SystemLogsRepository} from './port.js' */

export const testSystemLogsRepositoryContract = (it) => {
  it('system logs can be inserted then retrieved by organisation id', async ({
    systemLogsRepository
  }) => {
    /** @type {SystemLogsRepository} */
    const repository = systemLogsRepository

    const organisationId1 = randomUUID()
    const organisationId2 = randomUUID()
    const now = new Date()

    const event = {
      category: 'test-category',
      subCategory: 'test-sub-category',
      action: 'test-action'
    }
    const createdBy = { id: 'user-001', email: 'user@email.com', scope: [] }
    const payload1 = {
      createdAt: now,
      createdBy,
      event,
      context: { organisationId: organisationId1, id: 1 }
    }
    const payload2 = {
      createdAt: now,
      createdBy,
      event,
      context: { organisationId: organisationId2, id: 2 }
    }
    const payload3 = {
      createdAt: now,
      createdBy,
      event,
      context: {
        /* no organisationId */
        id: 3
      }
    }
    const payload4 = {
      createdAt: now,
      createdBy,
      event,
      context: { organisationId: organisationId1, id: 4 }
    }

    await repository.insert(payload1)
    await repository.insert(payload2)
    await repository.insert(payload3)
    await repository.insert(payload4)

    const result = await repository.findByOrganisationId(organisationId1)

    expect(result).toEqual([payload1, payload4])
  })

  it('returns system logs sorted by createdAt, most recent first', async ({
    systemLogsRepository
  }) => {
    /** @type {SystemLogsRepository} */
    const repository = systemLogsRepository

    const organisationId = randomUUID()

    const event = {
      category: 'test-category',
      subCategory: 'test-sub-category',
      action: 'test-action'
    }
    const createdBy = { id: 'user-001', email: 'user@email.com', scope: [] }
    const payload1 = {
      createdAt: new Date('2025-01-01'),
      createdBy,
      event,
      context: { organisationId, id: 1 }
    }
    const payload2 = {
      createdAt: new Date('2025-01-02'),
      createdBy,
      event,
      context: { organisationId, id: 2 }
    }

    await repository.insert(payload1)
    await repository.insert(payload2)

    const result = await repository.findByOrganisationId(organisationId)

    expect(result).toEqual([payload2, payload1])
  })
}
