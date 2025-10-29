import { describe, it, expect, vi } from 'vitest'
import { migrateFormsData } from './migrate-forms-data.js'
import registeredLtdPartnership from '#data/fixtures/ea/organisation/registered-ltd-partnership.json' with { type: 'json' }

describe('migrateFormsData', () => {
  it('should migrate submissions successfully', async () => {
    const submissions = [
      {
        id: 'sub-1',
        orgId: 'org-1',
        rawSubmissionData: registeredLtdPartnership.rawSubmissionData
      }
    ]

    const formsSubmissionRepository = {
      findAll: vi.fn().mockResolvedValue(submissions)
    }

    const organisationsRepository = {
      insert: vi.fn().mockResolvedValue({})
    }

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result.totalSubmissions).toBe(1)
    expect(result.transformedCount).toBe(1)
    expect(result.insertedCount).toBe(1)
    expect(organisationsRepository.insert).toHaveBeenCalledTimes(1)
  })

  it('should handle transform errors', async () => {
    const submissions = [
      {
        id: 'sub-1',
        orgId: 'org-1',
        rawSubmissionData: { invalid: 'data' }
      }
    ]

    const formsSubmissionRepository = {
      findAll: vi.fn().mockResolvedValue(submissions)
    }

    const organisationsRepository = {
      insert: vi.fn().mockResolvedValue({})
    }

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result.totalSubmissions).toBe(1)
    expect(result.transformedCount).toBe(0)
    expect(result.insertedCount).toBe(0)
    expect(organisationsRepository.insert).not.toHaveBeenCalled()
  })

  it('should handle insert errors', async () => {
    const submissions = [
      {
        id: 'sub-1',
        orgId: 'org-1',
        rawSubmissionData: registeredLtdPartnership.rawSubmissionData
      }
    ]

    const formsSubmissionRepository = {
      findAll: vi.fn().mockResolvedValue(submissions)
    }

    const organisationsRepository = {
      insert: vi.fn().mockRejectedValue(new Error('Insert failed'))
    }

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result.totalSubmissions).toBe(1)
    expect(result.transformedCount).toBe(1)
    expect(result.insertedCount).toBe(0)
    expect(organisationsRepository.insert).toHaveBeenCalledTimes(1)
  })

  it('should handle empty submissions', async () => {
    const formsSubmissionRepository = {
      findAll: vi.fn().mockResolvedValue([])
    }

    const organisationsRepository = {
      insert: vi.fn().mockResolvedValue({})
    }

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result.totalSubmissions).toBe(0)
    expect(result.transformedCount).toBe(0)
    expect(result.insertedCount).toBe(0)
    expect(organisationsRepository.insert).not.toHaveBeenCalled()
  })
})
