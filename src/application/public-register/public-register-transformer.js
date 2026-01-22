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

const INCLUDED_STATUSES = new Set([
  REG_ACC_STATUS.APPROVED,
  REG_ACC_STATUS.SUSPENDED,
  REG_ACC_STATUS.CANCELLED
])

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
    tonnageBand: accreditation
      ? formatTonnageBand(accreditation.prnIssuance?.tonnageBand)
      : '',
    activeDate: accreditation?.validFrom
      ? formatDate(accreditation.validFrom)
      : '',
    dateLastChanged: accreditation
      ? formatDate(
          accreditation.statusHistory[accreditation.statusHistory.length - 1]
            .updatedAt
        )
      : ''
  }
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

/**
 * Transforms organisations into public register row objects
 * @param {Organisation[]} organisations - Array of organisation entities
 * @returns {PublicRegisterRow[]} - Array of row objects ready for CSV export
 */
export function transform(organisations) {
  return organisations.flatMap((org) =>
    org.registrations.filter(isInPublishableState).map((registration) => {
      const accreditation = getLinkedAccreditation(
        registration,
        org.accreditations
      )
      return transformRegAcc(org, registration, accreditation)
    })
  )
}
