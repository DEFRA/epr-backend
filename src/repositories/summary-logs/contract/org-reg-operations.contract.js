import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildSummaryLog } from './test-data.js'

const generateOrgReg = () => ({
  organisationId: `org-${randomUUID()}`,
  registrationId: `reg-${randomUUID()}`
})

export const testOrgRegOperations = (it) => {
  describe('organisation/registration operations', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    describe('hasSubmittingLog', () => {
      it('returns false when no logs exist for org/reg', async () => {
        const { organisationId, registrationId } = generateOrgReg()
        const result = await repository.hasSubmittingLog(
          organisationId,
          registrationId
        )
        expect(result).toBe(false)
      })

      it('returns false when only non-submitting logs exist', async () => {
        const id = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()
        await repository.insert(
          id,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        const result = await repository.hasSubmittingLog(
          organisationId,
          registrationId
        )
        expect(result).toBe(false)
      })

      it('returns true when a submitting log exists for org/reg', async () => {
        const id = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()
        await repository.insert(
          id,
          buildSummaryLog({
            status: 'submitting',
            organisationId,
            registrationId
          })
        )

        const result = await repository.hasSubmittingLog(
          organisationId,
          registrationId
        )
        expect(result).toBe(true)
      })

      it('returns false for different org/reg even if submitting exists elsewhere', async () => {
        const id = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()
        const { organisationId: otherOrgId, registrationId: otherRegId } =
          generateOrgReg()
        await repository.insert(
          id,
          buildSummaryLog({
            status: 'submitting',
            organisationId,
            registrationId
          })
        )

        const result = await repository.hasSubmittingLog(otherOrgId, otherRegId)
        expect(result).toBe(false)
      })
    })

    describe('supersedePendingLogs', () => {
      it('returns 0 when no logs exist for org/reg', async () => {
        const { organisationId, registrationId } = generateOrgReg()
        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          'exclude-id'
        )
        expect(result).toBe(0)
      })

      it('supersedes preprocessing logs', async () => {
        const idToSupersede = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        await repository.insert(
          idToSupersede,
          buildSummaryLog({
            status: 'preprocessing',
            file: undefined,
            organisationId,
            registrationId
          })
        )

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(1)
        const superseded = await repository.findById(idToSupersede)
        expect(superseded.summaryLog.status).toBe('superseded')
      })

      it('supersedes validating logs', async () => {
        const idToSupersede = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        await repository.insert(
          idToSupersede,
          buildSummaryLog({
            status: 'validating',
            organisationId,
            registrationId
          })
        )

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(1)
        const superseded = await repository.findById(idToSupersede)
        expect(superseded.summaryLog.status).toBe('superseded')
      })

      it('supersedes validated logs', async () => {
        const idToSupersede = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        await repository.insert(
          idToSupersede,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(1)
        const superseded = await repository.findById(idToSupersede)
        expect(superseded.summaryLog.status).toBe('superseded')
      })

      it('does not supersede submitting logs', async () => {
        const id = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        await repository.insert(
          id,
          buildSummaryLog({
            status: 'submitting',
            organisationId,
            registrationId
          })
        )

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(0)
        const notSuperseded = await repository.findById(id)
        expect(notSuperseded.summaryLog.status).toBe('submitting')
      })

      it('does not supersede submitted logs', async () => {
        const id = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        await repository.insert(
          id,
          buildSummaryLog({
            status: 'submitted',
            organisationId,
            registrationId
          })
        )

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(0)
        const notSuperseded = await repository.findById(id)
        expect(notSuperseded.summaryLog.status).toBe('submitted')
      })

      it('does not supersede the excluded log', async () => {
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        await repository.insert(
          idToKeep,
          buildSummaryLog({
            status: 'preprocessing',
            file: undefined,
            organisationId,
            registrationId
          })
        )

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(0)
        const notSuperseded = await repository.findById(idToKeep)
        expect(notSuperseded.summaryLog.status).toBe('preprocessing')
      })

      it('does not supersede logs from different org/reg', async () => {
        const id = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()
        const { organisationId: otherOrgId, registrationId: otherRegId } =
          generateOrgReg()

        await repository.insert(
          id,
          buildSummaryLog({
            status: 'validated',
            organisationId: otherOrgId,
            registrationId: otherRegId
          })
        )

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(0)
        const notSuperseded = await repository.findById(id)
        expect(notSuperseded.summaryLog.status).toBe('validated')
      })

      it('supersedes multiple logs at once', async () => {
        const id1 = `summary-${randomUUID()}`
        const id2 = `summary-${randomUUID()}`
        const id3 = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        await repository.insert(
          id1,
          buildSummaryLog({
            status: 'preprocessing',
            file: undefined,
            organisationId,
            registrationId
          })
        )
        await repository.insert(
          id2,
          buildSummaryLog({
            status: 'validating',
            organisationId,
            registrationId
          })
        )
        await repository.insert(
          id3,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(3)
      })

      it('increments version when superseding', async () => {
        const id = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        await repository.insert(
          id,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        const beforeSupersede = await repository.findById(id)
        expect(beforeSupersede.version).toBe(1)

        await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        const afterSupersede = await repository.findById(id)
        expect(afterSupersede.version).toBe(2)
      })
    })
  })
}
