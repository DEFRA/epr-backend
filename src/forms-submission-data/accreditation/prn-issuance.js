import {
  convertToNumber,
  mapTonnageBand
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { FORM_PAGES } from '#formsubmission/parsing-common/form-field-constants.js'
import { extractRepeaters } from '#formsubmission/parsing-common/parse-forms-data.js'

const INCOME_BUSINESS_PLAN_CONFIG = [
  {
    percentIncomeSpentExporter:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_PERCENTAGE_EXPORTER
        .fields.PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_PERCENTAGE_REPROCESSOR
        .fields.PERCENT_SPENT,
    usageDescription:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_PERCENTAGE_EXPORTER
        .title,
    detailedExplanation:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_DETAILS.fields.DETAILS
  },
  {
    percentIncomeSpentExporter:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_PRICE_SUPPORT_PERCENTAGE_EXPORTER
        .fields.PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_PRICE_SUPPORT_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_PRICE_SUPPORT_PERCENTAGE_EXPORTER
        .title,
    detailedExplanation:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_PRICE_SUPPORT_DETAILS.fields
        .DETAILS
  },
  {
    percentIncomeSpentExporter:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_BUSINESS_COLLECTIONS_PERCENTAGE_EXPORTER.fields
        .PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_BUSINESS_COLLECTIONS_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_BUSINESS_COLLECTIONS_PERCENTAGE_EXPORTER.title,
    detailedExplanation:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_BUSINESS_COLLECTIONS_DETAILS.fields
        .DETAILS
  },
  {
    percentIncomeSpentExporter:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_COMMUNICATIONS_PERCENTAGE_EXPORTER
        .fields.PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_COMMUNICATIONS_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_COMMUNICATIONS_PERCENTAGE_EXPORTER
        .title,
    detailedExplanation:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_COMMUNICATIONS_DETAILS.fields
        .DETAILS
  },
  {
    percentIncomeSpentExporter:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_PERCENTAGE_EXPORTER.fields
        .PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_PERCENTAGE_EXPORTER.title,
    detailedExplanation:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_DETAILS
        .fields.DETAILS
  },
  {
    percentIncomeSpentExporter:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_PERCENTAGE_EXPORTER.fields
        .PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_PERCENTAGE_EXPORTER.title,
    detailedExplanation:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_DETAILS
        .fields.DETAILS
  },
  {
    percentIncomeSpentExporter:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_OTHER_ACTIVITIES_PERCENTAGE_EXPORTER.fields
        .PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_OTHER_ACTIVITIES_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      FORM_PAGES.ACCREDITATION
        .BUSINESS_PLAN_OTHER_ACTIVITIES_PERCENTAGE_EXPORTER.title,
    detailedExplanation:
      FORM_PAGES.ACCREDITATION.BUSINESS_PLAN_OTHER_ACTIVITIES_DETAILS.fields
        .DETAILS
  }
]
function getIncomeBusinessPlan(answersByShortDescription) {
  return INCOME_BUSINESS_PLAN_CONFIG.map((config) => {
    // Try exporter field name first, then reprocessor field name
    const percentValue =
      answersByShortDescription[config.percentIncomeSpentExporter] ??
      answersByShortDescription[config.percentIncomeSpentReprocessor]

    return {
      percentIncomeSpent: convertToNumber(percentValue),
      usageDescription: config.usageDescription,
      detailedExplanation: answersByShortDescription[config.detailedExplanation]
    }
  })
}

function getSignatories(rawSubmissionData) {
  return [
    ...extractRepeaters(
      rawSubmissionData,
      FORM_PAGES.ACCREDITATION.PRN_SIGNATORY.title,
      {
        [FORM_PAGES.ACCREDITATION.PRN_SIGNATORY.fields.NAME]: 'fullName',
        [FORM_PAGES.ACCREDITATION.PRN_SIGNATORY.fields.EMAIL]: 'email',
        [FORM_PAGES.ACCREDITATION.PRN_SIGNATORY.fields.PHONE]: 'phone',
        [FORM_PAGES.ACCREDITATION.PRN_SIGNATORY.fields.JOB_TITLE]: 'title'
      }
    ),
    ...extractRepeaters(
      rawSubmissionData,
      FORM_PAGES.ACCREDITATION.PERN_SIGNATORY.title,
      {
        [FORM_PAGES.ACCREDITATION.PERN_SIGNATORY.fields.NAME]: 'fullName',
        [FORM_PAGES.ACCREDITATION.PERN_SIGNATORY.fields.EMAIL]: 'email',
        [FORM_PAGES.ACCREDITATION.PERN_SIGNATORY.fields.PHONE]: 'phone',
        [FORM_PAGES.ACCREDITATION.PERN_SIGNATORY.fields.JOB_TITLE]: 'title'
      }
    )
  ]
}

export function getPrnIssuance(answersByShortDescription, rawSubmissionData) {
  return {
    tonnageBand: mapTonnageBand(
      answersByShortDescription[
        FORM_PAGES.ACCREDITATION.PRN.fields.TONNAGE_BAND
      ]
    ),
    signatories: getSignatories(rawSubmissionData),
    incomeBusinessPlan: getIncomeBusinessPlan(answersByShortDescription)
  }
}
