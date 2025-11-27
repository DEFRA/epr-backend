import { logger } from '#common/helpers/logging/logger.js'
import { compareSite, siteInfoToLog } from './parsing-common/site.js'
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
    ? `, site: ${siteInfoToLog(registration.site)}`
    : ''
  return `{id=${registration.id}, wasteProcessingType=${registration.wasteProcessingType}, material=${registration.material}${siteInfo}}`
}

function formatAccreditationComparisonLog(accreditation, registrations, org) {
  const isReprocessor =
    accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
  const siteInfo = isReprocessor
    ? `, site: ${siteInfoToLog(accreditation.site)}`
    : ''
  const registrationsInfo = registrations
    .map(formatRegistrationForLogging)
    .join(', ')
  return `accreditationId=${accreditation.id}, wasteProcessingType=${accreditation.wasteProcessingType}, material=${accreditation.material}${siteInfo}, registrations=[${registrationsInfo}], orgId=${org.orgId}, org id:${org.id}`
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

  for (const accreditation of accreditations) {
    const matchedRegistrations = registrations.filter((registration) =>
      isAccreditationForRegistration(accreditation, registration)
    )

    if (matchedRegistrations.length === 1) {
      matchedRegistrations[0].accreditationId = accreditation.id
    } else if (matchedRegistrations.length > 1) {
      logger.warn({
        message: `Multiple registrations matched for accreditation: ${formatAccreditationComparisonLog(accreditation, registrations, organisation)}`
      })
    } else {
      logger.warn({
        message: `No registrations matched for accreditation: ${formatAccreditationComparisonLog(accreditation, registrations, organisation)}`
      })
    }
  }
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
 * @param {OrganisationWithAccreditations[]} organisations
 * @returns {OrganisationWithAccreditations[]}
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
