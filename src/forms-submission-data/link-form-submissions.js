import { logger } from '#common/helpers/logging/logger.js'
import {
  comparePostcodes,
  postCodeForLogging
} from './parsing-common/postcode.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

/**
 * @import {OrganisationWithAccreditations} from './types.js'
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

function formatRegistrationForLogging(registration) {
  const isReprocessor =
    registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
  const siteInfo = isReprocessor
    ? `, site.postcodeHash=${postCodeForLogging(registration.site?.postcode)}`
    : ''
  return `{id=${registration.id}, wasteProcessingType=${registration.wasteProcessingType}, material=${registration.material}${siteInfo}}`
}

function formatAccreditationComparisonLog(accreditation, registrations, org) {
  const isReprocessor =
    accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
  const siteInfo = isReprocessor
    ? `, site.postcodeHash=${postCodeForLogging(accreditation.site?.postcode)}`
    : ''
  const registrationsInfo = registrations
    .map(formatRegistrationForLogging)
    .join(', ')
  return `accreditationId=${accreditation.id}, wasteProcessingType=${accreditation.wasteProcessingType}, material=${accreditation.material}${siteInfo}, registrations=[${registrationsInfo}], orgId=${org.orgId}, org id:${org.id}`
}

function sitesMatch(site1, site2) {
  return comparePostcodes(site1.postcode, site2.postcode)
}

function isAccreditationForRegistration(accreditation, registration) {
  const typeAndMaterialMatch =
    registration.wasteProcessingType === accreditation.wasteProcessingType &&
    registration.material === accreditation.material

  if (!typeAndMaterialMatch) {
    return false
  }

  return registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? sitesMatch(registration.site, accreditation.site)
    : true
}

/**
 * Link registration to accredidations
 *
 * @param {OrganisationWithAccreditations[]} organisations
 * @returns {OrganisationWithAccreditations[]}
 */
export function linkRegistrationToAccreditations(organisations) {
  let linkedCount = 0
  const totalAccreditationsCount = organisations.flatMap(
    (org) => org.accreditations ?? []
  ).length

  for (const org of organisations) {
    const accreditations = org.accreditations ?? []
    const registrations = org.registrations ?? []

    for (const accreditation of accreditations) {
      const matchedRegistrations = registrations.filter((registration) =>
        isAccreditationForRegistration(accreditation, registration)
      )

      if (matchedRegistrations.length === 1) {
        matchedRegistrations[0].accreditationId = accreditation.id
        linkedCount++
      } else if (matchedRegistrations.length > 1) {
        logger.warn({
          message: `Multiple registrations matched for accreditation: ${formatAccreditationComparisonLog(accreditation, registrations, org)}`
        })
      } else {
        logger.warn({
          message: `No registrations matched for accreditation: ${formatAccreditationComparisonLog(accreditation, registrations, org)}`
        })
      }
    }
  }

  logger.info({
    message: `Accreditation linking complete: ${linkedCount}/${totalAccreditationsCount} linked, ${totalAccreditationsCount - linkedCount} unlinked`
  })

  const registrationsCount = organisations.flatMap(
    (org) => org.registrations ?? []
  ).length
  const registrationsWithoutAcc = organisations.flatMap((org) =>
    (org.registrations ?? []).filter((r) => !r.accreditationId)
  ).length
  logger.info({
    message: `Registrations : ${registrationsCount - registrationsWithoutAcc}/${registrationsCount} linked to accreditations, ${registrationsWithoutAcc} unlinked`
  })

  return organisations
}
