import { describe, it, expect } from 'vitest'
import { getUploadedFileInfo } from './get-file-upload-details.js'
import exporterRegistration from '#data/fixtures/ea/registration/exporter.json' with { type: 'json' }
import reprocessorAllMaterials from '#data/fixtures/ea/registration/reprocessor-all-materials.json' with { type: 'json' }
import exporterAccreditation from '#data/fixtures/ea/accreditation/exporter.json' with { type: 'json' }
import reprocessorPaper from '#data/fixtures/ea/accreditation/reprocessor-paper.json' with { type: 'json' }
import reprocessorWood from '#data/fixtures/ea/accreditation/reprocessor-wood.json' with { type: 'json' }

describe('getFormFileUploads', () => {
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
})
