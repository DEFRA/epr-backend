import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migrateFormsData } from './migrate-forms-data.js'
import { parseOrgSubmission } from './transform-organisation-data.js'

vi.mock('./transform-organisation-data.js')

const validSubmission = {
  id: 'sub-1',
  orgId: 500001,
  rawSubmissionData: { someData: 'value' }
}

const transformedOrg = {
  id: 'org-123',
  orgId: 500001,
  companyDetails: { name: 'Test Company' }
}

describe('migrateFormsData', () => {
  let formsSubmissionRepository
  let organisationsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    formsSubmissionRepository = {
      findAllOrganisations: vi.fn()
    }
    organisationsRepository = {
      upsert: vi.fn()
    }
    parseOrgSubmission.mockResolvedValue(transformedOrg)
  })

  it('migrates submissions successfully', async () => {
    formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
      validSubmission
    ])
    organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result).toEqual({
      totalSubmissions: 1,
      transformedCount: 1,
      insertedCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 0
    })
    expect(parseOrgSubmission).toHaveBeenCalledWith(
      validSubmission.id,
      validSubmission.orgId,
      validSubmission.rawSubmissionData
    )
    expect(organisationsRepository.upsert).toHaveBeenCalledWith(transformedOrg)
  })

  it('counts updated and unchanged submissions', async () => {
    formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
      validSubmission,
      { ...validSubmission, id: 'sub-2' },
      { ...validSubmission, id: 'sub-3' }
    ])
    organisationsRepository.upsert
      .mockResolvedValueOnce({ action: 'updated' })
      .mockResolvedValueOnce({ action: 'unchanged' })
      .mockResolvedValueOnce({ action: 'inserted' })

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result).toEqual({
      totalSubmissions: 3,
      transformedCount: 3,
      insertedCount: 1,
      updatedCount: 1,
      unchangedCount: 1,
      failedCount: 0
    })
  })

  it('counts transform failures', async () => {
    formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
      validSubmission,
      { ...validSubmission, id: 'sub-2' },
      { ...validSubmission, id: 'sub-3' }
    ])
    // First two succeed transformation, third fails
    parseOrgSubmission
      .mockResolvedValueOnce(transformedOrg)
      .mockResolvedValueOnce(transformedOrg)
      .mockRejectedValueOnce(new Error('Transform failed'))
    organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result).toEqual({
      totalSubmissions: 3,
      transformedCount: 2,
      insertedCount: 2,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 1
    })
    expect(organisationsRepository.upsert).toHaveBeenCalledTimes(2)
  })

  it('counts upsert failures', async () => {
    formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
      validSubmission
    ])
    organisationsRepository.upsert.mockRejectedValue(new Error('Upsert failed'))

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result).toEqual({
      totalSubmissions: 1,
      transformedCount: 1,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 1
    })
    expect(parseOrgSubmission).toHaveBeenCalledWith(
      validSubmission.id,
      validSubmission.orgId,
      validSubmission.rawSubmissionData
    )
    expect(organisationsRepository.upsert).toHaveBeenCalledWith(transformedOrg)
  })

  it('handles empty submissions', async () => {
    formsSubmissionRepository.findAllOrganisations.mockResolvedValue([])

    const result = await migrateFormsData(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result).toEqual({
      totalSubmissions: 0,
      transformedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 0
    })
    expect(organisationsRepository.upsert).not.toHaveBeenCalled()
  })
})
