import {
  extractAgencyFromDefinitionName,
  extractAnswers,
  extractRepeaters,
  extractTimestamp,
  findFirstValue,
  flattenAnswersByShortDesc
} from './parse-forms-data.js'
import { FORM_PAGES } from './form-field-constants.js'
import {
  mapBusinessType,
  mapNation,
  mapPartnershipType,
  mapPartnerType,
  mapWasteProcessingType
} from './form-data-mapper.js'
import { parseUkAddress } from './parse-address.js'

function extractWasteProcessingTypes(answersByShortDescription) {
  const value =
    answersByShortDescription?.[
      FORM_PAGES.ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES
    ]
  if (value === undefined || value === null) {
    throw new Error(
      `Waste processing type field "${FORM_PAGES.ORGANISATION.WASTE_PROCESSING_DETAILS.fields.TYPES}" not found`
    )
  }

  return mapWasteProcessingType(value)
}

function extractReprocessingNations(answersByShortDescription) {
  const value =
    answersByShortDescription[
      FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS
    ]

  if (!value) {
    return null
  }

  return value.split(',').map((v) => mapNation(v))
}

function getAddress(answersByShortDescription) {
  const orgAddress =
    answersByShortDescription[
      FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.ORGANISATION_ADDRESS
    ]
  if (orgAddress) {
    return parseUkAddress(orgAddress)
  } else {
    return {
      line1:
        answersByShortDescription[
          FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.ADDRESS_LINE_1
        ],
      line2:
        answersByShortDescription[
          FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.ADDRESS_LINE_2
        ],
      town: answersByShortDescription[
        FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.TOWN
      ],
      country:
        answersByShortDescription[
          FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.COUNTRY
        ],
      postcode:
        answersByShortDescription[
          FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.POST_CODE
        ],
      region:
        answersByShortDescription[
          FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.REGION
        ]
    }
  }
}

function getCompanyDetails(answersByShortDescription) {
  return {
    name: answersByShortDescription[
      FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.NAME
    ],
    tradingName:
      answersByShortDescription[
        FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.TRADING_NAME
      ],
    registrationNumber:
      answersByShortDescription[
        FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.REGISTRATION_NUMBER
      ],
    registeredAddress: parseUkAddress(
      answersByShortDescription[
        FORM_PAGES.ORGANISATION.COMPANY_DETAILS.fields.REGISTERED_ADDRESS
      ]
    ),
    address: getAddress(answersByShortDescription)
  }
}

function getSubmitterDetails(answersByShortDescription) {
  return {
    fullName:
      answersByShortDescription[
        FORM_PAGES.ORGANISATION.SUBMITTER_DETAILS.fields.NAME
      ],
    email:
      answersByShortDescription[
        FORM_PAGES.ORGANISATION.SUBMITTER_DETAILS.fields.EMAIL
      ],
    phone:
      answersByShortDescription[
        FORM_PAGES.ORGANISATION.SUBMITTER_DETAILS.fields.TELEPHONE_NUMBER
      ],
    title:
      answersByShortDescription[
        FORM_PAGES.ORGANISATION.SUBMITTER_DETAILS.fields.JOB_TITLE
      ]
  }
}

function getManagementContactDetails(answersByShortDescription) {
  const {
    fields,
    IS_SEPARATE_CONTACT_NON_UK,
    IS_SEPARATE_CONTACT_UNINCORP,
    IS_SEPARATE_CONTACT_SOLE_TRADER
  } = FORM_PAGES.ORGANISATION.MANAGEMENT_CONTACT_DETAILS

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
    answersByShortDescription[
      FORM_PAGES.ORGANISATION.PARTNERSHIP_DETAILS.PARTNERSHIP_TYPE
    ]
  )

  const generalPartners = extractRepeaters(
    rawSubmissionData,
    FORM_PAGES.ORGANISATION.PARTNERSHIP_DETAILS.title,
    {
      [FORM_PAGES.ORGANISATION.PARTNERSHIP_DETAILS.fields.PARTNER_NAME]: 'name',
      [FORM_PAGES.ORGANISATION.PARTNERSHIP_DETAILS.fields.TYPE_OF_PARTNER]:
        'type'
    }
  )

  const ltdPartnershipPage = FORM_PAGES.ORGANISATION.LTD_PARTNERSHIP_DETAILS

  const ltdPartners = extractRepeaters(
    rawSubmissionData,
    ltdPartnershipPage.title,
    {
      [FORM_PAGES.ORGANISATION.LTD_PARTNERSHIP_DETAILS.fields.PARTNER_NAMES]:
        'name',
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

export async function parseOrgSubmission(id, orgId, rawSubmissionData) {
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
      answersByShortDescription[
        FORM_PAGES.ORGANISATION.BUSINESS_TYPE.fields.TYPE
      ]
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
