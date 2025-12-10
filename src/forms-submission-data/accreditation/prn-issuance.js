import {
  convertToNumber,
  mapTonnageBand
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { ACCREDITATION } from './form-field-constants.js'
import { extractRepeaters } from '#formsubmission/parsing-common/parse-forms-data.js'

const INCOME_BUSINESS_PLAN_CONFIG = [
  {
    percentIncomeSpentExporter:
      ACCREDITATION
        .BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_PERCENTAGE_EXPORTER
        .fields.PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      ACCREDITATION
        .BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_PERCENTAGE_REPROCESSOR
        .fields.PERCENT_SPENT,
    usageDescription:
      ACCREDITATION
        .BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_PERCENTAGE_EXPORTER
        .title,
    detailedExplanation:
      ACCREDITATION.BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_DETAILS
        .fields.DETAILS
  },
  {
    percentIncomeSpentExporter:
      ACCREDITATION.BUSINESS_PLAN_PRICE_SUPPORT_PERCENTAGE_EXPORTER.fields
        .PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      ACCREDITATION.BUSINESS_PLAN_PRICE_SUPPORT_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      ACCREDITATION.BUSINESS_PLAN_PRICE_SUPPORT_PERCENTAGE_EXPORTER.title,
    detailedExplanation:
      ACCREDITATION.BUSINESS_PLAN_PRICE_SUPPORT_DETAILS.fields.DETAILS
  },
  {
    percentIncomeSpentExporter:
      ACCREDITATION.BUSINESS_PLAN_BUSINESS_COLLECTIONS_PERCENTAGE_EXPORTER
        .fields.PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      ACCREDITATION.BUSINESS_PLAN_BUSINESS_COLLECTIONS_PERCENTAGE_REPROCESSOR
        .fields.PERCENT_SPENT,
    usageDescription:
      ACCREDITATION.BUSINESS_PLAN_BUSINESS_COLLECTIONS_PERCENTAGE_EXPORTER
        .title,
    detailedExplanation:
      ACCREDITATION.BUSINESS_PLAN_BUSINESS_COLLECTIONS_DETAILS.fields.DETAILS
  },
  {
    percentIncomeSpentExporter:
      ACCREDITATION.BUSINESS_PLAN_COMMUNICATIONS_PERCENTAGE_EXPORTER.fields
        .PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      ACCREDITATION.BUSINESS_PLAN_COMMUNICATIONS_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      ACCREDITATION.BUSINESS_PLAN_COMMUNICATIONS_PERCENTAGE_EXPORTER.title,
    detailedExplanation:
      ACCREDITATION.BUSINESS_PLAN_COMMUNICATIONS_DETAILS.fields.DETAILS
  },
  {
    percentIncomeSpentExporter:
      ACCREDITATION.BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_PERCENTAGE_EXPORTER
        .fields.PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      ACCREDITATION.BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_PERCENTAGE_REPROCESSOR
        .fields.PERCENT_SPENT,
    usageDescription:
      ACCREDITATION.BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_PERCENTAGE_EXPORTER
        .title,
    detailedExplanation:
      ACCREDITATION.BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_DETAILS.fields.DETAILS
  },
  {
    percentIncomeSpentExporter:
      ACCREDITATION
        .BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_PERCENTAGE_EXPORTER.fields
        .PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      ACCREDITATION
        .BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      ACCREDITATION
        .BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_PERCENTAGE_EXPORTER.title,
    detailedExplanation:
      ACCREDITATION.BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_DETAILS.fields
        .DETAILS
  },
  {
    percentIncomeSpentExporter:
      ACCREDITATION.BUSINESS_PLAN_OTHER_ACTIVITIES_PERCENTAGE_EXPORTER.fields
        .PERCENT_SPENT,
    percentIncomeSpentReprocessor:
      ACCREDITATION.BUSINESS_PLAN_OTHER_ACTIVITIES_PERCENTAGE_REPROCESSOR.fields
        .PERCENT_SPENT,
    usageDescription:
      ACCREDITATION.BUSINESS_PLAN_OTHER_ACTIVITIES_PERCENTAGE_EXPORTER.title,
    detailedExplanation:
      ACCREDITATION.BUSINESS_PLAN_OTHER_ACTIVITIES_DETAILS.fields.DETAILS
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
    ...extractRepeaters(rawSubmissionData, ACCREDITATION.PRN_SIGNATORY.title, {
      [ACCREDITATION.PRN_SIGNATORY.fields.NAME]: 'fullName',
      [ACCREDITATION.PRN_SIGNATORY.fields.EMAIL]: 'email',
      [ACCREDITATION.PRN_SIGNATORY.fields.PHONE]: 'phone',
      [ACCREDITATION.PRN_SIGNATORY.fields.JOB_TITLE]: 'jobTitle'
    }),
    ...extractRepeaters(rawSubmissionData, ACCREDITATION.PERN_SIGNATORY.title, {
      [ACCREDITATION.PERN_SIGNATORY.fields.NAME]: 'fullName',
      [ACCREDITATION.PERN_SIGNATORY.fields.EMAIL]: 'email',
      [ACCREDITATION.PERN_SIGNATORY.fields.PHONE]: 'phone',
      [ACCREDITATION.PERN_SIGNATORY.fields.JOB_TITLE]: 'jobTitle'
    })
  ]
}

export function getPrnIssuance(answersByShortDescription, rawSubmissionData) {
  return {
    tonnageBand: mapTonnageBand(
      answersByShortDescription[ACCREDITATION.PRN.fields.TONNAGE_BAND]
    ),
    signatories: getSignatories(rawSubmissionData),
    incomeBusinessPlan: getIncomeBusinessPlan(answersByShortDescription)
  }
}
