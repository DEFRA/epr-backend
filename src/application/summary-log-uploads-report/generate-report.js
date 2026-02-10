/** @import {SummaryLogUploadReportRow} from './types.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration, Accreditation} from '#repositories/organisations/port.js' */
/** @import {SummaryLogStats} from '#repositories/summary-logs/port.js' */

import {
  capitalize,
  formatAddress,
  formatMaterial,
  uppercaseString
} from '#common/helpers/formatters.js'
import { toISOString } from '#common/helpers/date-formatter.js'
import chunk from 'lodash.chunk'
import { config } from '#root/config.js'
import { logger } from '#common/helpers/logging/logger.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)
const BATCH_SIZE = Number(config.get('summaryLogReport.batchSize'))

/**
 * @param {string} organisationId - Organisation ID
 * @param {string} registrationId - Registration ID
 * @returns {string} Composite key in format "orgId:regId"
 */
function buildLookupKey(organisationId, registrationId) {
  return `${organisationId}:${registrationId}`
}

/**
 * @typedef {{
 *   appropriateAgency: string;
 *   type: string;
 *   businessName: string;
 *   orgId: number;
 *   registrationNumber: string;
 *   accreditationNo: string;
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

function getLinkedAccreditation(registration, accreditations) {
  return registration.accreditationId
    ? accreditations.find((acc) => acc.id === registration.accreditationId)
    : null
}

function isTestOrg(org) {
  return TEST_ORGANISATIONS.has(org.orgId)
}

/**
 * @param {Organisation[]} organisations
 * @returns {Map<string, FormattedRegistrationInfo>}
 */
function buildRegistrationLookup(organisations) {
  return new Map(
    organisations
      .filter((org) => !isTestOrg(org))
      .flatMap((org) =>
        org.registrations.map((registration) => {
          const accreditation = getLinkedAccreditation(
            registration,
            org.accreditations
          )
          return [
            buildLookupKey(org.id, registration.id),
            {
              appropriateAgency: uppercaseString(
                registration.submittedToRegulator
              ),
              type: capitalize(registration.wasteProcessingType),
              businessName: org.companyDetails.name,
              orgId: org.orgId,
              registrationNumber: registration.registrationNumber,
              accreditationNo: accreditation?.accreditationNumber || '',
              reprocessingSite: formatAddress(registration.site?.address),
              packagingWasteCategory: formatMaterial(
                registration.material,
                registration.glassRecyclingProcess
              )
            }
          ]
        })
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
      summaryLogStats.organisationId,
      summaryLogStats.registrationId
    )
    return registrationLookup.has(key)
      ? [transformRow(registrationLookup.get(key), summaryLogStats)]
      : []
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
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationRepo - Organisation repository
 * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepository} summaryLogsRepo - Summary logs repository
 * @returns {Promise<SummaryLogUploadReportRow[]>} Array of report row objects
 */
export async function generateSummaryLogUploadsReport(
  organisationRepo,
  summaryLogsRepo
) {
  logger.info({ message: 'Summary log uploads report generation started' })

  const summaryLogsStatsList =
    await summaryLogsRepo.findAllSummaryLogStatsByRegistrationId()
  logger.info({
    message: `Retrieved stats for ${summaryLogsStatsList.length} registrations from repository`
  })

  const organisationIds = [
    ...new Set(summaryLogsStatsList.map((stats) => stats.organisationId))
  ]
  logger.info({
    message: `Found ${organisationIds.length} organisations with summary log uploads`
  })

  const organisations = await organisationRepo.findByIds(organisationIds)
  logger.info({
    message: `Retrieved ${organisations.length} organisations from repository`
  })

  const registrationLookup = buildRegistrationLookup(organisations)
  const reportRows = await transform(summaryLogsStatsList, registrationLookup)
  logger.info({
    message: `Transformation complete: ${reportRows.length} rows generated`
  })

  return reportRows
}
