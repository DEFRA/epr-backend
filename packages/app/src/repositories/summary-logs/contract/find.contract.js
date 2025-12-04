import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildFile, buildSummaryLog } from './test-data.js'

export const testFindBehaviour = (it) => {
  describe('find', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    describe('findById', () => {
      it('returns null when ID not found', async () => {
        const id = `contract-nonexistent-${randomUUID()}`
        const result = await repository.findById(id)

        expect(result).toBeNull()
      })

      it('retrieves a log by ID after insert', async () => {
        const id = `contract-summary-${randomUUID()}`
        const fileId = `contract-file-${randomUUID()}`
        const summaryLog = buildSummaryLog({
          file: buildFile({ id: fileId })
        })

        await repository.insert(id, summaryLog)

        const result = await repository.findById(id)

        expect(result).toBeTruthy()
        expect(result.version).toBe(1)
        expect(result.summaryLog.file.id).toBe(fileId)
        expect(result.summaryLog.file.name).toBe('test.xlsx')
        expect(result.summaryLog.file.status).toBe('complete')
      })

      it('does not return logs with different IDs', async () => {
        const idA = `contract-summary-a-${randomUUID()}`
        const idB = `contract-summary-b-${randomUUID()}`

        await repository.insert(
          idA,
          buildSummaryLog({
            organisationId: 'org-1',
            registrationId: 'reg-1'
          })
        )
        await repository.insert(
          idB,
          buildSummaryLog({
            organisationId: 'org-2',
            registrationId: 'reg-2'
          })
        )

        const result = await repository.findById(idA)

        expect(result.summaryLog.organisationId).toBe('org-1')
      })
    })

    describe('findById validation', () => {
      it('rejects null id', async () => {
        await expect(repository.findById(null)).rejects.toThrow(/id/)
      })

      it('rejects undefined id', async () => {
        await expect(repository.findById(undefined)).rejects.toThrow(/id/)
      })

      it('rejects empty string id', async () => {
        await expect(repository.findById('')).rejects.toThrow(/id/)
      })

      it('rejects number id', async () => {
        const invalidNumberId = 123
        await expect(repository.findById(invalidNumberId)).rejects.toThrow(/id/)
      })

      it('rejects object id', async () => {
        await expect(repository.findById({})).rejects.toThrow(/id/)
      })
    })
  })
}
