import {
  extractAgencyFromDefinitionName,
  extractAnswers,
  extractTimestamp,
  extractWasteProcessingType,
  flattenAnswersByShortDesc,
  retrieveFileUploadDetails
} from '#formsubmission/parsing-common/parse-forms-data.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  convertToNumber,
  mapGlassRecyclingProcess,
  mapMaterial,
  normalizeObjectId
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { ACCREDITATION } from './form-field-constants.js'
import { getPrnIssuance } from '#formsubmission/accreditation/prn-issuance.js'

function getSubmitterDetails(answersByShortDescription) {
  return {
    fullName:
      answersByShortDescription[ACCREDITATION.SUBMITTER_DETAILS.fields.NAME],
    email:
      answersByShortDescription[ACCREDITATION.SUBMITTER_DETAILS.fields.EMAIL],
    phone:
      answersByShortDescription[
        ACCREDITATION.SUBMITTER_DETAILS.fields.TELEPHONE_NUMBER
      ],
    title:
      answersByShortDescription[
        ACCREDITATION.SUBMITTER_DETAILS.fields.JOB_TITLE
      ]
  }
}

function getSiteDetails(answersByShortDescription) {
  return {
    address: {
      line1:
        answersByShortDescription[ACCREDITATION.SITE.fields.FIRST_LINE_ADDRESS],
      postcode: answersByShortDescription[ACCREDITATION.SITE.fields.POSTCODE]
    }
  }
}

export function parseAccreditationSubmission(id, rawSubmissionData) {
  const answersByPages = extractAnswers(rawSubmissionData)
  const answersByShortDescription = flattenAnswersByShortDesc(answersByPages)
  const wasteProcessingType = extractWasteProcessingType(rawSubmissionData)
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
        ACCREDITATION.ORGANISATION_DETAILS.fields.ORGANISATION_ID
      ],
      'orgId'
    ),
    material: mapMaterial(
      answersByShortDescription[
        ACCREDITATION.CATEGORY_TO_ACCREDIT.fields.MATERIAL
      ]
    ),
    glassRecyclingProcess: mapGlassRecyclingProcess(
      answersByShortDescription[ACCREDITATION.GLASS_RECYCLING_PROCESS]
    ),
    site: isReprocessor ? getSiteDetails(answersByShortDescription) : undefined,
    systemReference: normalizeObjectId(
      answersByShortDescription[
        ACCREDITATION.ORGANISATION_DETAILS.fields.SYSTEM_REFERENCE
      ]
    ),
    orgName:
      answersByShortDescription[
        ACCREDITATION.ORGANISATION_DETAILS.fields.ORG_NAME
      ],
    prnIssuance: getPrnIssuance(answersByShortDescription, rawSubmissionData),
    submitterContactDetails: getSubmitterDetails(answersByShortDescription),
    samplingInspectionPlanPart2FileUploads: retrieveFileUploadDetails(
      rawSubmissionData,
      ACCREDITATION.SIP_FILE_UPLOAD_PART_2
    ),
    orsFileUploads: isExporter
      ? retrieveFileUploadDetails(
          rawSubmissionData,
          ACCREDITATION.ORS_FILE_UPLOAD
        )
      : undefined
  }
}
