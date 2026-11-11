/**
 * Transforms read-model organisations into public register row objects
 */

/** @import {AppliedForMaterial, Material, TonnageBand} from '#domain/organisations/model.js' */
/** @import {Organisation, Registration, StatusTimeline} from '#organisation-read-model/domain/model.js' */
/** @import {PublicRegisterRow} from './types.js' */
/** @import {ReportComplianceData, ReportComplianceEntry} from '#reports/application/report-compliance.js' */

import {
  ACCREDITATION_STATUS,
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  capitalize,
  formatAddress,
  formatResolvedMaterial,
  formatTonnageBand,
  getAnnexIIProcess,
  uppercaseString
} from '#common/helpers/formatters.js'
import { formatDate } from '#common/helpers/date-formatter.js'
import { currentUtcYear } from '#common/helpers/dates/year.js'
import { reportableRegistrations } from '#reports/application/reportable-registrations.js'
import chunk from 'lodash.chunk'
import { config } from '#root/config.js'

const BATCH_SIZE = Number(config.get('publicRegister.batchSize'))

/** @type {ReadonlySet<string>} */
const GLASS_RECYCLING_PROCESSES = new Set(
  Object.values(GLASS_RECYCLING_PROCESS)
)

/**
 * Annex II lists glass by the material applied for, whatever its process.
 *
 * @param {Material} material
 * @returns {AppliedForMaterial}
 */
const appliedForMaterial = (material) =>
  GLASS_RECYCLING_PROCESSES.has(material)
    ? MATERIAL.GLASS
    : /** @type {AppliedForMaterial} */ (material)

/**
 * A period missing from submittedDates has no reporting obligation, so is 'N/A'.
 */
function buildReportComplianceFields(periods, submittedDates) {
  return Object.fromEntries(
    periods.map((period) => {
      if (!submittedDates.has(period.key)) {
        return [period.label, 'N/A']
      }
      const date = submittedDates.get(period.key)
      return [period.label, date ? formatDate(date) : '']
    })
  )
}

/**
 * @param {StatusTimeline} timeline
 * @returns {string | undefined}
 */
const firstApprovedAt = (timeline) =>
  timeline.find(({ status }) => status === ACCREDITATION_STATUS.APPROVED)?.at

/**
 * @param {StatusTimeline} timeline
 * @returns {string | undefined}
 */
const lastRecordedAt = (timeline) =>
  timeline
    .map(({ updatedAt }) => updatedAt)
    .toSorted((one, other) => one.localeCompare(other))
    .at(-1)

/**
 * @param {Organisation} organisation
 * @param {string} registrationNumber
 * @param {Registration} registration
 * @param {Record<string, string>} reportComplianceFields
 * @returns {PublicRegisterRow}
 */
function transformRegAcc(
  organisation,
  registrationNumber,
  registration,
  reportComplianceFields
) {
  const accreditation = registration.accreditations[currentUtcYear()]
  const timeline = accreditation?.status.timeline ?? []
  return {
    type: capitalize(registration.wasteProcessingType),
    businessName: organisation.name,
    companiesHouseNumber: organisation.companiesHouseNumber ?? '',
    organisationNumber: organisation.organisationNumber,
    registeredOffice: formatAddress(
      organisation.registeredAddress ?? organisation.address
    ),
    appropriateAgency: uppercaseString(registration.submittedToRegulator.code),
    registrationNumber,
    tradingName: organisation.tradingName ?? '',
    reprocessingSite:
      registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
        ? formatAddress(registration.site.address)
        : '',
    packagingWasteCategory: formatResolvedMaterial(registration.material),
    annexIIProcess: getAnnexIIProcess(
      appliedForMaterial(registration.material)
    ),
    accreditationStatus: accreditation
      ? capitalize(accreditation.status.current)
      : '',
    accreditationNo: accreditation?.accreditationNumber ?? '',
    tonnageBand: formatTonnageBand(
      /** @type {TonnageBand} */ (accreditation?.prnIssuance.tonnageBand)
    ),
    activeDate: formatDate(firstApprovedAt(timeline)),
    dateLastChanged: formatDate(lastRecordedAt(timeline)),
    ...reportComplianceFields
  }
}

/**
 * @param {Organisation[]} batch
 * @param {ReportComplianceData} reportComplianceData
 * @returns {PublicRegisterRow[]}
 */
function processBatch(batch, { periods, entries }) {
  return reportableRegistrations(batch).map(
    ({ organisation, registrationNumber, registration, key }) =>
      transformRegAcc(
        organisation,
        registrationNumber,
        registration,
        buildReportComplianceFields(
          periods,
          /** @type {ReportComplianceEntry} */ (entries.get(key)).submittedDates
        )
      )
  )
}

/**
 * Transforms organisations into public register row objects
 * Processes in chunks to avoid blocking event loop
 * @param {Organisation[]} organisations - Organisations as the read model serves them
 * @param {ReportComplianceData} reportComplianceData - Compliance data for the same organisations, to populate period columns
 * @returns {Promise<PublicRegisterRow[]>} - Array of row objects ready for CSV export
 */
export async function transform(organisations, reportComplianceData) {
  const results = []

  for (const batch of chunk(organisations, BATCH_SIZE)) {
    results.push(...processBatch(batch, reportComplianceData))
    await new Promise((resolve) => setImmediate(resolve))
  }

  return results
}
