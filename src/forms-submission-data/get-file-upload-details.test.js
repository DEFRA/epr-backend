import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getUploadedFileInfo } from './get-file-upload-details.js'
import exporterRegistration from '#data/fixtures/ea/registration/exporter.json' with { type: 'json' }
import reprocessorAllMaterials from '#data/fixtures/ea/registration/reprocessor-all-materials.json' with { type: 'json' }
import exporterAccreditation from '#data/fixtures/ea/accreditation/exporter.json' with { type: 'json' }
import reprocessorPaper from '#data/fixtures/ea/accreditation/reprocessor-paper.json' with { type: 'json' }
import reprocessorWood from '#data/fixtures/ea/accreditation/reprocessor-wood.json' with { type: 'json' }

const mockLoggerWarn = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    warn: (...args) => mockLoggerWarn(...args)
  }
}))

describe('getFormFileUploads', () => {
  beforeEach(() => {
    mockLoggerWarn.mockClear()
  })

  it('should extract all file details from all registrations and accreditations', async () => {
    const mockRepository = {
      findAllRegistrations: async () => [
        {
          id: exporterRegistration._id.$oid,
          orgId: exporterRegistration.orgId,
          referenceNumber: exporterRegistration.referenceNumber,
          rawSubmissionData: exporterRegistration.rawSubmissionData
        },
        {
          id: reprocessorAllMaterials._id.$oid,
          orgId: reprocessorAllMaterials.orgId,
          referenceNumber: reprocessorAllMaterials.referenceNumber,
          rawSubmissionData: reprocessorAllMaterials.rawSubmissionData
        }
      ],
      findAllAccreditations: async () => [
        {
          id: exporterAccreditation._id.$oid,
          orgId: exporterAccreditation.orgId,
          referenceNumber: exporterAccreditation.referenceNumber,
          rawSubmissionData: exporterAccreditation.rawSubmissionData
        },
        {
          id: reprocessorPaper._id.$oid,
          orgId: reprocessorPaper.orgId,
          referenceNumber: reprocessorPaper.referenceNumber,
          rawSubmissionData: reprocessorPaper.rawSubmissionData
        },
        {
          id: reprocessorWood._id.$oid,
          orgId: reprocessorWood.orgId,
          referenceNumber: reprocessorWood.referenceNumber,
          rawSubmissionData: reprocessorWood.rawSubmissionData
        }
      ]
    }

    const result = await getUploadedFileInfo(mockRepository)

    expect(result).toEqual([
      // Exporter Registration - 2 files (2 file upload fields, 1 file each)
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste exporter (EA)',
        fileId: '12b95c25-6119-4478-a060-79716455036b',
        id: exporterRegistration._id.$oid
      },
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste exporter (EA)',
        fileId: '92133d12-b525-412a-8328-860dfeaa0718',
        id: exporterRegistration._id.$oid
      },
      // Reprocessor All Materials Registration - 1 file
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste reprocessor (EA)',
        fileId: 'be506501-273f-4770-9d0a-169f4c513465',
        id: reprocessorAllMaterials._id.$oid
      },
      // Exporter Accreditation - 2 files (2 file upload fields, 1 file each)
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: apply for accreditation as a packaging waste exporter (EA)',
        fileId: '8292dc89-a288-4b7e-afa5-6ef6ac0d7068',
        id: exporterAccreditation._id.$oid
      },
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: apply for accreditation as a packaging waste exporter (EA)',
        fileId: '342ea001-3627-4486-b024-3621f9881029',
        id: exporterAccreditation._id.$oid
      },
      // Reprocessor Paper Accreditation - 1 file
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: apply for accreditation as a packaging waste reprocessor (EA)',
        fileId: '704d9252-645d-4d6f-b68c-7907c1d040ef',
        id: reprocessorPaper._id.$oid
      },
      // Reprocessor Wood Accreditation - 1 file
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: apply for accreditation as a packaging waste reprocessor (EA)',
        fileId: 'd2ffa1d3-49a5-4eba-be63-a22235536c22',
        id: reprocessorWood._id.$oid
      }
    ])

    // Verify counts
    expect(result).toHaveLength(7)

    const registrationFiles = result.filter((f) =>
      f.formName.includes('register as')
    )
    expect(registrationFiles).toHaveLength(3)

    const accreditationFiles = result.filter((f) =>
      f.formName.includes('accreditation as')
    )
    expect(accreditationFiles).toHaveLength(4)
  })

  it('should handle submissions with no files', async () => {
    const mockRepository = {
      findAllRegistrations: async () => [
        {
          id: 'test-id',
          orgId: 999999,
          referenceNumber: 'REF-NO-FILES',
          rawSubmissionData: {
            meta: {
              definition: {
                name: 'Form Without Files'
              }
            },
            data: {}
          }
        }
      ],
      findAllAccreditations: async () => []
    }

    const result = await getUploadedFileInfo(mockRepository)

    expect(result).toEqual([])
  })

  it('should skip non-array file values and log warning', async () => {
    const mockRepository = {
      findAllRegistrations: async () => [
        {
          id: '68b032e3f94be3c78a10e9bf',
          orgId: 500000,
          referenceNumber: '68a66ec3dabf09f3e442b2da',
          rawSubmissionData: {
            meta: {
              definition: {
                name: 'Test Registration Form'
              }
            },
            data: {
              files: {
                qEZeYC: [
                  {
                    fileId: 'd5e8e077-f2fc-46ed-b235-b1e67386046b',
                    userDownloadLink:
                      'https://forms-designer.test.cdp-int.defra.cloud/file-download/d5e8e077-f2fc-46ed-b235-b1e67386046b'
                  }
                ],
                uUWjUW: [
                  {
                    fileId: 'c4d1e05d-e79c-4a81-9d96-2ac38ce2cb7b',
                    userDownloadLink:
                      'https://forms-designer.test.cdp-int.defra.cloud/file-download/c4d1e05d-e79c-4a81-9d96-2ac38ce2cb7b'
                  }
                ],
                $where:
                  "if(typeof az66c==='undefined'){var a=new Date();do{var b=new Date();}while(b-a<20000);az66c=1;}"
              }
            }
          }
        }
      ],
      findAllAccreditations: async () => []
    }

    const result = await getUploadedFileInfo(mockRepository)

    expect(result).toEqual([
      {
        formName: 'Test Registration Form',
        fileId: 'd5e8e077-f2fc-46ed-b235-b1e67386046b',
        id: '68b032e3f94be3c78a10e9bf'
      },
      {
        formName: 'Test Registration Form',
        fileId: 'c4d1e05d-e79c-4a81-9d96-2ac38ce2cb7b',
        id: '68b032e3f94be3c78a10e9bf'
      }
    ])

    // Should log warning about the non-array $where value
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      message:
        'Skipping submission due to non-array file value - submissionId: 68b032e3f94be3c78a10e9bf, formName: Test Registration Form, fileValueType: string'
    })
  })
})
