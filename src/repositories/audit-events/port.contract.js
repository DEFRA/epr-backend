import { describe, expect } from 'vitest'

export const testAuditEventsRepositoryContract = (it) => {
  it('auditing events can be inserted then retrieved by organisation id', async ({
    auditEventsRepository
  }) => {
    const repository = auditEventsRepository()

    const payload1 = { event: {}, context: { organisationId: 'id001' } }
    const payload2 = { event: {}, context: { organisationId: 'id002' } }
    const payload3 = { event: {}, context: { /* no organisationId */ } }
    const payload4 = { event: {}, context: { organisationId: 'id001' } }

    await repository.insert(payload1)
    await repository.insert(payload2)
    await repository.insert(payload3)
    await repository.insert(payload4)

    const result = await repository.findByOrganisationId('id001')

    expect(result).toEqual([payload1, payload4])
  })
}
