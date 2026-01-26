/**
 * Transforms organisation entities into public register row objects
 */

/** @import {Organisation} from '#repositories/organisations/port.js' */
/** @import {PublicRegisterRow} from './types.js' */

import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import {
  formatAddress,
  formatMaterial,
  getAnnexIIProcess,
  formatTonnageBand,
  capitalize
} from './formatters.js'
import { formatDate } from '#common/helpers/date-formatter.js'
import chunk from 'lodash.chunk'
import { config } from '#root/config.js'
import { publicRegisterConfig } from './config.js'

const INCLUDED_STATUSES = new Set([
  REG_ACC_STATUS.APPROVED,
  REG_ACC_STATUS.SUSPENDED,
  REG_ACC_STATUS.CANCELLED
])

const TEST_ORGANISATIONS = new Set(JSON.parse(config.get('testOrganisations')))
const BATCH_SIZE = publicRegisterConfig.batchSize

/**
 * @param {Organisation} org
 * @param {*} registration
 * @param {*} accreditation
 * @returns {PublicRegisterRow}
 */
function transformRegAcc(org, registration, accreditation) {
  return {
    type: capitalize(registration.wasteProcessingType),
    businessName: org.companyDetails.name,
    registeredOffice: formatAddress(
      org.companyDetails.registeredAddress || org.companyDetails.address
    ),
    appropriateAgency: org.submittedToRegulator,
    registrationNumber: registration.registrationNumber,
    tradingName: org.companyDetails.tradingName || '',
    reprocessingSite: formatAddress(registration.site?.address),
    packagingWasteCategory: formatMaterial(
      registration.material,
      registration.glassRecyclingProcess
    ),
    annexIIProcess: getAnnexIIProcess(registration.material),
    accreditationStatus: accreditation ? capitalize(accreditation.status) : '',
    accreditationNo: accreditation?.accreditationNumber || '',
    tonnageBand: formatTonnageBand(accreditation?.prnIssuance?.tonnageBand),
    activeDate: formatDate(accreditation?.validFrom),
    dateLastChanged: formatDate(getLastStatusUpdateDate(accreditation))
  }
}

function getLastStatusUpdateDate(item) {
  const statusHistory = item?.statusHistory
  return statusHistory
    ? statusHistory[statusHistory.length - 1].updatedAt
    : null
}

function getLinkedAccreditation(registration, accreditations) {
  return registration.accreditationId
    ? accreditations.find(
        (acc) =>
          acc.id === registration.accreditationId && isInPublishableState(acc)
      )
    : null
}

function isInPublishableState(item) {
  return INCLUDED_STATUSES.has(item.status)
}

function isTestOrg(org) {
  return TEST_ORGANISATIONS.has(org.orgId)
}

/**
 * @param {Organisation[]} batch
 * @returns {PublicRegisterRow[]}
 */
function processBatch(batch) {
  return batch
    .filter((org) => !isTestOrg(org))
    .flatMap((org) =>
      org.registrations.filter(isInPublishableState).map((registration) => {
        const accreditation = getLinkedAccreditation(
          registration,
          org.accreditations
        )
        return transformRegAcc(org, registration, accreditation)
      })
    )
}

/**
 * Transforms organisations into public register row objects
 * Processes in chunks to avoid blocking event loop
 * @param {Organisation[]} organisations - Array of organisation entities
 * @returns {Promise<PublicRegisterRow[]>} - Array of row objects ready for CSV export
 */
export async function transform(organisations) {
  const results = []

  for (const batch of chunk(organisations, BATCH_SIZE)) {
    results.push(...processBatch(batch))
    await new Promise((resolve) => setImmediate(resolve))
  }

  return results
}
