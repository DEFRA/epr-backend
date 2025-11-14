import { logger } from '#common/helpers/logging/logger.js'

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
    logger.error({
      message: `${unlinked.length} ${propertyName} not linked to an organisation`
    })
    logger.error({
      message: `${propertyName} not linked: ${unlinked.map((item) => item.id).join(', ')}`
    })
  }

  return [...organisationsById.values()]
}
