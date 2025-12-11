import { expect } from 'vitest'
import { randomUUID } from 'crypto'

/**
 * @import {AuditEventsRepository} from '#repositories/audit-events/port.js'
 */

export const testAuditEventsRepositoryContract = (it) => {
  const event = { category: 'c', action: 'a' }
  it('auditing events can be inserted then retrieved by organisation id' /**
   * @param {{ auditEventsRepository: () => AuditEventsRepository }} params
   */, async ({ auditEventsRepository }) => {
    const repository = auditEventsRepository()

    const organisationId1 = randomUUID()
    const organisationId2 = randomUUID()

    const payload1 = {
      event,
      context: { organisationId: organisationId1, id: 1 }
    }
    const payload2 = {
      event,
      context: { organisationId: organisationId2, id: 2 }
    }
    const payload3 = {
      event,
      context: {
        /* no organisationId */
        id: 3
      }
    }
    const payload4 = {
      event,
      context: { organisationId: organisationId1, id: 4 }
    }

    await repository.insert(payload1)
    await repository.insert(payload2)
    await repository.insert(payload3)
    await repository.insert(payload4)

    const result = await repository.findByOrganisationId(organisationId1)

    expect(result).toHaveLength(2)
    expect(result[0].context.id).toEqual(payload1.context.id)
    expect(result[1].context.id).toEqual(payload4.context.id)
  })

  it('enriches recorded auditing event with created date' /**
   * @param {{ auditEventsRepository: () => AuditEventsRepository }} params
   */, async ({ auditEventsRepository }) => {
    const repository = auditEventsRepository()

    const startTime = new Date()
    const organisationId = randomUUID()

    await repository.insert({ event, context: { organisationId } })

    const result = await repository.findByOrganisationId(organisationId)

    expect(+result[0].createdAt).toBeGreaterThanOrEqual(+startTime)
  })
}
