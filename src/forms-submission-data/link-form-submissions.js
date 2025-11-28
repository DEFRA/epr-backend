import { logger } from '#common/helpers/logging/logger.js'
import { compareSite, siteInfoToLog } from './parsing-common/site.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

/**
 * @import {Organisation, OrganisationWithRegistrations} from './types.js'
 */

function getItemsBySystemReference(items) {
  return items.reduce((itemsMap, item) => {
    itemsMap.set(item.systemReference, [
      ...(itemsMap.get(item.systemReference) ?? []),
      item
    ])
    return itemsMap
  }, new Map())
}

function getOrganisationsById(organisations) {
  return organisations.reduce(
    (orgMap, org) => orgMap.set(org.id, org),
    new Map()
  )
}

function logOrganisationsWithoutItems(organisations, propertyName) {
  const orgsWithoutItems = organisations.filter(
    (org) => (org[propertyName] ?? []).length === 0
  )

  if (orgsWithoutItems.length > 0) {
    logger.info({
      message: `${orgsWithoutItems.length} organisations without ${propertyName}`
    })
    for (const org of orgsWithoutItems) {
      logger.info({
        message: `Organisation without any ${propertyName}: id=${org.id}`
      })
    }
  }
}

/**
 * Links child items to organisations by systemReference
 * @param {Array} organisations - Array of organisation objects
 * @param {Array} items - Array of items to link (registrations, accreditations, etc.)
 * @param {string} propertyName - Property name to set on organisation (e.g., 'registrations', 'accreditations')
 * @returns {Array} Array of organisations with linked items
 */
export function linkItemsToOrganisations(organisations, items, propertyName) {
  const itemsBySystemReference = getItemsBySystemReference(items)
  const organisationsById = getOrganisationsById(organisations)

  const unlinked = []
  for (const [systemReference, itemsPerOrg] of itemsBySystemReference) {
    const org = organisationsById.get(systemReference)
    if (org) {
      org[propertyName] = itemsPerOrg
    } else {
      unlinked.push(
        ...itemsPerOrg.map((item) => ({
          id: item.id,
          systemReference: item.systemReference,
          orgId: item.orgId
        }))
      )
    }
  }

  if (unlinked.length > 0) {
    logger.warn({
      message: `${unlinked.length} ${propertyName} not linked to an organisation`
    })
    for (const item of unlinked) {
      logger.warn({
        message: `${propertyName} not linked: id=${item.id}, systemReference=${item.systemReference}, orgId=${item.orgId}`
      })
    }
  }
  logOrganisationsWithoutItems(organisations, propertyName)

  return organisations
}

function isAccreditationForRegistration(accreditation, registration) {
  const typeAndMaterialMatch =
    registration.wasteProcessingType === accreditation.wasteProcessingType &&
    registration.material === accreditation.material

  if (!typeAndMaterialMatch) {
    return false
  }

  return registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? compareSite(registration.site, accreditation.site)
    : true
}

function linkAccreditationsForOrg(organisation) {
  const accreditations = organisation.accreditations ?? []
  const registrations = organisation.registrations ?? []

  const accToRegs = accreditations.map((acc) => ({
    acc,
    matchedRegistrations: registrations.filter((reg) =>
      isAccreditationForRegistration(acc, reg)
    )
  }))
  const regToAccs = registrations.map((reg) => ({
    reg,
    matchedAccreditations: accreditations.filter((acc) =>
      isAccreditationForRegistration(acc, reg)
    )
  }))

  // Link only 1:1 matches
  for (const { acc, matchedRegistrations } of accToRegs) {
    if (matchedRegistrations.length === 1) {
      const registrationsLinkingToAcc = regToAccs.find(
        (rm) => rm.reg.id === matchedRegistrations[0].id
      )
      if (registrationsLinkingToAcc.matchedAccreditations.length === 1) {
        matchedRegistrations[0].accreditationId = acc.id
      }
    }
  }

  logUnmatchedItems(organisation, accToRegs, regToAccs)
}

function formatAccreditationDetails(accreditation) {
  const siteInfo =
    accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
      ? `,${siteInfoToLog(accreditation.site)}`
      : ''
  return `id=${accreditation.id},type=${accreditation.wasteProcessingType},material=${accreditation.material}${siteInfo}`
}

function formatRegistrationDetails(registration) {
  const siteInfo =
    registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
      ? `,${siteInfoToLog(registration.site)}`
      : ''
  return `id=${registration.id},type=${registration.wasteProcessingType},material=${registration.material}${siteInfo}`
}

function logUnmatchedItems(organisation, accToRegs, regToAccs) {
  const unmatchedAccs = accToRegs.filter(
    (am) => am.matchedRegistrations.length === 0
  )
  const multiMatchAccs = accToRegs.filter(
    (am) => am.matchedRegistrations.length > 1
  )

  if (unmatchedAccs.length === 0 && multiMatchAccs.length === 0) {
    return
  }

  const unmatchedRegs = regToAccs.filter(
    (rm) => rm.matchedAccreditations.length === 0
  )
  const multiMatchRegs = regToAccs.filter(
    (rm) => rm.matchedAccreditations.length > 1
  )

  const totalUnlinkedAccs = unmatchedAccs.length + multiMatchAccs.length

  const allAccDetails = [...unmatchedAccs, ...multiMatchAccs]
    .map((item) => formatAccreditationDetails(item.acc))
    .join(';')

  const allRegDetails = [...unmatchedRegs, ...multiMatchRegs]
    .map((item) => formatRegistrationDetails(item.reg))
    .join(';')

  const message =
    `Organisation has accreditations that cant be linked to registrations: ` +
    `orgId=${organisation.orgId},orgDbId=${organisation.id},` +
    `totalUnlinkedAccs=${totalUnlinkedAccs},noMatchAccs=${unmatchedAccs.length},multiMatchAccs=${multiMatchAccs.length},` +
    `accreditations=[${allAccDetails}],` +
    `registrations=[${allRegDetails}]`

  logger.warn({ message })
}

function countItems(organisations, propertyName, filter = () => true) {
  return organisations.flatMap((org) => org[propertyName] ?? []).filter(filter)
    .length
}

function getLinkedRegCount(organisations) {
  return countItems(
    organisations,
    'registrations',
    (reg) => reg.accreditationId !== undefined
  )
}

/**
 * Link registration to accredidations
 *
 * @param {OrganisationWithRegistrations[]} organisations
 * @returns {Organisation[]}
 */
export function linkRegistrationToAccreditations(organisations) {
  const accCount = countItems(organisations, 'accreditations')
  for (const org of organisations) {
    linkAccreditationsForOrg(org)
  }

  const linkedRegCount = getLinkedRegCount(organisations)
  logger.info({
    message: `Accreditation linking complete: ${linkedRegCount}/${accCount} linked`
  })
  const regCount = countItems(organisations, 'registrations')
  logger.info({
    message: `Registrations : ${linkedRegCount}/${regCount} linked to accreditations`
  })

  return organisations
}
