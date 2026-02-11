import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { upsertOrganisations } from './organisation-persistence.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('#formsubmission/parsing-common/transform-utils.js', () => ({
  removeUndefinedValues: vi.fn((obj) => obj)
}))

describe('upsertOrganisations', () => {
  let organisationsRepository

  const org1Id = new ObjectId()
  const org2Id = new ObjectId()

  beforeEach(() => {
    organisationsRepository = {
      insert: vi.fn(),
      replace: vi.fn()
    }
    vi.clearAllMocks()
  })

  describe('persistence scenarios', () => {
    it('should insert and update organisations successfully', async () => {
      const organisations = [
        {
          value: { id: org1Id.toString(), orgId: 500001 },
          operation: 'insert'
        },
        {
          value: { id: org2Id.toString(), version: 1, orgId: 500002 },
          operation: 'update'
        }
      ]
      organisationsRepository.insert.mockResolvedValue()
      organisationsRepository.replace.mockResolvedValue()

      const result = await upsertOrganisations(
        organisationsRepository,
        organisations
      )

      expect(organisationsRepository.insert).toHaveBeenCalledTimes(1)
      expect(organisationsRepository.replace).toHaveBeenCalledTimes(1)
      expect(result).toEqual({
        successful: [
          { success: true, id: org1Id.toString(), action: 'inserted' },
          { success: true, id: org2Id.toString(), action: 'updated' }
        ],
        failed: []
      })
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Persisted transformed submissions: 2/2 organisations processed (1 inserted, 1 updated, 0 failed)'
      })
    })

    it('should handle insert failure and log error', async () => {
      const org1IdStr = org1Id.toString()
      const organisations = [
        {
          value: { id: org1IdStr, orgId: 500001 },
          operation: 'insert'
        }
      ]
      const error = new Error('Insert failed')
      organisationsRepository.insert.mockRejectedValue(error)

      const result = await upsertOrganisations(
        organisationsRepository,
        organisations
      )

      expect(result).toEqual({
        successful: [],
        failed: [{ success: false, id: org1IdStr, phase: 'insert' }]
      })
      expect(logger.error).toHaveBeenCalledWith({
        err: error,
        message: 'Error inserting organisation',
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
          reference: org1IdStr
        }
      })
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Persisted transformed submissions: 0/1 organisations processed (0 inserted, 0 updated, 1 failed)'
      })
    })

    it('should handle update failure and log error', async () => {
      const org1IdStr = org1Id.toString()
      const organisations = [
        {
          value: { id: org1IdStr, version: 1, orgId: 500001 },
          operation: 'update'
        }
      ]
      const error = new Error('Version conflict')
      organisationsRepository.replace.mockRejectedValue(error)

      const result = await upsertOrganisations(
        organisationsRepository,
        organisations
      )

      expect(result).toEqual({
        successful: [],
        failed: [{ success: false, id: org1IdStr, phase: 'update' }]
      })
      expect(logger.error).toHaveBeenCalledWith({
        err: error,
        message: 'Error updating organisation',
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
          reference: org1IdStr
        }
      })
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Persisted transformed submissions: 0/1 organisations processed (0 inserted, 0 updated, 1 failed)'
      })
    })

    it('should handle mixed success and failure', async () => {
      const org1IdStr = org1Id.toString()
      const org2IdStr = org2Id.toString()
      const organisations = [
        {
          value: { id: org1IdStr, orgId: 500001 },
          operation: 'insert'
        },
        {
          value: { id: org2IdStr, version: 1, orgId: 500002 },
          operation: 'update'
        }
      ]
      organisationsRepository.insert.mockRejectedValue(new Error('Failed'))
      organisationsRepository.replace.mockResolvedValue()

      const result = await upsertOrganisations(
        organisationsRepository,
        organisations
      )

      expect(result).toEqual({
        successful: [{ success: true, id: org2IdStr, action: 'updated' }],
        failed: [{ success: false, id: org1IdStr, phase: 'insert' }]
      })
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Persisted transformed submissions: 1/2 organisations processed (0 inserted, 1 updated, 1 failed)'
      })
    })
  })
})
