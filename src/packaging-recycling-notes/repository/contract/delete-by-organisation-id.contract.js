import { describe, beforeEach, expect } from 'vitest'
import { buildDraftPrn } from './test-data.js'

export const testDeleteByOrganisationIdBehaviour = (it) => {
  describe('deleteByOrganisationId', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    it('deletes all PRNs belonging to the given organisationId and returns the count', async () => {
      const targetOrgId = `org-target-${Date.now()}`

      await repository.create(
        buildDraftPrn({
          organisation: {
            id: targetOrgId,
            name: 'Target Org',
            tradingName: 'Target Trading'
          }
        })
      )
      await repository.create(
        buildDraftPrn({
          organisation: {
            id: targetOrgId,
            name: 'Target Org',
            tradingName: 'Target Trading'
          }
        })
      )
      await repository.create(
        buildDraftPrn({
          organisation: {
            id: targetOrgId,
            name: 'Target Org',
            tradingName: 'Target Trading'
          }
        })
      )

      const deletedCount = await repository.deleteByOrganisationId(targetOrgId)

      expect(deletedCount).toBe(3)
    })

    it('returns 0 when no PRNs match the given organisationId', async () => {
      await repository.create(
        buildDraftPrn({
          organisation: {
            id: `org-other-${Date.now()}`,
            name: 'Other Org',
            tradingName: 'Other Trading'
          }
        })
      )

      const deletedCount = await repository.deleteByOrganisationId(
        `org-nonexistent-${Date.now()}`
      )

      expect(deletedCount).toBe(0)
    })

    it('does not delete PRNs belonging to other organisations', async () => {
      const targetOrgId = `org-target-${Date.now()}`
      const otherOrgId = `org-other-${Date.now()}`

      const targetPrn = await repository.create(
        buildDraftPrn({
          organisation: {
            id: targetOrgId,
            name: 'Target Org',
            tradingName: 'Target Trading'
          }
        })
      )
      const survivingPrn = await repository.create(
        buildDraftPrn({
          organisation: {
            id: otherOrgId,
            name: 'Other Org',
            tradingName: 'Other Trading'
          }
        })
      )

      const deletedCount = await repository.deleteByOrganisationId(targetOrgId)

      expect(deletedCount).toBe(1)
      expect(await repository.findById(targetPrn.id)).toBeNull()
      const surviving = await repository.findById(survivingPrn.id)
      expect(surviving).toBeTruthy()
      expect(surviving.organisation.id).toBe(otherOrgId)
    })

    it('returns 0 when storage is empty', async () => {
      const deletedCount = await repository.deleteByOrganisationId(
        `org-any-${Date.now()}`
      )

      expect(deletedCount).toBe(0)
    })
  })
}
