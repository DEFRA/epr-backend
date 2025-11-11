import { describe, expect, it } from 'vitest'
import { parseRegistrationSubmission } from './transform-registration.js'
import { validateRegistration } from '#repositories/organisations/validation.js'

import exporter from '#data/fixtures/ea/registration/exporter.json'
import reprocessorAllMaterials from '#data/fixtures/ea/registration/reprocessor-all-materials.json'
import {
  MATERIAL,
  RECYCLING_PROCESS,
  REGULATOR,
  TIME_SCALE,
  WASTE_PERMIT_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations.js'

describe('parseRegistrationSubmission - Integration Tests with Fixture Data', () => {
  it('should parse exporter registration from fixture', async () => {
    const result = await parseRegistrationSubmission(
      exporter._id.$oid,
      exporter.rawSubmissionData
    )

    expect(() => validateRegistration(result)).not.toThrow()

    expect(result).toStrictEqual({
      id: exporter._id.$oid,
      formSubmissionTime: new Date('2025-10-08T17:48:22.220Z'),
      submittedToRegulator: REGULATOR.EA,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      orgName: 'EuroPack GmbH',
      material: MATERIAL.GLASS,
      wasteRegistrationNumber: 'CBDU123456',
      wasteManagementPermits: [],
      suppliers:
        'Local authorities, supermarkets, manufacturing companies, waste collection companies, materials recovery facilities (MRFs)',
      recyclingType: [
        RECYCLING_PROCESS.GLASS_RE_MELT,
        RECYCLING_PROCESS.GLASS_OTHER
      ],
      plantEquipmentDetails: undefined,
      exportPorts: ['SouthHampton', 'Portsmouth'],
      submitterContactDetails: {
        fullName: 'Sarah Mitchell',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '1234567890',
        title: 'Packaging Compliance Officer'
      },
      site: undefined,
      noticeAddress: {
        line1: '45',
        postcode: 'B2 4AA',
        fullAddress: '45,High Street,Birmingham,B2 4AA',
        country: 'UK'
      },
      approvedPersons: [
        {
          email: 'reexserviceteam@defra.gov.uk',
          fullName: 'Sarah Mitchell',
          phone: '1234567890',
          title: 'Packaging Compliance Officer'
        }
      ],
      samplingInspectionPlanFileUploads: [
        {
          defraFormUploadedFileId: '12b95c25-6119-4478-a060-79716455036b',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/12b95c25-6119-4478-a060-79716455036b'
        }
      ],
      orsFileUploads: [
        {
          defraFormUploadedFileId: '92133d12-b525-412a-8328-860dfeaa0718',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/92133d12-b525-412a-8328-860dfeaa0718'
        }
      ]
    })
  })

  it('should parse reprocessor registration for all materials from fixture', async () => {
    const result = await parseRegistrationSubmission(
      reprocessorAllMaterials._id.$oid,
      reprocessorAllMaterials.rawSubmissionData
    )

    // Validate result against registrationSchema
    expect(() => validateRegistration(result)).not.toThrow()

    expect(result).toStrictEqual({
      id: reprocessorAllMaterials._id.$oid,
      formSubmissionTime: new Date('2025-10-08T17:40:07.373Z'),
      submittedToRegulator: REGULATOR.EA,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      orgName: 'Green Recycling Solutions Ltd',
      material: MATERIAL.GLASS,
      wasteRegistrationNumber: 'CBDU123456',
      wasteManagementPermits: [
        {
          type: WASTE_PERMIT_TYPE.WML,
          permitNumber: 'EPR/AB1234CD/A001',
          authorisedMaterials: [
            {
              material: MATERIAL.ALUMINIUM,
              authorisedWeight: 10,
              timeScale: TIME_SCALE.YEARLY
            },
            {
              material: MATERIAL.FIBRE,
              authorisedWeight: 10,
              timeScale: TIME_SCALE.YEARLY
            }
          ]
        },
        {
          type: WASTE_PERMIT_TYPE.PPC,
          permitNumber: '1232',
          authorisedMaterials: [
            {
              material: MATERIAL.PLASTIC,
              authorisedWeight: 10,
              timeScale: TIME_SCALE.YEARLY
            },
            {
              material: MATERIAL.STEEL,
              authorisedWeight: 11,
              timeScale: TIME_SCALE.YEARLY
            },
            {
              material: MATERIAL.WOOD,
              authorisedWeight: 11,
              timeScale: TIME_SCALE.MONTHLY
            }
          ]
        },
        {
          type: WASTE_PERMIT_TYPE.WASTE_EXEMPTION,
          exemptions: [
            {
              exemptionCode: 'U9',
              materials: [MATERIAL.PAPER, MATERIAL.PLASTIC],
              reference: 'WEX123456'
            },
            {
              exemptionCode: 'Y6',
              materials: [MATERIAL.PAPER],
              reference: 'WEX723456'
            }
          ]
        }
      ],
      suppliers:
        'Local authorities, supermarkets, manufacturing companies, waste collection companies, materials recovery facilities (MRFs)',
      recyclingType: 'glass_other',
      plantEquipmentDetails:
        'Optical sorting machine (Model XR-500), industrial crusher producing 10-40mm cullet, trommel screen (50mm aperture), magnetic separator, vibrating screens for grading, wash and rinse facility, rotary dryer, storage bunkers (50 tonne capacity), conveyor belt system (50m length), bag splitter, dust extraction system, weighbridge (60 tonne)',
      exportPorts: undefined,
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '020 7946 0123',
        title: 'Director'
      },
      site: {
        address: {
          line1: '78 Portland Place',
          postcode: 'W1B 1NT',
          fullAddress: '78 Portland Place,London,London,W1B 1NT',
          country: 'UK'
        },
        gridReference: 'TQ 295 805',
        siteCapacity: [
          {
            material: MATERIAL.ALUMINIUM,
            siteCapacityTimescale: TIME_SCALE.MONTHLY,
            siteCapacityWeight: 10
          },
          {
            material: MATERIAL.FIBRE,
            siteCapacityTimescale: TIME_SCALE.MONTHLY,
            siteCapacityWeight: 111
          },
          {
            material: MATERIAL.GLASS,
            siteCapacityTimescale: TIME_SCALE.YEARLY,
            siteCapacityWeight: 10
          },
          {
            material: MATERIAL.PAPER,
            siteCapacityTimescale: TIME_SCALE.YEARLY,
            siteCapacityWeight: 11
          },
          {
            material: MATERIAL.PLASTIC,
            siteCapacityTimescale: TIME_SCALE.WEEKLY,
            siteCapacityWeight: 10
          },
          {
            material: MATERIAL.STEEL,
            siteCapacityTimescale: TIME_SCALE.WEEKLY,
            siteCapacityWeight: 1
          },
          {
            material: MATERIAL.WOOD,
            siteCapacityTimescale: TIME_SCALE.WEEKLY,
            siteCapacityWeight: 1
          }
        ]
      },
      approvedPersons: [
        {
          email: 'reexserviceteam@defra.gov.uk',
          fullName: 'James Patterson',
          phone: '020 7946 0123',
          title: 'Director'
        }
      ],
      noticeAddress: {
        line1: '90',
        postcode: 'W1B 1NT',
        fullAddress: '90,Portland Place,London,W1B 1NT',
        country: 'UK'
      },
      samplingInspectionPlanFileUploads: [
        {
          defraFormUploadedFileId: 'be506501-273f-4770-9d0a-169f4c513465',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/be506501-273f-4770-9d0a-169f4c513465'
        }
      ],
      orsFileUploads: undefined
    })
  })

  it('should handle missing notice address', async () => {
    const exporterWithoutNoticeAddress = {
      ...exporter,
      rawSubmissionData: {
        ...exporter.rawSubmissionData,
        data: {
          ...exporter.rawSubmissionData.data,
          main: {
            ...exporter.rawSubmissionData.data.main,
            pGYoub: ''
          }
        }
      }
    }

    const result = await parseRegistrationSubmission(
      exporterWithoutNoticeAddress._id.$oid,
      exporterWithoutNoticeAddress.rawSubmissionData
    )

    expect(() => validateRegistration(result)).not.toThrow()
    expect(result.noticeAddress).toBeUndefined()
  })

  it('should handle reprocessor with partial site capacity data', async () => {
    // Remove Wood site capacity data by clearing the timescale field
    const reprocessorWithPartialCapacity = {
      ...reprocessorAllMaterials,
      rawSubmissionData: {
        ...reprocessorAllMaterials.rawSubmissionData,
        data: {
          ...reprocessorAllMaterials.rawSubmissionData.data,
          main: {
            ...reprocessorAllMaterials.rawSubmissionData.data.main,
            bOVLpK: '' // Wood timescale field - clear it
          }
        }
      }
    }

    const result = await parseRegistrationSubmission(
      reprocessorWithPartialCapacity._id.$oid,
      reprocessorWithPartialCapacity.rawSubmissionData
    )

    expect(() => validateRegistration(result)).not.toThrow()

    // Should have site capacity for all materials except Wood
    expect(result.site.siteCapacity).toHaveLength(6)
    expect(result.site.siteCapacity).toEqual([
      {
        material: MATERIAL.ALUMINIUM,
        siteCapacityTimescale: TIME_SCALE.MONTHLY,
        siteCapacityWeight: 10
      },
      {
        material: MATERIAL.FIBRE,
        siteCapacityTimescale: TIME_SCALE.MONTHLY,
        siteCapacityWeight: 111
      },
      {
        material: MATERIAL.GLASS,
        siteCapacityTimescale: TIME_SCALE.YEARLY,
        siteCapacityWeight: 10
      },
      {
        material: MATERIAL.PAPER,
        siteCapacityTimescale: TIME_SCALE.YEARLY,
        siteCapacityWeight: 11
      },
      {
        material: MATERIAL.PLASTIC,
        siteCapacityTimescale: TIME_SCALE.WEEKLY,
        siteCapacityWeight: 10
      },
      {
        material: MATERIAL.STEEL,
        siteCapacityTimescale: TIME_SCALE.WEEKLY,
        siteCapacityWeight: 1
      }
    ])
  })
})
