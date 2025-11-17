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
  mapGlassRecyclingProcess,
  convertToNumber
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { getWasteManagementPermits } from '#formsubmission/registration/extract-permits.js'
import { getSiteDetails } from '#formsubmission/registration/extract-site.js'
import {
  getSubmitterDetails,
  getApprovedPersons
} from '#formsubmission/registration/extract-contacts.js'
import { getYearlyMetrics } from '#formsubmission/registration/extract-yearly-metrics.js'

/**
 * @param {Object} answersByShortDescription
 * @returns {import('#domain/organisations/model.js').WasteProcessingTypeValue}
 */
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

  return exportPorts
    .split(/\r?\n/)
    .map((port) => port.trim())
    .filter((port) => port.length > 0)
}

export function parseRegistrationSubmission(id, rawSubmissionData) {
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
    orgId: convertToNumber(
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.ORGANISATION_DETAILS.fields.ORGANISATION_ID
      ],
      'orgId'
    ),
    systemReference:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.ORGANISATION_DETAILS.fields.SYSTEM_REFERENCE
      ],
    orgName:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.ORGANISATION_DETAILS.fields.ORG_NAME
      ],
    submitterContactDetails: getSubmitterDetails(answersByShortDescription),
    site: isReprocessor
      ? getSiteDetails(answersByShortDescription, answersByPages)
      : undefined,
    noticeAddress: getNoticeAddress(answersByShortDescription),
    cbduNumber:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.WASTE_REGISTRATION_NUMBER
      ],
    material: mapMaterial(
      answersByShortDescription[FORM_PAGES.REGISTRATION.MATERIAL_REGISTERED]
    ),
    glassRecyclingProcess: mapGlassRecyclingProcess(
      answersByShortDescription[FORM_PAGES.REGISTRATION.GLASS_RECYCLING_PROCESS]
    ),
    suppliers: answersByShortDescription[FORM_PAGES.REGISTRATION.SUPPLIERS],
    exportPorts: isExporter
      ? getExportPorts(answersByShortDescription)
      : undefined,
    plantEquipmentDetails: isReprocessor
      ? answersByShortDescription[
          FORM_PAGES.REGISTRATION.PLANT_EQUIPMENT_DETAILS
        ]
      : undefined,
    wasteProcessingType,
    wasteManagementPermits: isReprocessor
      ? getWasteManagementPermits(rawSubmissionData, answersByPages)
      : undefined,
    approvedPersons: getApprovedPersons(answersByShortDescription),
    samplingInspectionPlanPart1FileUploads: retrieveFileUploadDetails(
      rawSubmissionData,
      FORM_PAGES.REGISTRATION.SIP_FILE_UPLOAD
    ),
    orsFileUploads: isExporter
      ? retrieveFileUploadDetails(
          rawSubmissionData,
          FORM_PAGES.REGISTRATION.ORS_FILE_UPLOAD
        )
      : undefined,
    yearlyMetrics: getYearlyMetrics(
      wasteProcessingType,
      rawSubmissionData,
      answersByPages
    )
  }
}
