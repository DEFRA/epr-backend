/** @import {SummaryLogUploadReportRow} from './types.js' */
/** @import {Organisation, Registration} from '#organisation-read-model/domain/model.js' */
/** @import {SummaryLogStats} from '#repositories/summary-logs/port.js' */
/** @import {OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */

import {
  capitalize,
  formatAddress,
  formatResolvedMaterial,
  uppercaseString
} from '#common/helpers/formatters.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { toISOString } from '#common/helpers/date-formatter.js'
import { currentUtcYear } from '#common/helpers/dates/year.js'
import chunk from 'lodash.chunk'
import { config } from '#root/config.js'
import { logger } from '#common/helpers/logging/logger.js'
import { isTestOrganisation } from '#common/helpers/parse-test-organisations.js'

const BATCH_SIZE = Number(config.get('summaryLogReport.batchSize'))

/**
 * @param {OrganisationNumber} organisationNumber
 * @param {RegistrationNumber} registrationNumber
 * @returns {string}
 */
function buildLookupKey(organisationNumber, registrationNumber) {
  return `${organisationNumber}:${registrationNumber}`
}

/**
 * @typedef {{
 *   appropriateAgency: string;
 *   type: string;
 *   businessName: string;
 *   organisationNumber: OrganisationNumber;
 *   registrationNumber: string;
 *   accreditationNumber: string;
 *   reprocessingSite: string;
 *   packagingWasteCategory: string;
 * }} FormattedRegistrationInfo
 */

/**
 * @param {FormattedRegistrationInfo} formattedInfo - Pre-formatted registration info
 * @param {SummaryLogStats} summaryLogStats - Summary log statistics
 * @returns {SummaryLogUploadReportRow}
 */
function transformRow(formattedInfo, summaryLogStats) {
  return {
    ...formattedInfo,
    lastSuccessfulUpload: toISOString(summaryLogStats.lastSuccessful),
    lastFailedUpload: toISOString(summaryLogStats.lastFailed),
    successfulUploads: summaryLogStats.successfulCount,
    failedUploads: summaryLogStats.failedCount
  }
}

/**
 * @param {Registration['accreditations']} accreditations
 * @returns {string}
 */
function accreditationNumberOf(accreditations) {
  return accreditations[currentUtcYear()]?.accreditationNumber ?? ''
}

/**
 * @param {Registration} registration
 * @returns {string}
 */
function reprocessingSiteOf(registration) {
  return registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? formatAddress(registration.site.address)
    : ''
}

/**
 * @param {Organisation[]} organisations
 * @returns {Map<string, FormattedRegistrationInfo>}
 */
function buildRegistrationLookup(organisations) {
  return new Map(
    organisations
      .filter((org) => !isTestOrganisation(org))
      .flatMap((org) =>
        Object.entries(org.registrations).map(
          ([registrationNumber, registration]) => [
            buildLookupKey(
              org.organisationNumber,
              toRegistrationNumber(registrationNumber)
            ),
            {
              appropriateAgency: uppercaseString(
                registration.submittedToRegulator.code
              ),
              type: capitalize(registration.wasteProcessingType),
              businessName: org.name,
              organisationNumber: org.organisationNumber,
              registrationNumber,
              accreditationNumber: accreditationNumberOf(
                registration.accreditations
              ),
              reprocessingSite: reprocessingSiteOf(registration),
              packagingWasteCategory: formatResolvedMaterial(
                registration.material
              )
            }
          ]
        )
      )
  )
}

/**
 * @param {SummaryLogStats[]} batch - Batch of summary log stats
 * @param {Map<string, FormattedRegistrationInfo>} registrationLookup - Registration lookup map with pre-formatted data
 * @returns {SummaryLogUploadReportRow[]}
 */
function processBatch(batch, registrationLookup) {
  return batch.flatMap((summaryLogStats) => {
    const key = buildLookupKey(
      summaryLogStats.organisationNumber,
      summaryLogStats.registrationNumber
    )
    const formattedInfo = registrationLookup.get(key)
    return formattedInfo ? [transformRow(formattedInfo, summaryLogStats)] : []
  })
}

/**
 * @param {SummaryLogStats[]} summaryLogsStatsList - Array of summary log stats (one per registration)
 * @param {Map<string, FormattedRegistrationInfo>} registrationLookup - Registration lookup map with pre-formatted data
 * @returns {Promise<SummaryLogUploadReportRow[]>} - Array of row objects ready for export
 */
async function transform(summaryLogsStatsList, registrationLookup) {
  const results = []

  for (const batch of chunk(summaryLogsStatsList, BATCH_SIZE)) {
    results.push(...processBatch(batch, registrationLookup))
    await new Promise((resolve) => setImmediate(resolve))
  }

  return results
}

/**
 * @param {import('#organisation-read-model/repository/port.js').OrganisationReadRepository} organisationReadRepository - Organisation read model
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} summaryLogsRepo - Summary logs repository
 * @returns {Promise<{summaryLogUploads: SummaryLogUploadReportRow[], generatedAt: string}>} Report data with generation timestamp
 */
export async function generateSummaryLogUploadsReport(
  organisationReadRepository,
  summaryLogsRepo
) {
  const generatedAt = new Date().toISOString()
  logger.info({ message: 'Summary log uploads report generation started' })

  const summaryLogsStatsList =
    await summaryLogsRepo.findAllSummaryLogStatsByRegistration()
  logger.info({
    message: `Retrieved stats for ${summaryLogsStatsList.length} registrations from repository`
  })

  const organisations = await organisationReadRepository.findAll()
  logger.info({
    message: `Retrieved ${organisations.length} organisations from the read model`
  })

  const registrationLookup = buildRegistrationLookup(organisations)
  const summaryLogUploads = await transform(
    summaryLogsStatsList,
    registrationLookup
  )
  logger.info({
    message: `Transformation complete: ${summaryLogUploads.length} rows generated`
  })

  return { summaryLogUploads, generatedAt }
}
