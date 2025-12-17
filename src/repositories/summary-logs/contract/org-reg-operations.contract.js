import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildSummaryLog } from './test-data.js'
import { waitForVersion } from './test-helpers.js'

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

        // Insert the log to be superseded first
        await repository.insert(
          idToSupersede,
          buildSummaryLog({
            status: 'preprocessing',
            file: undefined,
            organisationId,
            registrationId
          })
        )

        // Insert the "current" log that triggers the supersede
        await repository.insert(
          idToKeep,
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
        const superseded = await waitForVersion(repository, idToSupersede, 2)
        expect(superseded.summaryLog.status).toBe('superseded')
      })

      it('supersedes validating logs', async () => {
        const idToSupersede = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        // Insert the log to be superseded first
        await repository.insert(
          idToSupersede,
          buildSummaryLog({
            status: 'validating',
            organisationId,
            registrationId
          })
        )

        // Insert the "current" log that triggers the supersede
        await repository.insert(
          idToKeep,
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
        const superseded = await waitForVersion(repository, idToSupersede, 2)
        expect(superseded.summaryLog.status).toBe('superseded')
      })

      it('supersedes validated logs', async () => {
        const idToSupersede = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        // Insert the log to be superseded first
        await repository.insert(
          idToSupersede,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        // Insert the "current" log that triggers the supersede
        await repository.insert(
          idToKeep,
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
        const superseded = await waitForVersion(repository, idToSupersede, 2)
        expect(superseded.summaryLog.status).toBe('superseded')
      })

      it('does not supersede submitting logs', async () => {
        const id = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        // Insert as validated first (can't insert as submitting - it blocks new inserts)
        await repository.insert(
          id,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        // Insert the "current" log that triggers the supersede
        await repository.insert(
          idToKeep,
          buildSummaryLog({
            status: 'validating',
            organisationId,
            registrationId
          })
        )

        // Now transition to submitting (simulates user clicking submit)
        await repository.update(id, 1, { status: 'submitting' })

        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idToKeep
        )

        expect(result).toBe(0)
        const notSuperseded = await waitForVersion(repository, id, 2)
        expect(notSuperseded.summaryLog.status).toBe('submitting')
      })

      it('does not supersede submitted logs', async () => {
        const id = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        // Insert the log with submitted status first
        await repository.insert(
          id,
          buildSummaryLog({
            status: 'submitted',
            organisationId,
            registrationId
          })
        )

        // Insert the "current" log that triggers the supersede
        await repository.insert(
          idToKeep,
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

        // Insert a log for a DIFFERENT org/reg
        await repository.insert(
          id,
          buildSummaryLog({
            status: 'validated',
            organisationId: otherOrgId,
            registrationId: otherRegId
          })
        )

        // Insert the "current" log that triggers the supersede
        await repository.insert(
          idToKeep,
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

        // Insert logs to be superseded (all created before idToKeep)
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

        // Insert the "current" log that triggers the supersede
        await repository.insert(
          idToKeep,
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

        expect(result).toBe(3)
      })

      it('only supersedes logs created before the current log', async () => {
        const { organisationId, registrationId } = generateOrgReg()

        // Insert log A (created first)
        const idA = `summary-A-${randomUUID()}`
        await repository.insert(
          idA,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Insert log B (created second - this is the "current" log)
        const idB = `summary-B-${randomUUID()}`
        await repository.insert(
          idB,
          buildSummaryLog({
            status: 'validating',
            organisationId,
            registrationId
          })
        )

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Insert log C (created third - after the "current" log)
        const idC = `summary-C-${randomUUID()}`
        await repository.insert(
          idC,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        // Supersede pending logs for log B (the middle one)
        // Should only supersede A (created before B), NOT C (created after B)
        const result = await repository.supersedePendingLogs(
          organisationId,
          registrationId,
          idB
        )

        // Only A should be superseded (created before B)
        expect(result).toBe(1)

        const logA = await waitForVersion(repository, idA, 2)
        expect(logA.summaryLog.status).toBe('superseded')

        // B should not be superseded (it's the current log, excluded by ID)
        const logB = await repository.findById(idB)
        expect(logB.summaryLog.status).toBe('validating')

        // C should NOT be superseded (created AFTER B)
        const logC = await repository.findById(idC)
        expect(logC.summaryLog.status).toBe('validated')
      })

      it('increments version when superseding', async () => {
        const id = `summary-${randomUUID()}`
        const idToKeep = `summary-${randomUUID()}`
        const { organisationId, registrationId } = generateOrgReg()

        // Insert the log to be superseded first
        await repository.insert(
          id,
          buildSummaryLog({
            status: 'validated',
            organisationId,
            registrationId
          })
        )

        // Insert the "current" log that triggers the supersede
        await repository.insert(
          idToKeep,
          buildSummaryLog({
            status: 'validating',
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

        const afterSupersede = await waitForVersion(repository, id, 2)
        expect(afterSupersede.version).toBe(2)
      })

      describe('optimistic concurrency', () => {
        it('uses version checking when superseding documents', async () => {
          const id = `summary-${randomUUID()}`
          const idToKeep = `summary-${randomUUID()}`
          const { organisationId, registrationId } = generateOrgReg()

          // Insert the log to be superseded first
          await repository.insert(
            id,
            buildSummaryLog({
              status: 'validated',
              organisationId,
              registrationId
            })
          )

          // Insert the "current" log that triggers the supersede
          await repository.insert(
            idToKeep,
            buildSummaryLog({
              status: 'validating',
              organisationId,
              registrationId
            })
          )

          // Get the initial version
          const initial = await repository.findById(id)
          expect(initial.version).toBe(1)

          // Supersede it
          const result = await repository.supersedePendingLogs(
            organisationId,
            registrationId,
            idToKeep
          )

          expect(result).toBe(1)

          // Verify it was superseded with version increment
          const final = await waitForVersion(repository, id, 2)
          expect(final.summaryLog.status).toBe('superseded')
          expect(final.version).toBe(2)
        })

        it('handles concurrent supersede operations without error', async () => {
          const id1 = `summary-${randomUUID()}`
          const id2 = `summary-${randomUUID()}`
          const idToKeepA = `summary-${randomUUID()}`
          const idToKeepB = `summary-${randomUUID()}`
          const { organisationId, registrationId } = generateOrgReg()

          // Insert two pending logs to be superseded (created first)
          await repository.insert(
            id1,
            buildSummaryLog({
              status: 'validated',
              organisationId,
              registrationId
            })
          )
          await repository.insert(
            id2,
            buildSummaryLog({
              status: 'validated',
              organisationId,
              registrationId
            })
          )

          // Insert two "current" logs that trigger the supersede
          // Use 'submitted' status so they're not considered pending themselves
          await repository.insert(
            idToKeepA,
            buildSummaryLog({
              status: 'submitted',
              organisationId,
              registrationId
            })
          )
          await repository.insert(
            idToKeepB,
            buildSummaryLog({
              status: 'submitted',
              organisationId,
              registrationId
            })
          )

          // Run two supersede operations concurrently
          // Both operations will try to supersede id1 and id2
          // With optimistic concurrency, each doc gets superseded exactly once
          const results = await Promise.all([
            repository.supersedePendingLogs(
              organisationId,
              registrationId,
              idToKeepA
            ),
            repository.supersedePendingLogs(
              organisationId,
              registrationId,
              idToKeepB
            )
          ])

          // Total superseded should be 2 (each doc superseded exactly once)
          expect(results[0] + results[1]).toBe(2)

          // Both should end up superseded
          const final1 = await waitForVersion(repository, id1, 2)
          const final2 = await waitForVersion(repository, id2, 2)
          expect(final1.summaryLog.status).toBe('superseded')
          expect(final2.summaryLog.status).toBe('superseded')
        })

        it('returns 0 when all target documents were modified by others', async () => {
          const id = `summary-${randomUUID()}`
          const idToKeep = `summary-${randomUUID()}`
          const { organisationId, registrationId } = generateOrgReg()

          // Insert the log to be superseded first
          await repository.insert(
            id,
            buildSummaryLog({
              status: 'validated',
              organisationId,
              registrationId
            })
          )

          // Insert the "current" log that triggers the supersede
          await repository.insert(
            idToKeep,
            buildSummaryLog({
              status: 'validating',
              organisationId,
              registrationId
            })
          )

          // Modify target to a non-pending status before supersede runs
          const doc = await repository.findById(id)
          await repository.update(id, doc.version, {
            ...doc.summaryLog,
            status: 'submitting'
          })

          // Supersede should find nothing to supersede (status no longer pending)
          const result = await repository.supersedePendingLogs(
            organisationId,
            registrationId,
            idToKeep
          )

          expect(result).toBe(0)
        })
      })
    })
  })
}
