import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { summaryLogFactory } from './test-data.js'
import { waitForVersion } from './test-helpers.js'

const emptyCategory = () => ({ count: 0, rowIds: [] })

const validity = (rowIds) => ({
  valid: { count: rowIds.length, rowIds },
  invalid: emptyCategory(),
  included: emptyCategory(),
  excluded: emptyCategory()
})

const legacyLoads = () => ({
  added: validity([1000, 1001]),
  unchanged: validity([]),
  adjusted: validity([])
})

/**
 * Summary logs written before ROW_ID coercion hold row IDs as numbers. Reads
 * coerce them so callers always see the string form the domain type promises.
 */
export const testLegacyRowIdBehaviour = (it) => {
  describe('legacy numeric row IDs', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ summaryLogsRepository: import('../port.js').SummaryLogsRepository }} */ {
          summaryLogsRepository
        }
      ) => {
        repository = summaryLogsRepository
      }
    )

    const insertLegacyLog = async (summaryLog) => {
      const id = `contract-legacy-rowids-${randomUUID()}`

      await repository.insert(id, summaryLog)
      // No current writer produces numeric row IDs; only summary logs stored
      // before ROW_ID coercion hold them, which is what this seeds.
      await repository.update(id, 1, { loads: legacyLoads() })
      await waitForVersion(repository, id, 2)

      return id
    }

    it('findById returns numeric row IDs as strings', async () => {
      const id = await insertLegacyLog(summaryLogFactory.validated({}))

      const { summaryLog } = await repository.findById(id)

      expect(summaryLog.loads.added.valid.rowIds).toEqual(['1000', '1001'])
    })

    it('findAllByOrgReg returns numeric row IDs as strings', async () => {
      const organisationId = `contract-org-${randomUUID()}`
      const registrationId = `contract-reg-${randomUUID()}`
      await insertLegacyLog(
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-02-06T14:45:31.037Z'
        })
      )

      const results = await repository.findAllByOrgReg(
        organisationId,
        registrationId
      )

      expect(results[0].summaryLog.loads.added.valid.rowIds).toEqual([
        '1000',
        '1001'
      ])
    })

    it('leaves a log without loads untouched', async () => {
      const id = `contract-no-loads-${randomUUID()}`
      await repository.insert(id, summaryLogFactory.validated({}))

      const { summaryLog } = await repository.findById(id)

      expect(summaryLog).not.toHaveProperty('loads')
    })
  })
}
