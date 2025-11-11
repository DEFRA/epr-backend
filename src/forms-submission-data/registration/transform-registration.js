import {
  extractAgencyFromDefinitionName,
  extractAnswers,
  extractTimestamp,
  flattenAnswersByShortDesc,
  retrieveFileUploadDetails
} from '#formsubmission/parsing-common/parse-forms-data.js'
import { FORM_PAGES } from '#formsubmission/parsing-common/form-field-constants.js'
import { parseUkAddress } from '#formsubmission/parsing-common/parse-address.js'
import {
  mapMaterial,
  mapRecyclingProcess
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations.js'
import { getWasteManagementPermits } from '#formsubmission/registration/extract-permits.js'
import { getSiteDetails } from '#formsubmission/registration/extract-site.js'
import {
  getSubmitterDetails,
  getApprovedPersons
} from '#formsubmission/registration/extract-contacts.js'

function getWasteProcessingType(answersByShortDescription) {
  return answersByShortDescription[
    FORM_PAGES.REGISTRATION.SITE_DETAILS.fields.SITE_ADDRESS
  ]?.trim()
    ? WASTE_PROCESSING_TYPE.REPROCESSOR
    : WASTE_PROCESSING_TYPE.EXPORTER
}

function getNoticeAddress(answersByShortDescription) {
  const noticeAddress =
    answersByShortDescription[
      FORM_PAGES.REGISTRATION.SITE_DETAILS.fields.NOTICE_ADDRESS
    ]

  return noticeAddress ? parseUkAddress(noticeAddress) : undefined
}

function getExportPorts(answersByShortDescription) {
  const exportPorts =
    answersByShortDescription[FORM_PAGES.REGISTRATION.EXPORT_PORTS]

  if (!exportPorts) {
    return undefined
  }

  return exportPorts
    .split(/\r?\n/)
    .map((port) => port.trim())
    .filter((port) => port.length > 0)
}

export async function parseRegistrationSubmission(id, rawSubmissionData) {
  const answersByPages = extractAnswers(rawSubmissionData)
  const answersByShortDescription = flattenAnswersByShortDesc(answersByPages)
  const wasteProcessingType = getWasteProcessingType(answersByShortDescription)
  return {
    id,
    formSubmissionTime: extractTimestamp(rawSubmissionData),
    submittedToRegulator: extractAgencyFromDefinitionName(rawSubmissionData),
    orgName:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.ORGANISATION_DETAILS.fields.ORG_NAME
      ],
    submitterContactDetails: getSubmitterDetails(answersByShortDescription),
    site: getSiteDetails(answersByShortDescription, answersByPages),
    noticeAddress: getNoticeAddress(answersByShortDescription),
    wasteRegistrationNumber:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.WASTE_REGISTRATION_NUMBER
      ],
    material: mapMaterial(
      answersByShortDescription[FORM_PAGES.REGISTRATION.MATERIAL_REGISTERED]
    ),
    recyclingType: mapRecyclingProcess(
      answersByShortDescription[FORM_PAGES.REGISTRATION.GLASS_RECYCLING_PROCESS]
    ),
    suppliers: answersByShortDescription[FORM_PAGES.REGISTRATION.SUPPLIERS],
    exportPorts: getExportPorts(answersByShortDescription),
    plantEquipmentDetails:
      answersByShortDescription[FORM_PAGES.REGISTRATION.PLANT_EQUIMENT_DETAILS],
    wasteProcessingType,
    wasteManagementPermits: getWasteManagementPermits(
      rawSubmissionData,
      answersByPages
    ),
    approvedPersons: getApprovedPersons(answersByShortDescription),
    samplingInspectionPlanFileUploads: retrieveFileUploadDetails(
      rawSubmissionData,
      FORM_PAGES.REGISTRATION.SIP_FILE_UPLOAD
    ),
    orsFileUploads:
      wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
        ? retrieveFileUploadDetails(
            rawSubmissionData,
            FORM_PAGES.REGISTRATION.ORS_FILE_UPLOAD
          )
        : undefined
  }
}
