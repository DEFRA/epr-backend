import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { summaryLogFactory } from './test-data.js'

export const testDeleteByOrganisationIdBehaviour = (it) => {
  describe('deleteByOrganisationId', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    it('deletes all summary logs for the given organisationId across multiple registrations and returns count', async () => {
      const organisationId = `contract-org-${randomUUID()}`
      const idA = `contract-summary-a-${randomUUID()}`
      const idB = `contract-summary-b-${randomUUID()}`
      const idC = `contract-summary-c-${randomUUID()}`

      await repository.insert(
        idA,
        summaryLogFactory.validating({
          organisationId,
          registrationId: `reg-1-${randomUUID()}`
        })
      )
      await repository.insert(
        idB,
        summaryLogFactory.validating({
          organisationId,
          registrationId: `reg-2-${randomUUID()}`
        })
      )
      await repository.insert(
        idC,
        summaryLogFactory.validating({
          organisationId,
          registrationId: `reg-3-${randomUUID()}`
        })
      )

      const deletedCount =
        await repository.deleteByOrganisationId(organisationId)

      expect(deletedCount).toBe(3)
    })

    it('returns 0 when no logs match the given organisationId', async () => {
      const organisationId = `contract-org-${randomUUID()}`
      const otherOrganisationId = `contract-org-other-${randomUUID()}`
      const id = `contract-summary-${randomUUID()}`

      await repository.insert(
        id,
        summaryLogFactory.validating({
          organisationId: otherOrganisationId,
          registrationId: `reg-${randomUUID()}`
        })
      )

      const deletedCount =
        await repository.deleteByOrganisationId(organisationId)

      expect(deletedCount).toBe(0)
    })

    it('does not delete logs belonging to other organisations', async () => {
      const targetOrganisationId = `contract-org-target-${randomUUID()}`
      const otherOrganisationId = `contract-org-other-${randomUUID()}`
      const targetId = `contract-summary-target-${randomUUID()}`
      const otherId = `contract-summary-other-${randomUUID()}`

      await repository.insert(
        targetId,
        summaryLogFactory.validating({
          organisationId: targetOrganisationId,
          registrationId: `reg-${randomUUID()}`
        })
      )
      await repository.insert(
        otherId,
        summaryLogFactory.validating({
          organisationId: otherOrganisationId,
          registrationId: `reg-${randomUUID()}`
        })
      )

      const deletedCount =
        await repository.deleteByOrganisationId(targetOrganisationId)

      expect(deletedCount).toBe(1)
      const survivor = await repository.findById(otherId)
      expect(survivor).toBeTruthy()
      expect(survivor.summaryLog.organisationId).toBe(otherOrganisationId)
    })

    it('returns 0 when storage is empty', async () => {
      const organisationId = `contract-org-${randomUUID()}`

      const deletedCount =
        await repository.deleteByOrganisationId(organisationId)

      expect(deletedCount).toBe(0)
    })
  })
}
