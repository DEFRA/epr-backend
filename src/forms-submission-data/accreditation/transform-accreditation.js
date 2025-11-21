import {
  extractAgencyFromDefinitionName,
  extractAnswers,
  extractTimestamp,
  flattenAnswersByShortDesc,
  retrieveFileUploadDetails
} from '#formsubmission/parsing-common/parse-forms-data.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  convertToNumber,
  mapGlassRecyclingProcess,
  mapMaterial
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { FORM_PAGES } from '#formsubmission/parsing-common/form-field-constants.js'
import { getPrnIssuance } from '#formsubmission/accreditation/prn-issuance.js'

function getWasteProcessingType(answersByShortDescription) {
  return answersByShortDescription[
    FORM_PAGES.ACCREDITATION.SITE.fields.FIRST_LINE_ADDRESS
  ]?.trim()
    ? WASTE_PROCESSING_TYPE.REPROCESSOR
    : WASTE_PROCESSING_TYPE.EXPORTER
}

function getSubmitterDetails(answersByShortDescription) {
  return {
    fullName:
      answersByShortDescription[
        FORM_PAGES.ACCREDITATION.SUBMITTER_DETAILS.fields.NAME
      ],
    email:
      answersByShortDescription[
        FORM_PAGES.ACCREDITATION.SUBMITTER_DETAILS.fields.EMAIL
      ],
    phone:
      answersByShortDescription[
        FORM_PAGES.ACCREDITATION.SUBMITTER_DETAILS.fields.TELEPHONE_NUMBER
      ],
    title:
      answersByShortDescription[
        FORM_PAGES.ACCREDITATION.SUBMITTER_DETAILS.fields.JOB_TITLE
      ]
  }
}

function getSiteDetails(answersByShortDescription) {
  return {
    line1:
      answersByShortDescription[
        FORM_PAGES.ACCREDITATION.SITE.fields.FIRST_LINE_ADDRESS
      ],
    postcode:
      answersByShortDescription[FORM_PAGES.ACCREDITATION.SITE.fields.POSTCODE]
  }
}

export function parseAccreditationSubmission(id, rawSubmissionData) {
  const answersByPages = extractAnswers(rawSubmissionData)
  const answersByShortDescription = flattenAnswersByShortDesc(answersByPages)
  const wasteProcessingType = getWasteProcessingType(answersByShortDescription)
  const isReprocessor =
    wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
  const isExporter = !isReprocessor

  return {
    id,
    formSubmissionTime: extractTimestamp(rawSubmissionData),
    submittedToRegulator: extractAgencyFromDefinitionName(rawSubmissionData),
    wasteProcessingType,
    orgId: convertToNumber(
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.ORGANISATION_DETAILS.fields.ORGANISATION_ID
      ],
      'orgId'
    ),
    material: mapMaterial(
      answersByShortDescription[
        FORM_PAGES.ACCREDITATION.CATEGORY_TO_ACCREDIT.fields.MATERIAL
      ]
    ),
    glassRecyclingProcess: mapGlassRecyclingProcess(
      answersByShortDescription[FORM_PAGES.REGISTRATION.GLASS_RECYCLING_PROCESS]
    ),
    site: isReprocessor ? getSiteDetails(answersByShortDescription) : undefined,
    systemReference:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.ORGANISATION_DETAILS.fields.SYSTEM_REFERENCE
      ],
    orgName:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.ORGANISATION_DETAILS.fields.ORG_NAME
      ],
    prnIssuance: getPrnIssuance(answersByShortDescription, rawSubmissionData),
    submitterContactDetails: getSubmitterDetails(answersByShortDescription),
    samplingInspectionPlanPart2FileUploads: retrieveFileUploadDetails(
      rawSubmissionData,
      FORM_PAGES.ACCREDITATION.SIP_FILE_UPLOAD_PART_2
    ),
    orsFileUploads: isExporter
      ? retrieveFileUploadDetails(
          rawSubmissionData,
          FORM_PAGES.ACCREDITATION.ORS_FILE_UPLOAD
        )
      : undefined
  }
}
