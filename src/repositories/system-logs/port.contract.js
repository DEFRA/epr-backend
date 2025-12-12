import { expect } from 'vitest'
import { randomUUID } from 'crypto'

/** @import {SystemLogsRepository} from './port.js' */

export const testSystemLogsRepositoryContract = (it) => {
  it('auditing events can be inserted then retrieved by organisation id', async ({
    systemLogsRepository
  }) => {
    /** @type {SystemLogsRepository} */
    const repository = systemLogsRepository()

    const organisationId1 = randomUUID()
    const organisationId2 = randomUUID()
    const now = new Date()

    const event = { category: 'c', action: 'a' }
    const payload1 = {
      createdAt: now,
      event,
      context: { organisationId: organisationId1, id: 1 }
    }
    const payload2 = {
      createdAt: now,
      event,
      context: { organisationId: organisationId2, id: 2 }
    }
    const payload3 = {
      createdAt: now,
      event,
      context: {
        /* no organisationId */
        id: 3
      }
    }
    const payload4 = {
      createdAt: now,
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
}
