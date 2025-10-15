import {
  extractAnswers,
  flattenAnswersByShortDesc
} from './parse-forms-data.js'
import { CREATED } from '#domain/organisation.js'
import { FORM_PAGES } from './form-field-constants.js'
import { mapNation, mapWasteProcessingType } from './form-data-mapper.js'

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
    answersByShortDescription?.[
      FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS
    ]
  if (value === undefined || value === null) {
    throw new Error(
      `Reprocessing nations "${FORM_PAGES.ORGANISATION.REPROCESSING_NATIONS.fields.NATIONS}" not found`
    )
  }
  return value.split(',').map((v) => mapNation(v))
}

export function parseOrgSubmission(id, orgId, rawSubmissionData) {
  const answersByPages = extractAnswers(rawSubmissionData)
  const answersByShortDescription = flattenAnswersByShortDesc(answersByPages)
  return {
    _id: id,
    orgId: id,
    status: CREATED,
    wasteProcessingTypes: extractWasteProcessingTypes(
      answersByShortDescription
    ),
    reprocessingNations: extractReprocessingNations(answersByShortDescription)
  }
}
