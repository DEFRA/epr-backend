/**
 * Transforms organisation entities into public register row objects
 */

/** @import {AccreditationStatus, Organisation, RegistrationStatus} from '#domain/organisations/model.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {PublicRegisterRow} from './types.js' */
/** @import {ReportComplianceData} from '#reports/application/report-compliance.js' */

import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import {
  capitalize,
  formatAddress,
  formatTonnageBand,
  getAnnexIIProcess,
  uppercaseString
} from '#common/helpers/formatters.js'
import { formatMaterialCsvLabel } from '#domain/material-csv-labels.js'
import { formatDate } from '#common/helpers/date-formatter.js'
import chunk from 'lodash.chunk'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { config } from '#root/config.js'

// A registration's own status can never be suspended (suspension is an
// accreditation-only concept), so suspended is excluded here.
/** @type {Set<RegistrationStatus>} */
const REGISTRATION_INCLUDED_STATUSES = new Set([
  REGISTRATION_STATUS.APPROVED,
  REGISTRATION_STATUS.CANCELLED
])

// Cancelled and suspended accreditations remain on the public register (BR-E8).
/** @type {Set<AccreditationStatus>} */
const ACCREDITATION_INCLUDED_STATUSES = new Set([
  ACCREDITATION_STATUS.APPROVED,
  ACCREDITATION_STATUS.SUSPENDED,
  ACCREDITATION_STATUS.CANCELLED
])

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)
const BATCH_SIZE = Number(config.get('publicRegister.batchSize'))

function buildReportComplianceFields(periods, registrationReportSubmissions) {
  return Object.fromEntries(
    periods.map((period) => {
      if (!registrationReportSubmissions.submittedDates.has(period.key)) {
        return [period.label, 'N/A']
      }
      const date = registrationReportSubmissions.submittedDates.get(period.key)
      return [period.label, date ? formatDate(date) : '']
    })
  )
}

/**
 * @param {Organisation} org
 * @param {*} registration
 * @param {*} accreditation
 * @param {Record<string, string>} reportComplianceFields

 * @returns {PublicRegisterRow}
 */
function transformRegAcc(
  org,
  registration,
  accreditation,
  reportComplianceFields
) {
  return {
    type: capitalize(registration.wasteProcessingType),
    businessName: org.companyDetails.name,
    companiesHouseNumber: org.companyDetails?.companiesHouseNumber || '',
    orgId: org.orgId,
    registeredOffice: formatAddress(
      org.companyDetails.registeredAddress || org.companyDetails.address
    ),
    appropriateAgency: uppercaseString(registration.submittedToRegulator),
    registrationNumber: registration.registrationNumber,
    tradingName: org.companyDetails.tradingName || '',
    reprocessingSite: formatAddress(registration.site?.address),
    packagingWasteCategory: formatMaterialCsvLabel(
      registration.material,
      registration.glassRecyclingProcess
    ),
    annexIIProcess: getAnnexIIProcess(registration.material),
    accreditationStatus: accreditation ? capitalize(accreditation.status) : '',
    accreditationNo: accreditation?.accreditationNumber || '',
    tonnageBand: formatTonnageBand(accreditation?.prnIssuance?.tonnageBand),
    activeDate: formatDate(accreditation?.validFrom),
    dateLastChanged: formatDate(getLastStatusUpdateDate(accreditation)),
    ...reportComplianceFields
  }
}

function getLastStatusUpdateDate(item) {
  const statusHistory = item?.statusHistory
  return statusHistory
    ? statusHistory[statusHistory.length - 1].updatedAt
    : null
}

/**
 * @param {Registration} registration
 * @param {Accreditation[]} accreditations
 * @returns {Accreditation | null}
 */
function getLinkedAccreditation(registration, accreditations) {
  if (!registration.accreditationId) {
    return null
  }
  return (
    accreditations.find(
      (acc) =>
        acc.id === registration.accreditationId &&
        isAccreditationInPublishableState(acc)
    ) ?? null
  )
}

/** @param {{ status: RegistrationStatus }} item */
function isRegistrationInPublishableState(item) {
  return REGISTRATION_INCLUDED_STATUSES.has(item.status)
}

/** @param {{ status: AccreditationStatus }} item */
function isAccreditationInPublishableState(item) {
  return ACCREDITATION_INCLUDED_STATUSES.has(item.status)
}

function isTestOrg(org) {
  return TEST_ORGANISATIONS.has(org.orgId)
}

/**
 * @param {Organisation[]} batch
 * @param {ReportComplianceData} reportComplianceData
 * @returns {PublicRegisterRow[]}
 */
function processBatch(batch, reportComplianceData) {
  const { periods, entries } = reportComplianceData
  return batch
    .filter((org) => !isTestOrg(org))
    .flatMap((org) =>
      org.registrations
        .filter(isRegistrationInPublishableState)
        .map((registration) => {
          const accreditation = getLinkedAccreditation(
            registration,
            org.accreditations
          )
          const entry = entries.get(registration.id)
          const reportComplianceFields = entry
            ? buildReportComplianceFields(periods, entry)
            : {}
          return transformRegAcc(
            org,
            registration,
            accreditation,
            reportComplianceFields
          )
        })
    )
}

/**
 * Transforms organisations into public register row objects
 * Processes in chunks to avoid blocking event loop
 * @param {Organisation[]} organisations - Array of organisation entities
 * @param {ReportComplianceData} reportComplianceData - Compliance data to populate period columns
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
