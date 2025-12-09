import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { transformAll } from './submission-transformer.js'
import { logger } from '#common/helpers/logging/logger.js'
import { parseOrgSubmission } from '#formsubmission/organisation/transform-organisation.js'
import { parseRegistrationSubmission } from '#formsubmission/registration/transform-registration.js'
import { parseAccreditationSubmission } from '#formsubmission/accreditation/transform-accreditation.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#formsubmission/organisation/transform-organisation.js', () => ({
  parseOrgSubmission: vi.fn((id, orgId, _) => ({
    id,
    orgId,
    companyDetails: { name: `Company ${orgId}` },
    users: [],
    registrations: [],
    accreditations: []
  }))
}))
vi.mock('#formsubmission/registration/transform-registration.js', () => ({
  parseRegistrationSubmission: vi.fn((id, _) => ({
    id,
    systemReference: new ObjectId().toString(),
    orgId: 500001,
    material: 'plastic'
  }))
}))
vi.mock('#formsubmission/accreditation/transform-accreditation.js', () => ({
  parseAccreditationSubmission: vi.fn((id, _) => ({
    id,
    systemReference: new ObjectId().toString(),
    orgId: 500001,
    material: 'plastic'
  }))
}))

describe('transformAll', () => {
  let formsSubmissionRepository

  const org1Id = new ObjectId()
  const org2Id = new ObjectId()
  const reg1Id = new ObjectId()
  const reg2Id = new ObjectId()

  beforeEach(() => {
    formsSubmissionRepository = {
      findOrganisationById: vi.fn(),
      findRegistrationById: vi.fn(),
      findAccreditationById: vi.fn()
    }
    vi.clearAllMocks()
  })

  it('should transform all submission types ', async () => {
    const accrId1 = new ObjectId()
    const submissionsToMigrate = {
      organisations: new Set([org1Id.toString()]),
      registrations: new Set([reg1Id.toString()]),
      accreditations: new Set([accrId1.toString()])
    }

    formsSubmissionRepository.findOrganisationById.mockResolvedValueOnce({
      id: org1Id.toString(),
      orgId: 500001,
      rawSubmissionData: {}
    })
    formsSubmissionRepository.findRegistrationById.mockResolvedValueOnce({
      id: reg1Id.toString(),
      rawSubmissionData: {}
    })
    formsSubmissionRepository.findAccreditationById.mockResolvedValueOnce({
      id: accrId1.toString(),
      rawSubmissionData: {}
    })

    const result = await transformAll(
      formsSubmissionRepository,
      submissionsToMigrate
    )

    expect(result.organisations).toHaveLength(1)
    expect(result.organisations[0]).toEqual({
      id: org1Id.toString(),
      orgId: 500001,
      companyDetails: { name: 'Company 500001' },
      users: [],
      registrations: [],
      accreditations: []
    })

    expect(result.registrations).toHaveLength(1)
    expect(result.registrations[0]).toMatchObject({
      id: reg1Id.toString(),
      orgId: 500001,
      material: 'plastic'
    })
    expect(result.registrations[0].systemReference).toBeTruthy()
    expect(ObjectId.isValid(result.registrations[0].systemReference)).toBe(true)

    expect(result.accreditations).toHaveLength(1)
    expect(result.accreditations[0]).toMatchObject({
      id: accrId1.toString(),
      orgId: 500001,
      material: 'plastic'
    })
    expect(result.accreditations[0].systemReference).toBeTruthy()
    expect(ObjectId.isValid(result.accreditations[0].systemReference)).toBe(
      true
    )

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/1 organisation form submissions (0 failed)'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/1 registration form submissions (0 failed)'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/1 accreditation form submissions (0 failed)'
    })
  })

  it('should handle fetch failures across different submission types', async () => {
    const accrId1 = new ObjectId()
    const accrId2 = new ObjectId()
    const submissionsToMigrate = {
      organisations: new Set([org1Id.toString(), org2Id.toString()]),
      registrations: new Set([reg1Id.toString(), reg2Id.toString()]),
      accreditations: new Set([accrId1.toString(), accrId2.toString()])
    }

    formsSubmissionRepository.findOrganisationById
      .mockResolvedValueOnce({
        id: org1Id.toString(),
        orgId: 500001,
        rawSubmissionData: {}
      })
      .mockRejectedValueOnce(new Error('Organisation transform failed'))
    formsSubmissionRepository.findRegistrationById
      .mockResolvedValueOnce({
        id: reg1Id.toString(),
        rawSubmissionData: {}
      })
      .mockRejectedValueOnce(new Error('Registration transform failed'))
    formsSubmissionRepository.findAccreditationById
      .mockResolvedValueOnce({
        id: accrId1.toString(),
        rawSubmissionData: {}
      })
      .mockRejectedValueOnce(new Error('Accreditation transform failed'))

    const result = await transformAll(
      formsSubmissionRepository,
      submissionsToMigrate
    )

    expect(result.organisations).toHaveLength(1)
    expect(result.registrations).toHaveLength(1)
    expect(result.accreditations).toHaveLength(1)

    expect(logger.error).toHaveBeenCalledTimes(3)
    expect(logger.error).toHaveBeenCalledWith({
      message: 'Error transforming organisation submission',
      event: {
        action: 'data_migration_failure',
        category: 'database',
        reference: org2Id.toString()
      },
      error: expect.any(Error)
    })
    expect(logger.error).toHaveBeenCalledWith({
      message: 'Error transforming registration submission',
      event: {
        action: 'data_migration_failure',
        category: 'database',
        reference: reg2Id.toString()
      },
      error: expect.any(Error)
    })
    expect(logger.error).toHaveBeenCalledWith({
      message: 'Error transforming accreditation submission',
      event: {
        action: 'data_migration_failure',
        category: 'database',
        reference: accrId2.toString()
      },
      error: expect.any(Error)
    })

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/2 organisation form submissions (1 failed)'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/2 registration form submissions (1 failed)'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/2 accreditation form submissions (1 failed)'
    })
  })

  it('should handle parse failures across different submission types', async () => {
    const accrId1 = new ObjectId()
    const accrId2 = new ObjectId()
    const submissionsToMigrate = {
      organisations: new Set([org1Id.toString(), org2Id.toString()]),
      registrations: new Set([reg1Id.toString(), reg2Id.toString()]),
      accreditations: new Set([accrId1.toString(), accrId2.toString()])
    }

    // All fetch operations succeed
    formsSubmissionRepository.findOrganisationById
      .mockResolvedValueOnce({
        id: org1Id.toString(),
        orgId: 500001,
        rawSubmissionData: {}
      })
      .mockResolvedValueOnce({
        id: org2Id.toString(),
        orgId: 500002,
        rawSubmissionData: {}
      })
    formsSubmissionRepository.findRegistrationById
      .mockResolvedValueOnce({
        id: reg1Id.toString(),
        rawSubmissionData: {}
      })
      .mockResolvedValueOnce({
        id: reg2Id.toString(),
        rawSubmissionData: {}
      })
    formsSubmissionRepository.findAccreditationById
      .mockResolvedValueOnce({
        id: accrId1.toString(),
        rawSubmissionData: {}
      })
      .mockResolvedValueOnce({
        id: accrId2.toString(),
        rawSubmissionData: {}
      })

    // But parse operations fail for second item in each category
    parseOrgSubmission
      .mockReturnValueOnce({
        id: org1Id.toString(),
        orgId: 500001,
        companyDetails: { name: 'Company 500001' },
        users: [],
        registrations: [],
        accreditations: []
      })
      .mockImplementationOnce(() => {
        throw new Error('Organisation parse failed')
      })
    parseRegistrationSubmission
      .mockReturnValueOnce({
        id: reg1Id.toString(),
        systemReference: new ObjectId().toString(),
        orgId: 500001,
        material: 'plastic'
      })
      .mockImplementationOnce(() => {
        throw new Error('Registration parse failed')
      })
    parseAccreditationSubmission
      .mockReturnValueOnce({
        id: accrId1.toString(),
        systemReference: new ObjectId().toString(),
        orgId: 500001,
        material: 'plastic'
      })
      .mockImplementationOnce(() => {
        throw new Error('Accreditation parse failed')
      })

    const result = await transformAll(
      formsSubmissionRepository,
      submissionsToMigrate
    )

    expect(result.organisations).toHaveLength(1)
    expect(result.registrations).toHaveLength(1)
    expect(result.accreditations).toHaveLength(1)

    expect(logger.error).toHaveBeenCalledTimes(3)
    expect(logger.error).toHaveBeenCalledWith({
      message: 'Error transforming organisation submission',
      event: {
        action: 'data_migration_failure',
        category: 'database',
        reference: org2Id.toString()
      },
      error: expect.any(Error)
    })
    expect(logger.error).toHaveBeenCalledWith({
      message: 'Error transforming registration submission',
      event: {
        action: 'data_migration_failure',
        category: 'database',
        reference: reg2Id.toString()
      },
      error: expect.any(Error)
    })
    expect(logger.error).toHaveBeenCalledWith({
      message: 'Error transforming accreditation submission',
      event: {
        action: 'data_migration_failure',
        category: 'database',
        reference: accrId2.toString()
      },
      error: expect.any(Error)
    })

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/2 organisation form submissions (1 failed)'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/2 registration form submissions (1 failed)'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Transformed 1/2 accreditation form submissions (1 failed)'
    })
  })
})
