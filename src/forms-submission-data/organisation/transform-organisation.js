import {
  extractAgencyFromDefinitionName,
  extractAnswers,
  extractRepeaters,
  extractTimestamp,
  findFirstValue,
  flattenAnswersByShortDesc
} from '#formsubmission/parsing-common/parse-forms-data.js'
import { ORGANISATION } from './form-field-constants.js'
import {
  mapBusinessType,
  mapNation,
  mapPartnershipType,
  mapPartnerType,
  mapWasteProcessingType
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { parseUkAddress } from '#formsubmission/parsing-common/parse-address.js'

function extractWasteProcessingTypes(answersByShortDescription) {
  const value =
    answersByShortDescription?.[
      ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES
    ]
  if (value === undefined || value === null) {
    throw new Error(
      `Waste processing type field "${ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES}" not found`
    )
  }

  return mapWasteProcessingType(value)
}

function extractReprocessingNations(answersByShortDescription) {
  const value =
    answersByShortDescription[ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS]

  if (!value) {
    return []
  }

  return value.split(',').map((v) => mapNation(v))
}

function getAddress(answersByShortDescription) {
  const orgAddress =
    answersByShortDescription[
      ORGANISATION.COMPANY_DETAILS.fields.ORGANISATION_ADDRESS
    ]
  if (orgAddress) {
    return parseUkAddress(orgAddress)
  } else {
    const address = {
      line1:
        answersByShortDescription[
          ORGANISATION.COMPANY_DETAILS.fields.ADDRESS_LINE_1
        ],
      line2:
        answersByShortDescription[
          ORGANISATION.COMPANY_DETAILS.fields.ADDRESS_LINE_2
        ],
      town: answersByShortDescription[ORGANISATION.COMPANY_DETAILS.fields.TOWN],
      country:
        answersByShortDescription[ORGANISATION.COMPANY_DETAILS.fields.COUNTRY],
      postcode:
        answersByShortDescription[
          ORGANISATION.COMPANY_DETAILS.fields.POST_CODE
        ],
      region:
        answersByShortDescription[ORGANISATION.COMPANY_DETAILS.fields.REGION]
    }

    const hasAnyValue = Object.values(address).some(
      (value) => value !== undefined
    )
    return hasAnyValue ? address : undefined
  }
}

function getCompanyDetails(answersByShortDescription) {
  return {
    name: answersByShortDescription[ORGANISATION.COMPANY_DETAILS.fields.NAME],
    tradingName:
      answersByShortDescription[
        ORGANISATION.COMPANY_DETAILS.fields.TRADING_NAME
      ],
    registrationNumber:
      answersByShortDescription[
        ORGANISATION.COMPANY_DETAILS.fields.REGISTRATION_NUMBER
      ],
    registeredAddress: parseUkAddress(
      answersByShortDescription[
        ORGANISATION.COMPANY_DETAILS.fields.REGISTERED_ADDRESS
      ]
    ),
    address: getAddress(answersByShortDescription)
  }
}

function getSubmitterDetails(answersByShortDescription) {
  return {
    fullName:
      answersByShortDescription[ORGANISATION.SUBMITTER_DETAILS.fields.NAME],
    email:
      answersByShortDescription[ORGANISATION.SUBMITTER_DETAILS.fields.EMAIL],
    phone:
      answersByShortDescription[
        ORGANISATION.SUBMITTER_DETAILS.fields.TELEPHONE_NUMBER
      ],
    title:
      answersByShortDescription[ORGANISATION.SUBMITTER_DETAILS.fields.JOB_TITLE]
  }
}

function getManagementContactDetails(answersByShortDescription) {
  const {
    fields,
    IS_SEPARATE_CONTACT_NON_UK,
    IS_SEPARATE_CONTACT_UNINCORP,
    IS_SEPARATE_CONTACT_SOLE_TRADER
  } = ORGANISATION.MANAGEMENT_CONTACT_DETAILS

  const submitterControlOrg = findFirstValue(answersByShortDescription, [
    IS_SEPARATE_CONTACT_NON_UK,
    IS_SEPARATE_CONTACT_UNINCORP,
    IS_SEPARATE_CONTACT_SOLE_TRADER
  ])

  return submitterControlOrg === 'false'
    ? {
        fullName: findFirstValue(answersByShortDescription, [
          fields.NON_UK_NAME,
          fields.UNINCORP_NAME,
          fields.SOLE_TRADER_NAME
        ]),
        email: findFirstValue(answersByShortDescription, [
          fields.NON_UK_EMAIL,
          fields.UNINCORP_EMAIL,
          fields.SOLE_TRADER_EMAIL
        ]),
        phone: findFirstValue(answersByShortDescription, [
          fields.NON_UK_PHONE,
          fields.UNINCORP_PHONE,
          fields.SOLE_TRADER_PHONE
        ]),
        title: findFirstValue(answersByShortDescription, [
          fields.NON_UK_JOB_TITLE,
          fields.UNINCORP_JOB_TITLE,
          fields.SOLE_TRADER_JOB_TITLE
        ])
      }
    : undefined
}

function getPartnershipDetails(answersByShortDescription, rawSubmissionData) {
  const partnerShipType = mapPartnershipType(
    answersByShortDescription[ORGANISATION.PARTNERSHIP_DETAILS.PARTNERSHIP_TYPE]
  )

  const generalPartners = extractRepeaters(
    rawSubmissionData,
    ORGANISATION.PARTNERSHIP_DETAILS.title,
    {
      [ORGANISATION.PARTNERSHIP_DETAILS.fields.PARTNER_NAME]: 'name',
      [ORGANISATION.PARTNERSHIP_DETAILS.fields.TYPE_OF_PARTNER]: 'type'
    }
  )

  const ltdPartnershipPage = ORGANISATION.LTD_PARTNERSHIP_DETAILS

  const ltdPartners = extractRepeaters(
    rawSubmissionData,
    ltdPartnershipPage.title,
    {
      [ORGANISATION.LTD_PARTNERSHIP_DETAILS.fields.PARTNER_NAMES]: 'name',
      [ltdPartnershipPage.fields.PARTNER_TYPE]: 'type'
    }
  )

  const allPartners = [...ltdPartners, ...generalPartners].map((partner) => ({
    ...partner,
    type: mapPartnerType(partner.type)
  }))

  return allPartners.length === 0 && !partnerShipType
    ? undefined
    : {
        type: partnerShipType,
        partners: allPartners
      }
}

export function parseOrgSubmission(id, orgId, rawSubmissionData) {
  const answersByPages = extractAnswers(rawSubmissionData)
  const answersByShortDescription = flattenAnswersByShortDesc(answersByPages)
  return {
    id,
    orgId,
    wasteProcessingTypes: extractWasteProcessingTypes(
      answersByShortDescription
    ),
    reprocessingNations: extractReprocessingNations(answersByShortDescription),
    businessType: mapBusinessType(
      answersByShortDescription[ORGANISATION.BUSINESS_TYPE.fields.TYPE]
    ),
    companyDetails: getCompanyDetails(answersByShortDescription),
    submitterContactDetails: getSubmitterDetails(answersByShortDescription),
    managementContactDetails: getManagementContactDetails(
      answersByShortDescription
    ),
    formSubmissionTime: extractTimestamp(rawSubmissionData),
    submittedToRegulator: extractAgencyFromDefinitionName(rawSubmissionData),
    partnership: getPartnershipDetails(
      answersByShortDescription,
      rawSubmissionData
    )
  }
}
