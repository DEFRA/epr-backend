import { logger } from '#common/helpers/logging/logger.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

function getItemsBySystemReference(items) {
  return items.reduce((itemsMap, item) => {
    itemsMap.set(item.systemReference, [
      ...(itemsMap.get(item.systemReference) || []),
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
    (org) => !org[propertyName] || org[propertyName].length === 0
  )

  if (orgsWithoutItems.length > 0) {
    logger.warn({
      message: `${orgsWithoutItems.length} organisations without ${propertyName}`
    })
    for (const org of orgsWithoutItems) {
      logger.warn({
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
  return (
    registration.wasteProcessingType === accreditation.wasteProcessingType &&
    registration.material === accreditation.material &&
    (registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
      ? registration.site.line1 === accreditation.site.line1 &&
        registration.site.postcode === accreditation.site.postcode
      : true)
  )
}

export function linkRegistrationToAccreditations(organisations) {
  let linkedCount = 0
  const totalAccreditationsCount = organisations.reduce(
    (agg, org) => agg + org.accreditations.length,
    0
  )
  for (const org of organisations) {
    for (const accreditation of org.accreditations) {
      const matchedRegistrations = org.registrations.filter((registration) =>
        isAccreditationForRegistration(accreditation, registration)
      )

      if (matchedRegistrations.length === 1) {
        matchedRegistrations[0].accreditationId = accreditation.id
        linkedCount++
      } else if (matchedRegistrations.length > 1) {
        logger.warn({
          message: `Multiple registrations matched for accreditation: accreditationId=${accreditation.id}, registrationIds=[${matchedRegistrations.map((r) => r.id).join(', ')}], orgId=${org.orgId}, org id:${org.id}`
        })
      } else {
        logger.warn({
          message: `No registrations matched for accreditation: accreditationId=${accreditation.id}, orgId=${org.orgId}, org id:${org.id}`
        })
      }
    }
  }

  // Log summary
  logger.info({
    message: `Accreditation linking complete: ${linkedCount} linked, ${totalAccreditationsCount - linkedCount} unlinked`
  })

  return organisations
}
