import { describe, expect, it } from 'vitest'
import { parseRegistrationSubmission } from './transform-registration.js'
import { validateRegistration } from '#repositories/organisations/validation.js'

import exporter from '#data/fixtures/ea/registration/exporter.json'
import reprocessorAllMaterials from '#data/fixtures/ea/registration/reprocessor-all-materials.json'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REGULATOR,
  TIME_SCALE,
  VALUE_TYPE,
  WASTE_PERMIT_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

describe('parseRegistrationSubmission - Integration Tests with Fixture Data', () => {
  it('should parse exporter registration from fixture', async () => {
    const result = await parseRegistrationSubmission(
      exporter._id.$oid,
      exporter.rawSubmissionData
    )

    expect(() => validateRegistration(result)).not.toThrow()

    expect(result).toStrictEqual({
      id: exporter._id.$oid,
      orgId: 503181,
      systemReference: '68e6912278f83083f0f17a7b',
      formSubmissionTime: new Date('2025-10-08T17:48:22.220Z'),
      submittedToRegulator: REGULATOR.EA,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      orgName: 'EuroPack GmbH',
      material: MATERIAL.GLASS,
      cbduNumber: 'CBDU123456',
      wasteManagementPermits: undefined,
      suppliers:
        'Local authorities, supermarkets, manufacturing companies, waste collection companies, materials recovery facilities (MRFs)',
      glassRecyclingProcess: [
        GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
        GLASS_RECYCLING_PROCESS.GLASS_OTHER
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
      samplingInspectionPlanPart1FileUploads: [
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
      ],
      yearlyMetrics: undefined
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
      orgId: 503176,
      systemReference: '68e68d9c78f83083f0f17a76',
      formSubmissionTime: new Date('2025-10-08T17:40:07.373Z'),
      submittedToRegulator: REGULATOR.EA,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      orgName: 'Green Recycling Solutions Ltd',
      material: MATERIAL.GLASS,
      cbduNumber: 'CBDU123456',
      wasteManagementPermits: [
        {
          type: WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT,
          permitNumber: 'EPR/AB1234CD/A001',
          authorisedMaterials: [
            {
              material: MATERIAL.ALUMINIUM,
              authorisedWeightInTonnes: 10,
              timeScale: TIME_SCALE.YEARLY
            },
            {
              material: MATERIAL.FIBRE,
              authorisedWeightInTonnes: 10,
              timeScale: TIME_SCALE.YEARLY
            }
          ]
        },
        {
          type: WASTE_PERMIT_TYPE.INSTALLATION_PERMIT,
          permitNumber: '1232',
          authorisedMaterials: [
            {
              material: MATERIAL.PLASTIC,
              authorisedWeightInTonnes: 10,
              timeScale: TIME_SCALE.YEARLY
            },
            {
              material: MATERIAL.STEEL,
              authorisedWeightInTonnes: 11,
              timeScale: TIME_SCALE.YEARLY
            },
            {
              material: MATERIAL.WOOD,
              authorisedWeightInTonnes: 11,
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
      glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER],
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
            siteCapacityInTonnes: 10
          },
          {
            material: MATERIAL.FIBRE,
            siteCapacityTimescale: TIME_SCALE.MONTHLY,
            siteCapacityInTonnes: 111
          },
          {
            material: MATERIAL.GLASS,
            siteCapacityTimescale: TIME_SCALE.YEARLY,
            siteCapacityInTonnes: 10
          },
          {
            material: MATERIAL.PAPER,
            siteCapacityTimescale: TIME_SCALE.YEARLY,
            siteCapacityInTonnes: 11
          },
          {
            material: MATERIAL.PLASTIC,
            siteCapacityTimescale: TIME_SCALE.WEEKLY,
            siteCapacityInTonnes: 10
          },
          {
            material: MATERIAL.STEEL,
            siteCapacityTimescale: TIME_SCALE.WEEKLY,
            siteCapacityInTonnes: 1
          },
          {
            material: MATERIAL.WOOD,
            siteCapacityTimescale: TIME_SCALE.WEEKLY,
            siteCapacityInTonnes: 1
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
      samplingInspectionPlanPart1FileUploads: [
        {
          defraFormUploadedFileId: 'be506501-273f-4770-9d0a-169f4c513465',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/be506501-273f-4770-9d0a-169f4c513465'
        }
      ],
      orsFileUploads: undefined,
      yearlyMetrics: [
        {
          input: {
            nonPackagingWasteInTonnes: 10,
            nonUkPackagingWasteInTonnes: 10,
            type: VALUE_TYPE.ESTIMATED,
            ukPackagingWasteInTonnes: 12
          },
          output: {
            contaminantsInTonnes: 11,
            processLossInTonnes: 11,
            sentToAnotherSiteInTonnes: 11,
            type: VALUE_TYPE.ESTIMATED
          },
          productsMadeFromRecycling: [
            {
              name: 'Utensils',
              weightInTonnes: 1
            },
            {
              name: 'Plates',
              weightInTonnes: 1
            }
          ],
          rawMaterialInputs: [
            {
              material: 'raw materail1',
              weightInTonnes: 12
            },
            {
              material: 'raw materail 2',
              weightInTonnes: 12
            }
          ],
          year: 2024
        }
      ]
    })
  })

  it('should handle missing notice address', async () => {
    const reprocessorAllMaterialsWithoutNoticeAddress = {
      ...exporter,
      rawSubmissionData: {
        ...reprocessorAllMaterials.rawSubmissionData,
        data: {
          ...reprocessorAllMaterials.rawSubmissionData.data,
          main: {
            ...reprocessorAllMaterials.rawSubmissionData.data.main,
            VHfukU: ''
          }
        }
      }
    }

    const result = await parseRegistrationSubmission(
      reprocessorAllMaterialsWithoutNoticeAddress._id.$oid,
      reprocessorAllMaterialsWithoutNoticeAddress.rawSubmissionData
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
        siteCapacityInTonnes: 10
      },
      {
        material: MATERIAL.FIBRE,
        siteCapacityTimescale: TIME_SCALE.MONTHLY,
        siteCapacityInTonnes: 111
      },
      {
        material: MATERIAL.GLASS,
        siteCapacityTimescale: TIME_SCALE.YEARLY,
        siteCapacityInTonnes: 10
      },
      {
        material: MATERIAL.PAPER,
        siteCapacityTimescale: TIME_SCALE.YEARLY,
        siteCapacityInTonnes: 11
      },
      {
        material: MATERIAL.PLASTIC,
        siteCapacityTimescale: TIME_SCALE.WEEKLY,
        siteCapacityInTonnes: 10
      },
      {
        material: MATERIAL.STEEL,
        siteCapacityTimescale: TIME_SCALE.WEEKLY,
        siteCapacityInTonnes: 1
      }
    ])
  })

  it('should handle reprocessor without waste exemptions', async () => {
    // Remove waste exemption repeater data
    const reprocessorWithoutExemptions = {
      ...reprocessorAllMaterials,
      rawSubmissionData: {
        ...reprocessorAllMaterials.rawSubmissionData,
        data: {
          ...reprocessorAllMaterials.rawSubmissionData.data,
          repeaters: {
            ...reprocessorAllMaterials.rawSubmissionData.data.repeaters,
            IVymzQ: [] // Clear waste exemption repeater
          }
        }
      }
    }

    const result = await parseRegistrationSubmission(
      reprocessorWithoutExemptions._id.$oid,
      reprocessorWithoutExemptions.rawSubmissionData
    )

    expect(() => validateRegistration(result)).not.toThrow()

    // Verify no waste exemption permit exists
    const hasWasteExemption = result.wasteManagementPermits.some(
      (permit) => permit.type === WASTE_PERMIT_TYPE.WASTE_EXEMPTION
    )
    expect(hasWasteExemption).toBe(false)
  })

  it('should handle reprocessor without environmental permit', async () => {
    // Remove environmental permit number
    const reprocessorWithoutEnvPermit = {
      ...reprocessorAllMaterials,
      rawSubmissionData: {
        ...reprocessorAllMaterials.rawSubmissionData,
        data: {
          ...reprocessorAllMaterials.rawSubmissionData.data,
          main: {
            ...reprocessorAllMaterials.rawSubmissionData.data.main,
            xMSsbm: '' // Clear environmental permit number
          }
        }
      }
    }

    const result = await parseRegistrationSubmission(
      reprocessorWithoutEnvPermit._id.$oid,
      reprocessorWithoutEnvPermit.rawSubmissionData
    )

    expect(() => validateRegistration(result)).not.toThrow()

    // Verify no environmental permit exists
    const hasEnvPermit = result.wasteManagementPermits.some(
      (permit) => permit.type === WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT
    )
    expect(hasEnvPermit).toBe(false)
  })

  it('should handle reprocessor without installation permit', async () => {
    // Remove installation permit number
    const reprocessorWithoutInstallationPermit = {
      ...reprocessorAllMaterials,
      rawSubmissionData: {
        ...reprocessorAllMaterials.rawSubmissionData,
        data: {
          ...reprocessorAllMaterials.rawSubmissionData.data,
          main: {
            ...reprocessorAllMaterials.rawSubmissionData.data.main,
            PUgXbJ: '' // Clear installation permit number
          }
        }
      }
    }

    const result = await parseRegistrationSubmission(
      reprocessorWithoutInstallationPermit._id.$oid,
      reprocessorWithoutInstallationPermit.rawSubmissionData
    )

    expect(() => validateRegistration(result)).not.toThrow()

    // Verify no installation permit exists
    const hasInstallationPermit = result.wasteManagementPermits.some(
      (permit) => permit.type === WASTE_PERMIT_TYPE.INSTALLATION_PERMIT
    )
    expect(hasInstallationPermit).toBe(false)
  })
})
