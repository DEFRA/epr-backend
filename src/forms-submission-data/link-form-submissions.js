import { logger } from '#common/helpers/logging/logger.js'
import {
  REG_ACC_STATUS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { siteInfoToLog } from './parsing-common/site.js'
import { isAccreditationForRegistration } from '#formsubmission/submission-keys.js'

/**
 * @import {Organisation, OrganisationWithRegistrations} from './types.js'
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
 * Converts an item to the unlinked item format for logging
 * @param {Object} item - The item to convert
 * @returns {Object} Unlinked item with id, systemReference, and orgId
 */
function toUnlinkedItem(item) {
  return {
    id: item.id,
    systemReference: item.systemReference,
    orgId: item.orgId
  }
}

/**
 * Partitions items into matched and unmatched based on orgId matching
 * @param {Array} items - Items to partition
 * @param {Object} org - Organisation to match against
 * @returns {{matched: Array, unmatched: Array}} Partitioned items
 */
function partitionItemsByOrgIdMatch(items, org) {
  return items.reduce(
    (acc, item) => {
      if (item.orgId === org.orgId) {
        acc.matched.push(item)
      } else {
        acc.unmatched.push(item)
      }
      return acc
    },
    { matched: [], unmatched: [] }
  )
}

/**
 * Logs unlinked items as warnings
 * @param {Array} unlinkedItems - Array of unlinked items
 * @param {string} propertyName - Type of items (e.g., 'registrations')
 */
function logUnlinkedItems(unlinkedItems, propertyName) {
  if (unlinkedItems.length === 0) {
    return
  }

  logger.warn({
    message: `${unlinkedItems.length} ${propertyName} not linked to an organisation`
  })
  for (const item of unlinkedItems) {
    logger.warn({
      message: `${propertyName} not linked: id=${item.id}, systemReference=${item.systemReference}, orgId=${item.orgId}`
    })
  }
}

/**
 * Links child items to organisations by systemReference
 * @param {Array} organisations - Array of organisation objects
 * @param {Array} items - Array of items to link (registrations, accreditations, etc.)
 * @param {string} propertyName - Property name to set on organisation (e.g., 'registrations', 'accreditations')
 * @param {Set<string>} systemReferencesRequiringOrgIdMatch - Set of systemReferences that require orgId to match organisation's orgId for linking
 * @returns {Array} Array of organisations with linked items
 */
export function linkItemsToOrganisations(
  organisations,
  items,
  propertyName,
  systemReferencesRequiringOrgIdMatch
) {
  const itemsBySystemReference = getItemsBySystemReference(items)
  const organisationsById = getOrganisationsById(organisations)

  const unlinked = []

  for (const [systemReference, itemsPerOrg] of itemsBySystemReference) {
    const org = organisationsById.get(systemReference)

    if (org) {
      const { matched, unmatched } = systemReferencesRequiringOrgIdMatch.has(
        systemReference
      )
        ? partitionItemsByOrgIdMatch(itemsPerOrg, org)
        : { matched: itemsPerOrg, unmatched: [] }

      org[propertyName] = (org[propertyName] ?? []).concat(matched)
      unlinked.push(...unmatched.map(toUnlinkedItem))
    } else {
      unlinked.push(...itemsPerOrg.map(toUnlinkedItem))
    }
  }

  logUnlinkedItems(unlinked, propertyName)
  logOrganisationsWithoutItems(organisations, propertyName)

  return organisations
}

/**
 * Finds accreditations eligible for linking to a registration
 * Filters out approved accreditations to prevent linking to locked records
 */
function findEligibleAccreditations(registration, accreditations) {
  return accreditations
    .filter((acc) => acc.status !== REG_ACC_STATUS.APPROVED)
    .filter((acc) => isAccreditationForRegistration(acc, registration))
}

/**
 * Selects the latest accreditation from a list by formSubmissionTime
 */
function selectLatestAccreditation(accreditations) {
  return accreditations.sort(
    (a, b) => b.formSubmissionTime - a.formSubmissionTime
  )[0]
}

/**
 * Checks if a registration is linked to an approved accreditation
 */
function isLinkedToApprovedAccreditation(registration, accreditations) {
  const linkedAccreditation = accreditations.find(
    (acc) => acc.id === registration.accreditationId
  )
  return linkedAccreditation?.status === REG_ACC_STATUS.APPROVED
}

/**
 * Finds registrations that are eligible for linking to accreditations
 * Excludes approved registrations that are already linked to approved accreditations
 * This preserves existing links and prevents re-linking approved registrations
 */
function findRegistrationsToLink(registrations, accreditations) {
  return registrations.filter(
    (registration) =>
      !isLinkedToApprovedAccreditation(registration, accreditations)
  )
}

function linkAccreditationsForOrg(organisation) {
  const accreditations = organisation.accreditations ?? []
  const registrations = organisation.registrations ?? []

  const registrationsToLink = findRegistrationsToLink(
    registrations,
    accreditations
  )

  for (const registration of registrationsToLink) {
    const matchedAccreditations = findEligibleAccreditations(
      registration,
      accreditations
    )

    if (matchedAccreditations.length > 0) {
      const latestMatchedAccreditation = selectLatestAccreditation(
        matchedAccreditations
      )
      registration.accreditationId = latestMatchedAccreditation.id

      if (matchedAccreditations.length > 1) {
        logger.warn({
          message:
            `Multiple accreditations match registration, picking latest by formSubmissionTime: ` +
            `orgId=${organisation.orgId},orgDbId=${organisation.id},` +
            `registration=[${formatRegistrationDetails(registration)}],` +
            `selected accreditation=[${formatAccreditationDetails(latestMatchedAccreditation)}]`
        })
      }
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
    (acc) => !linkedAccreditationIds.has(acc.id)
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
 * @param {OrganisationWithRegistrations[]} organisations
 * @returns {Organisation[]}
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
