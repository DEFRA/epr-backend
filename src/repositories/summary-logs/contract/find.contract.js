import { randomUUID } from 'node:crypto'
import { buildFile, buildSummaryLog } from './test-data.js'

export const testFindBehaviour = (getRepository) => {
  describe('find', () => {
    describe('findById', () => {
      it('returns null when ID not found', async () => {
        const id = `contract-nonexistent-${randomUUID()}`
        const result = await getRepository().findById(id)

        expect(result).toBeNull()
      })

      it('retrieves a log by ID after insert', async () => {
        const id = `contract-summary-${randomUUID()}`
        const fileId = `contract-file-${randomUUID()}`
        const summaryLog = buildSummaryLog(id, {
          file: buildFile({ id: fileId })
        })

        await getRepository().insert(summaryLog)

        const result = await getRepository().findById(id)

        expect(result).toBeTruthy()
        expect(result.id).toBe(id)
        expect(result.file.id).toBe(fileId)
        expect(result.file.name).toBe('test.xlsx')
        expect(result.file.status).toBe('complete')
      })

      it('does not return logs with different IDs', async () => {
        const idA = `contract-summary-a-${randomUUID()}`
        const idB = `contract-summary-b-${randomUUID()}`

        await getRepository().insert(
          buildSummaryLog(idA, {
            organisationId: 'org-1',
            registrationId: 'reg-1'
          })
        )
        await getRepository().insert(
          buildSummaryLog(idB, {
            organisationId: 'org-2',
            registrationId: 'reg-2'
          })
        )

        const result = await getRepository().findById(idA)

        expect(result.id).toBe(idA)
        expect(result.organisationId).toBe('org-1')
      })
    })

    describe('findById validation', () => {
      it('rejects null id', async () => {
        await expect(getRepository().findById(null)).rejects.toThrow(/id/)
      })

      it('rejects undefined id', async () => {
        await expect(getRepository().findById(undefined)).rejects.toThrow(/id/)
      })

      it('rejects empty string id', async () => {
        await expect(getRepository().findById('')).rejects.toThrow(/id/)
      })

      it('rejects number id', async () => {
        const invalidNumberId = 123
        await expect(getRepository().findById(invalidNumberId)).rejects.toThrow(
          /id/
        )
      })

      it('rejects object id', async () => {
        await expect(getRepository().findById({})).rejects.toThrow(/id/)
      })
    })
  })
}
