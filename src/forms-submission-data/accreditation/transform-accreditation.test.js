import { describe, expect, it } from 'vitest'
import exporter from '#data/fixtures/ea/accreditation/exporter.json'
import reprocessorPaper from '#data/fixtures/ea/accreditation/reprocessor-paper.json'
import reprocessorWood from '#data/fixtures/ea/accreditation/reprocessor-wood.json'
import exporterWithoutRegistration from '#data/fixtures/ea/accreditation/exporter-without-registration.json'
import { parseAccreditationSubmission } from '#formsubmission/accreditation/transform-accreditation.js'
import { validateAccreditation } from '#repositories/organisations/schema/validation.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REGULATOR,
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

describe('parseRegistrationSubmission - Integration Tests with Fixture Data', () => {
  it('should parse exporter accreditation from fixture', () => {
    const result = parseAccreditationSubmission(
      exporter._id.$oid,
      exporter.rawSubmissionData
    )

    expect(() => validateAccreditation(result)).not.toThrow()

    expect(result).toStrictEqual({
      id: '68e6aa2423d5d5454a9a193c',
      formSubmissionTime: new Date('2025-10-08T18:15:00.199Z'),
      submittedToRegulator: REGULATOR.EA,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      orgId: 503181,
      material: MATERIAL.GLASS,
      glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER],
      site: undefined,
      systemReference: '68e6912278f83083f0f17a7b',
      orgName: 'EuroPack GmbH',
      prnIssuance: {
        tonnageBand: TONNAGE_BAND.UP_TO_10000,
        signatories: [
          {
            fullName: 'Emma Roberts',
            email: 'test@gmail.com',
            phone: '1234567890',
            title: 'Director'
          },
          {
            fullName: 'Sarah Mitchell',
            email: 's.mitchell@greenpacksolutions.co.uk',
            phone: '1234567890',
            title: 'Director'
          }
        ],
        incomeBusinessPlan: [
          {
            percentIncomeSpent: 0,
            usageDescription:
              'New reprocessing infrastructure and maintaining existing infrastructure',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription:
              'Price support for buying packaging waste or selling recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription: 'Support for business collections',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription: 'Communications, including information campaigns',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription:
              'Developing new markets for products made from recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription:
              'Developing new uses for recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription:
              'Activities or investment not covered by the other categories',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          }
        ]
      },
      submitterContactDetails: {
        fullName: 'Emma Roberts',
        email: 'test@gmai.com',
        phone: '1234567890',
        title: 'Director'
      },
      samplingInspectionPlanPart2FileUploads: [
        {
          defraFormUploadedFileId: '8292dc89-a288-4b7e-afa5-6ef6ac0d7068',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/8292dc89-a288-4b7e-afa5-6ef6ac0d7068'
        }
      ],
      orsFileUploads: [
        {
          defraFormUploadedFileId: '342ea001-3627-4486-b024-3621f9881029',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/342ea001-3627-4486-b024-3621f9881029'
        }
      ]
    })
  })

  it('should parse reprocessor-wood accreditation from fixture', () => {
    const result = parseAccreditationSubmission(
      reprocessorWood._id.$oid,
      reprocessorWood.rawSubmissionData
    )

    expect(() => validateAccreditation(result)).not.toThrow()

    expect(result).toStrictEqual({
      id: '68e6a62723d5d5454a9a193a',
      formSubmissionTime: new Date('2025-10-08T17:57:59.709Z'),
      submittedToRegulator: REGULATOR.EA,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      orgId: 503176,
      material: MATERIAL.WOOD,
      glassRecyclingProcess: undefined,
      site: {
        address: {
          line1: '78',
          postcode: 'W1B 1NT'
        }
      },
      systemReference: '68e68d9c78f83083f0f17a76',
      orgName: 'Green Recycling Solutions Ltd',
      prnIssuance: {
        tonnageBand: TONNAGE_BAND.OVER_10000,
        signatories: [
          {
            fullName: 'James Patterson',
            email: 'test@gmail.com',
            phone: '1234567890',
            title: 'Sustainability Director'
          }
        ],
        incomeBusinessPlan: [
          {
            percentIncomeSpent: 1,
            usageDescription:
              'New reprocessing infrastructure and maintaining existing infrastructure',
            detailedExplanation:
              'Price support for buying packaging waste or selling recycled packaging waste'
          },
          {
            percentIncomeSpent: 1,
            usageDescription:
              'Price support for buying packaging waste or selling recycled packaging waste',
            detailedExplanation:
              'Price support for buying packaging waste or selling recycled packaging waste'
          },
          {
            percentIncomeSpent: 0,
            usageDescription: 'Support for business collections',
            detailedExplanation:
              'Price support for buying packaging waste or selling recycled packaging waste'
          },
          {
            percentIncomeSpent: 10,
            usageDescription: 'Communications, including information campaigns',
            detailedExplanation:
              'Price support for buying packaging waste or selling recycled packaging waste'
          },
          {
            percentIncomeSpent: 5,
            usageDescription:
              'Developing new markets for products made from recycled packaging waste',
            detailedExplanation:
              'Price support for buying packaging waste or selling recycled packaging waste'
          },
          {
            percentIncomeSpent: 1,
            usageDescription:
              'Developing new uses for recycled packaging waste',
            detailedExplanation:
              'Price support for buying packaging waste or selling recycled packaging waste'
          },
          {
            percentIncomeSpent: 10,
            usageDescription:
              'Activities or investment not covered by the other categories',
            detailedExplanation:
              'Price support for buying packaging waste or selling recycled packaging waste'
          }
        ]
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'tst@gmail.com',
        phone: '020 7946 0123',
        title: 'Sustainability Director'
      },
      samplingInspectionPlanPart2FileUploads: [
        {
          defraFormUploadedFileId: 'd2ffa1d3-49a5-4eba-be63-a22235536c22',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/d2ffa1d3-49a5-4eba-be63-a22235536c22'
        }
      ],
      orsFileUploads: undefined
    })
  })

  it('should parse reprocessor-paper accreditation from fixture', () => {
    const result = parseAccreditationSubmission(
      reprocessorPaper._id.$oid,
      reprocessorPaper.rawSubmissionData
    )

    expect(() => validateAccreditation(result)).not.toThrow()

    expect(result).toStrictEqual({
      id: '68e6a50423d5d5454a9a1939',
      formSubmissionTime: new Date('2025-10-08T17:53:08.213Z'),
      submittedToRegulator: REGULATOR.EA,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      orgId: 503176,
      material: MATERIAL.PAPER,
      glassRecyclingProcess: undefined,
      site: {
        address: {
          line1: '78 Portland Place',
          postcode: 'W1B 1NT'
        }
      },
      systemReference: '68e68d9c78f83083f0f17a76',
      orgName: 'Green Recycling Solutions Ltd',
      prnIssuance: {
        tonnageBand: TONNAGE_BAND.UP_TO_10000,
        signatories: [
          {
            fullName: 'James Patterson',
            email: 'james.patterson@ecoretail.co.uk',
            phone: '020 7946 0123',
            title: 'Sustainability Director'
          },
          {
            fullName: 'Emma Roberts',
            email: 'test@gmail.com',
            phone: '020 7946 0123',
            title: 'Sustainability Director'
          }
        ],
        incomeBusinessPlan: [
          {
            percentIncomeSpent: 1,
            usageDescription:
              'New reprocessing infrastructure and maintaining existing infrastructure',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 1,
            usageDescription:
              'Price support for buying packaging waste or selling recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 2,
            usageDescription: 'Support for business collections',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 2,
            usageDescription: 'Communications, including information campaigns',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 2,
            usageDescription:
              'Developing new markets for products made from recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 2,
            usageDescription:
              'Developing new uses for recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 2,
            usageDescription:
              'Activities or investment not covered by the other categories',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          }
        ]
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'james.patterson@ecoretail.co.uk',
        phone: '020 7946 0123',
        title: 'Sustainability Director'
      },
      samplingInspectionPlanPart2FileUploads: [
        {
          defraFormUploadedFileId: '704d9252-645d-4d6f-b68c-7907c1d040ef',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/704d9252-645d-4d6f-b68c-7907c1d040ef'
        }
      ],
      orsFileUploads: undefined
    })
  })

  it('should parse exporter-without-registration accreditation from fixture', () => {
    const result = parseAccreditationSubmission(
      exporterWithoutRegistration._id.$oid,
      exporterWithoutRegistration.rawSubmissionData
    )

    expect(() => validateAccreditation(result)).not.toThrow()

    expect(result).toStrictEqual({
      id: '68e6a97723d5d5454a9a193b',
      formSubmissionTime: new Date('2025-10-08T18:12:07.326Z'),
      submittedToRegulator: REGULATOR.EA,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      orgId: 503177,
      material: MATERIAL.GLASS,
      glassRecyclingProcess: [
        GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
        GLASS_RECYCLING_PROCESS.GLASS_OTHER
      ],
      site: undefined,
      systemReference: '68e68dd778f83083f0f17a77',
      orgName: 'Green Recycling Solutions Ltd',
      prnIssuance: {
        tonnageBand: TONNAGE_BAND.UP_TO_10000,
        signatories: [
          {
            fullName: 'Emma Roberts',
            email: 'test@gmail.com',
            phone: '12345678',
            title: 'Director'
          }
        ],
        incomeBusinessPlan: [
          {
            percentIncomeSpent: 0,
            usageDescription:
              'New reprocessing infrastructure and maintaining existing infrastructure',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription:
              'Price support for buying packaging waste or selling recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription: 'Support for business collections',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription: 'Communications, including information campaigns',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription:
              'Developing new markets for products made from recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription:
              'Developing new uses for recycled packaging waste',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          },
          {
            percentIncomeSpent: 0,
            usageDescription:
              'Activities or investment not covered by the other categories',
            detailedExplanation:
              'More detail for spend on new reprocessing infrastructure'
          }
        ]
      },
      submitterContactDetails: {
        fullName: 'Emma Roberts',
        email: 'e.roberts@britishbeverage.co.uk',
        phone: '1234567890',
        title: 'Director'
      },
      samplingInspectionPlanPart2FileUploads: [
        {
          defraFormUploadedFileId: '2573151b-8ca2-4699-bbe1-e8970d80ac99',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/2573151b-8ca2-4699-bbe1-e8970d80ac99'
        }
      ],
      orsFileUploads: [
        {
          defraFormUploadedFileId: '1e7cba15-9387-4872-b694-917e4546fc9c',
          defraFormUserDownloadLink:
            'https://forms-designer.test.cdp-int.defra.cloud/file-download/1e7cba15-9387-4872-b694-917e4546fc9c'
        }
      ]
    })
  })
})
