import { describe, expect, it } from 'vitest'
import { parseOrgSubmission } from './transform-organisation-data.js'
import {
  WASTE_PROCESSING_TYPE,
  PARTNERSHIP_TYPE,
  PARTNER_TYPE,
  BUSINESS_TYPE,
  NATION
} from '#domain/organisations.js'

import registeredLtdPartnership from '#data/fixtures/ea/organisation/registered-ltd-partnership.json'
import registeredLtdLiability from '#data/fixtures/ea/organisation/registered-ltd-liability.json'
import registeredNoPartnership from '#data/fixtures/ea/organisation/registered-no-partnership.json'
import nonRegisteredUkSoleTrader from '#data/fixtures/ea/organisation/non-registered-uk-sole-trader.json'
import nonRegisteredOutsideUk from '#data/fixtures/ea/organisation/non-registered-outside-uk-address.json'
import unincorporatedSeparateControl from '#data/fixtures/ea/organisation/unincorporated-separate-control.json'
import soleTraderSeparateControl from '#data/fixtures/ea/organisation/sole-trader-separate-contro.json'
import nonUkSeparateControl from '#data/fixtures/ea/organisation/non-uk-separate-control.json'

describe('parseOrgSubmission - Integration Tests with Fixture Data', () => {
  it('should parse registered limited partnership organisation from fixture', async () => {
    const result = await parseOrgSubmission(
      registeredLtdPartnership._id.$oid,
      registeredLtdPartnership.orgId,
      registeredLtdPartnership.rawSubmissionData
    )

    expect(result).toMatchObject({
      id: registeredLtdPartnership._id.$oid,
      orgId: registeredLtdPartnership.orgId,
      wasteProcessingTypes: [WASTE_PROCESSING_TYPE.EXPORTER],
      companyDetails: {
        name: 'Green Recycling Solutions Ltd',
        tradingName: 'Green',
        registrationNumber: '01234567',
        registeredAddress: {
          line1: 'Unit 15',
          postcode: 'M1 5JG',
          fullAddress: 'Unit 15, Innovation Park,Manchester,M1 5JG'
        }
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '020 7946 0123',
        title: 'Sustainability Director'
      },
      formSubmissionTime: new Date('2025-10-08T16:14:15.390Z'),
      submittedToRegulator: 'ea',
      partnership: {
        type: PARTNERSHIP_TYPE.LTD,
        partners: [
          {
            name: 'Victor',
            type: PARTNER_TYPE.COMPANY
          },
          {
            name: 'DHL Supply Chain UK Ltd',
            type: PARTNER_TYPE.COMPANY
          }
        ]
      }
    })
  })

  it('should parse registered limited liability partnership organisation from fixture', async () => {
    const result = await parseOrgSubmission(
      registeredLtdLiability._id.$oid,
      registeredLtdLiability.orgId,
      registeredLtdLiability.rawSubmissionData
    )

    expect(result).toMatchObject({
      id: registeredLtdLiability._id.$oid,
      orgId: registeredLtdLiability.orgId,
      wasteProcessingTypes: [
        WASTE_PROCESSING_TYPE.REPROCESSOR,
        WASTE_PROCESSING_TYPE.EXPORTER
      ],
      reprocessingNations: [NATION.ENGLAND, NATION.SCOTLAND],
      companyDetails: {
        name: 'Green Recycling Solutions Ltd',
        tradingName: 'Green',
        registrationNumber: 'AC012345',
        registeredAddress: {
          line1: 'Unit 15',
          postcode: 'M1 5JG',
          fullAddress:
            'Unit 15, Innovation Park,Technology Way,Manchester,Greater Manchester,M1 5JG',
          country: 'UK'
        }
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '0121 496 8574',
        title: 'Sustainability Director'
      },
      formSubmissionTime: new Date('2025-10-08T16:13:16.313Z'),
      submittedToRegulator: 'ea',
      partnership: {
        type: PARTNERSHIP_TYPE.LTD_LIABILITY
      }
    })
  })

  it('should parse registered organisation with no partnership from fixture', async () => {
    const result = await parseOrgSubmission(
      registeredNoPartnership._id.$oid,
      registeredNoPartnership.orgId,
      registeredNoPartnership.rawSubmissionData
    )

    expect(result).toMatchObject({
      id: registeredNoPartnership._id.$oid,
      orgId: registeredNoPartnership.orgId,
      wasteProcessingTypes: [
        WASTE_PROCESSING_TYPE.REPROCESSOR,
        WASTE_PROCESSING_TYPE.EXPORTER
      ],
      reprocessingNations: [
        NATION.ENGLAND,
        NATION.SCOTLAND,
        NATION.WALES,
        NATION.NORTHERN_IRELAND
      ],
      companyDetails: {
        name: 'Green Recycling Solutions Ltd',
        tradingName: '',
        registrationNumber: '11223344',
        registeredAddress: {
          line1: 'Unit 15',
          postcode: 'M1 5JG',
          fullAddress:
            'Unit 15, Innovation Park,Technology Way,Manchester,Greater Manchester,M1 5JG',
          country: 'UK'
        }
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '020 7946 0123',
        title: 'Director'
      },
      formSubmissionTime: new Date('2025-10-08T16:19:54.601Z'),
      submittedToRegulator: 'ea'
    })

    expect(result.partnership).toBeUndefined()
  })

  it('should parse non-registered UK sole trader organisation from fixture', async () => {
    const result = await parseOrgSubmission(
      nonRegisteredUkSoleTrader._id.$oid,
      nonRegisteredUkSoleTrader.orgId,
      nonRegisteredUkSoleTrader.rawSubmissionData
    )

    expect(result).toMatchObject({
      id: nonRegisteredUkSoleTrader._id.$oid,
      orgId: nonRegisteredUkSoleTrader.orgId,
      wasteProcessingTypes: [WASTE_PROCESSING_TYPE.REPROCESSOR],
      reprocessingNations: [NATION.ENGLAND, NATION.SCOTLAND],
      businessType: BUSINESS_TYPE.INDIVIDUAL,
      companyDetails: {
        name: 'British Beverage Distributors Ltd',
        tradingName: 'British Beverage Distributors Ltd',
        address: {
          line1: '45 High Street',
          town: 'Birmingham',
          postcode: 'B2 4AA'
        }
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '020 7946 0123',
        title: 'Sustainability Director'
      },

      formSubmissionTime: new Date('2025-10-08T16:25:35.824Z'),
      submittedToRegulator: 'ea'
    })

    expect(result.companyDetails.registrationNumber).toBeUndefined()
    expect(result.companyDetails.registeredAddress).toBeUndefined()
    expect(result.partnership).toBeUndefined()
  })

  it('should parse non-registered organisation with outside UK address from fixture', async () => {
    const result = await parseOrgSubmission(
      nonRegisteredOutsideUk._id.$oid,
      nonRegisteredOutsideUk.orgId,
      nonRegisteredOutsideUk.rawSubmissionData
    )

    expect(result).toMatchObject({
      id: nonRegisteredOutsideUk._id.$oid,
      orgId: nonRegisteredOutsideUk.orgId,
      wasteProcessingTypes: [
        WASTE_PROCESSING_TYPE.REPROCESSOR,
        WASTE_PROCESSING_TYPE.EXPORTER
      ],
      reprocessingNations: [NATION.WALES],
      companyDetails: {
        name: 'EuroPack GmbH',
        tradingName: 'EuroPack GmbH',
        address: {
          line1: '125 Avenue des Champs-Élysées',
          line2: '',
          town: 'Paris',
          country: 'France',
          region: 'Paris',
          postcode: '75008'
        }
      },
      submitterContactDetails: {
        fullName: 'Sarah Mitchell',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '020 7946 0123',
        title: 'Sustainability Director'
      },
      formSubmissionTime: new Date('2025-10-08T16:28:18.572Z'),
      submittedToRegulator: 'ea'
    })

    expect(result.companyDetails.registrationNumber).toBeUndefined()
    expect(result.companyDetails.registeredAddress).toBeUndefined()
    expect(result.partnership).toBeUndefined()
  })

  it('should parse unincorporated association with separate management contact from fixture', async () => {
    const result = await parseOrgSubmission(
      unincorporatedSeparateControl._id.$oid,
      unincorporatedSeparateControl.orgId,
      unincorporatedSeparateControl.rawSubmissionData
    )

    expect(result).toMatchObject({
      id: unincorporatedSeparateControl._id.$oid,
      orgId: unincorporatedSeparateControl.orgId,
      wasteProcessingTypes: [WASTE_PROCESSING_TYPE.EXPORTER],
      reprocessingNations: null,
      businessType: BUSINESS_TYPE.UNINCORPORATED,
      companyDetails: {
        name: 'What is the name of your business?',
        tradingName: 'British Beverage Distributors Ltd',
        address: {
          line1: '45 High Street',
          postcode: 'B2 4AA',
          fullAddress: '45 High Street,Birmingham,Birmingham,B2 4AA'
        }
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '020 7946 0123',
        title: 'Sustainability Director'
      },
      managementContactDetails: {
        fullName: 'Luke Skywalker',
        email: 'luke.skywalker@starwars.com',
        phone: '0123456789',
        title: 'Sustainability master'
      },
      formSubmissionTime: new Date('2025-10-23T13:35:37.874Z'),
      submittedToRegulator: 'ea'
    })

    expect(result.companyDetails.registrationNumber).toBeUndefined()
    expect(result.companyDetails.registeredAddress).toBeUndefined()
    expect(result.partnership).toBeUndefined()
  })

  it('should parse sole trader with separate management contact from fixture', async () => {
    const result = await parseOrgSubmission(
      soleTraderSeparateControl._id.$oid,
      soleTraderSeparateControl.orgId,
      soleTraderSeparateControl.rawSubmissionData
    )

    expect(result).toMatchObject({
      id: soleTraderSeparateControl._id.$oid,
      orgId: soleTraderSeparateControl.orgId,
      wasteProcessingTypes: [WASTE_PROCESSING_TYPE.EXPORTER],
      reprocessingNations: null,
      businessType: BUSINESS_TYPE.INDIVIDUAL,
      companyDetails: {
        name: 'British Beverage Distributors Ltd',
        tradingName: 'British Beverage Distributors Ltd',
        address: {
          line1: '45 High Street',
          postcode: 'B2 4AA'
        }
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '020 7946 0123',
        title: 'Director'
      },
      managementContactDetails: {
        fullName: 'Joe Hamiliton',
        email: 'joe.hamilton@gmail.com',
        phone: '0123456789',
        title: 'Director'
      },
      formSubmissionTime: new Date('2025-10-23T13:39:07.408Z'),
      submittedToRegulator: 'ea'
    })

    expect(result.companyDetails.registrationNumber).toBeUndefined()
    expect(result.companyDetails.registeredAddress).toBeUndefined()
    expect(result.partnership).toBeUndefined()
  })

  it('should parse non-UK organisation with separate management contact from fixture', async () => {
    const result = await parseOrgSubmission(
      nonUkSeparateControl._id.$oid,
      nonUkSeparateControl.orgId,
      nonUkSeparateControl.rawSubmissionData
    )

    expect(result).toMatchObject({
      id: nonUkSeparateControl._id.$oid,
      orgId: nonUkSeparateControl.orgId,
      wasteProcessingTypes: [WASTE_PROCESSING_TYPE.REPROCESSOR],
      reprocessingNations: [NATION.ENGLAND],
      companyDetails: {
        name: '01234567',
        tradingName: '',
        address: {
          line1: 'Address line 1',
          line2: '',
          town: 'Test',
          country: 'France',
          region: 'Paris',
          postcode: ''
        }
      },
      submitterContactDetails: {
        fullName: 'James Patterson',
        email: 'reexserviceteam@defra.gov.uk',
        phone: '020 7946 0123',
        title: 'Director'
      },
      managementContactDetails: {
        fullName: 'Luke',
        email: 'test@gmail.com',
        phone: '0123456789',
        title: 'Director'
      },
      formSubmissionTime: new Date('2025-10-23T13:42:35.918Z'),
      submittedToRegulator: 'ea'
    })

    expect(result.companyDetails.registrationNumber).toBeUndefined()
    expect(result.companyDetails.registeredAddress).toBeUndefined()
    expect(result.partnership).toBeUndefined()
  })
})

describe('parseOrgSubmission - Error Cases', () => {
  it('should throw error when waste processing type field is missing', async () => {
    const invalidSubmission = {
      ...registeredNoPartnership,
      answers: registeredNoPartnership.answers.filter(
        (answer) => answer.shortDescription !== 'Currently operational?'
      ),
      rawSubmissionData: {
        ...registeredNoPartnership.rawSubmissionData,
        data: {
          ...registeredNoPartnership.rawSubmissionData.data,
          main: Object.fromEntries(
            Object.entries(
              registeredNoPartnership.rawSubmissionData.data.main
            ).filter(([key]) => key !== 'WVADkQ')
          )
        }
      }
    }

    await expect(
      parseOrgSubmission(
        invalidSubmission._id.$oid,
        invalidSubmission.orgId,
        invalidSubmission.rawSubmissionData
      )
    ).rejects.toThrow(
      'Waste processing type field "Currently operational?" not found'
    )
  })
})
