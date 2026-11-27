import {
  extractAgencyFromDefinitionName,
  extractAnswers,
  extractTimestamp,
  extractWasteProcessingType,
  flattenAnswersByShortDesc,
  retrieveFileUploadDetails
} from '#forms-submission-data/parsing-common/parse-forms-data.js'
import { REGISTRATION } from './form-field-constants.js'
import { parseUkAddress } from '#forms-submission-data/parsing-common/parse-address.js'
import {
  mapMaterial,
  mapGlassRecyclingProcess,
  convertToNumber,
  normalizeObjectId
} from '#forms-submission-data/parsing-common/form-data-mapper.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { getWasteManagementPermits } from '#forms-submission-data/registration/extract-permits.js'
import { getSiteDetails } from '#forms-submission-data/registration/extract-site.js'
import {
  getSubmitterDetails,
  getApprovedPersons,
  getApplicationContactDetails
} from '#forms-submission-data/registration/extract-contacts.js'
import { getYearlyMetrics } from '#forms-submission-data/registration/extract-yearly-metrics.js'
import { applyRegistrationOverrides } from '#forms-submission-data/overrides/override.js'
import { splitGlassSubmissions } from '#forms-submission-data/parsing-common/split-glass-submissions.js'

function getNoticeAddress(answersByShortDescription) {
  const noticeAddress =
    answersByShortDescription[REGISTRATION.SITE_DETAILS.fields.NOTICE_ADDRESS]

  return noticeAddress ? parseUkAddress(noticeAddress) : undefined
}

function getExportPorts(answersByShortDescription) {
  const exportPorts = answersByShortDescription[REGISTRATION.EXPORT_PORTS]

  return exportPorts
    .split(/\r?\n/)
    .map((port) => port.trim())
    .filter((port) => port.length > 0)
}

function buildParsedRegistration(id, rawSubmissionData) {
  const answersByPages = extractAnswers(rawSubmissionData)
  const answersByShortDescription = flattenAnswersByShortDesc(answersByPages)
  const wasteProcessingType = extractWasteProcessingType(rawSubmissionData)
  const isReprocessor =
    wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
  const isExporter = !isReprocessor

  return {
    id,
    formSubmission: { id, time: extractTimestamp(rawSubmissionData) },
    submittedToRegulator: extractAgencyFromDefinitionName(rawSubmissionData),
    orgId: convertToNumber(
      answersByShortDescription[
        REGISTRATION.ORGANISATION_DETAILS.fields.ORGANISATION_ID
      ],
      'orgId'
    ),
    systemReference: normalizeObjectId(
      answersByShortDescription[
        REGISTRATION.ORGANISATION_DETAILS.fields.SYSTEM_REFERENCE
      ]
    ),
    orgName:
      answersByShortDescription[
        REGISTRATION.ORGANISATION_DETAILS.fields.ORG_NAME
      ],
    submitterContactDetails: getSubmitterDetails(answersByShortDescription),
    applicationContactDetails: getApplicationContactDetails(
      answersByShortDescription
    ),
    site: isReprocessor
      ? getSiteDetails(answersByShortDescription, answersByPages)
      : undefined,
    noticeAddress: getNoticeAddress(answersByShortDescription),
    cbduNumber:
      answersByShortDescription[REGISTRATION.WASTE_REGISTRATION_NUMBER],
    material: mapMaterial(
      answersByShortDescription[REGISTRATION.MATERIAL_REGISTERED]
    ),
    glassRecyclingProcess: mapGlassRecyclingProcess(
      answersByShortDescription[REGISTRATION.GLASS_RECYCLING_PROCESS]
    ),
    suppliers: answersByShortDescription[REGISTRATION.SUPPLIERS],
    exportPorts: isExporter
      ? getExportPorts(answersByShortDescription)
      : undefined,
    plantEquipmentDetails: isReprocessor
      ? answersByShortDescription[REGISTRATION.PLANT_EQUIPMENT_DETAILS]
      : undefined,
    wasteProcessingType,
    wasteManagementPermits: getWasteManagementPermits(
      wasteProcessingType,
      rawSubmissionData,
      answersByPages
    ),
    approvedPersons: getApprovedPersons(answersByShortDescription),
    samplingInspectionPlanPart1FileUploads: retrieveFileUploadDetails(
      rawSubmissionData,
      REGISTRATION.SIP_FILE_UPLOAD
    ),
    orsFileUploads: isExporter
      ? retrieveFileUploadDetails(
          rawSubmissionData,
          REGISTRATION.ORS_FILE_UPLOAD
        )
      : undefined,
    yearlyMetrics: getYearlyMetrics(
      wasteProcessingType,
      rawSubmissionData,
      answersByPages
    )
  }
}

export function parseRegistrationSubmission(id, rawSubmissionData) {
  const parsed = buildParsedRegistration(id, rawSubmissionData)
  const registration = applyRegistrationOverrides(parsed)
  return splitGlassSubmissions([registration], 'registration')
}
