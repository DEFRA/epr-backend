import { logger } from '#common/helpers/logging/logger.js'
import { compareSite, siteInfoToLog } from './parsing-common/site.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

/**
 * @import {OrganisationWithAccreditations} from './types.js'
 * @import {Accreditation, Registration} from '#repositories/organisations/port.js'
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

/**
 * Check if an accreditation matches a registration based on type, material, and site
 * @param {Accreditation} accreditation - The accreditation to check
 * @param {Registration} registration - The registration to match against
 * @returns {boolean} True if the accreditation matches the registration
 */
export function isAccreditationForRegistration(accreditation, registration) {
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

  for (const registration of registrations) {
    const matchedAccreditations = accreditations.filter((acc) =>
      isAccreditationForRegistration(acc, registration)
    )

    if (matchedAccreditations.length === 1) {
      registration.accreditationId = matchedAccreditations[0].id
    }
  }
  logUnlinkedAccreditations(organisation)
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

function logUnlinkedAccreditations(organisation) {
  const registrations = organisation.registrations ?? []
  const accreditations = organisation.accreditations ?? []
  const linkedRegistrations = registrations.filter(
    (reg) => reg.accreditationId !== undefined
  )
  const unlinkedRegistrations = registrations.filter(
    (reg) => reg.accreditationId === undefined
  )

  const linkedAccreditationIds = new Set(
    linkedRegistrations.map((reg) => reg.accreditationId)
  )
  const unlinkedAccreditations = accreditations.filter(
    (acc) => !linkedAccreditationIds.has(acc.accreditationId)
  )

  if (unlinkedAccreditations.length === 0) {
    return
  }

  const unlinkedAccDetails = unlinkedAccreditations
    .map((item) => formatAccreditationDetails(item))
    .join(';')

  const unlinkedRegDetails = unlinkedRegistrations
    .map((item) => formatRegistrationDetails(item))
    .join(';')

  const message =
    `Organisation has accreditations that cant be linked to registrations: ` +
    `orgId=${organisation.orgId},orgDbId=${organisation.id},` +
    `unlinked accreditations count=${unlinkedAccreditations.length},` +
    `unlinked accreditations=[${unlinkedAccDetails}],` +
    `unlinked registrations=[${unlinkedRegDetails}]`

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

function getLinkedAccCount(organisations) {
  return new Set(
    organisations
      .flatMap((org) => org.registrations ?? [])
      .map((reg) => reg.accreditationId)
      .filter(Boolean)
  ).size
}

/**
 * Link registrations to accreditations
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
  const linkedAccCount = getLinkedAccCount(organisations)
  logger.info({
    message: `Accreditation linking complete: ${linkedAccCount}/${accCount} linked`
  })
  const regCount = countItems(organisations, 'registrations')
  logger.info({
    message: `Registrations : ${linkedRegCount}/${regCount} linked to accreditations`
  })

  return organisations
}
