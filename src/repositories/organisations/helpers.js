import {
  normaliseOrganisationFromDb,
  validateOrganisationUpdate,
  validateStatusHistory
} from './schema/index.js'
import {
  applyRegistrationStatusToLinkedAccreditations,
  assertAndHandleItemStateTransition,
  assertOrgStatusTransition
} from '#repositories/organisations/schema/status-transition.js'
import {
  validateAccreditationLinkExists,
  validateAccreditationLinkMatches,
  validateAccreditationLinkUniqueness,
  validateApprovals
} from './schema/helpers.js'
import {
  assertAccreditationStatusTransitionValid,
  assertRegistrationStatusTransitionValid
} from '#domain/organisations/status.js'
import { ObjectId } from 'mongodb'
import { collateUsers } from './collate-users.js'
import { getCurrentStatus } from './status.js'

/** @import { WithId } from 'mongodb' */
/** @import { Organisation, OrganisationStatus } from '#domain/organisations/model.js' */
/** @import { StatusTransitionAsserter } from '#domain/organisations/status.js' */
/** @import { FindPageForOverseasSitesAdminListParams } from './port.js' */

/**
 * A status history entry as it reaches the repository: stored entries carry a
 * Date, caller-supplied ones an ISO string.
 * @typedef {{status: string, updatedAt: Date | string}} StatusHistoryEntryInput
 */

export const createStatusHistoryEntry = (status) => ({
  status,
  updatedAt: new Date()
})

export const createInitialStatusHistory = () => {
  const statusHistory = [createStatusHistoryEntry('created')]
  return validateStatusHistory(statusHistory)
}

/**
 * Derives the statusHistory to persist for an item.
 *
 * A status change always appends to the stored history — a caller-supplied
 * history is ignored in that case, so the recorded transition is the server's.
 * Without a status change a supplied history is honoured (PAE-1809: admins
 * correcting updatedAt dates); a new item is always seeded fresh. Only the
 * registration and accreditation update schemas carry a statusHistory key, so
 * the organisation-level call site never supplies one.
 *
 * @param {{ status?: string, statusHistory?: StatusHistoryEntryInput[] }} updatedItem
 * @param {{ statusHistory: StatusHistoryEntryInput[] } | null | undefined} existingItem
 * @returns {Array<{status: string, updatedAt: Date}>}
 */
export const statusHistoryWithChanges = (updatedItem, existingItem) => {
  let statusHistory = createInitialStatusHistory()
  if (existingItem) {
    if (
      updatedItem.status &&
      updatedItem.status !== getCurrentStatus(existingItem)
    ) {
      statusHistory = [
        ...existingItem.statusHistory,
        createStatusHistoryEntry(updatedItem.status)
      ]
    } else {
      statusHistory = updatedItem.statusHistory ?? existingItem.statusHistory
    }
  }
  return validateStatusHistory(statusHistory)
}

/**
 * @template {string} S
 * @param {Array<{ id: string, status: S, statusHistory: StatusHistoryEntryInput[] }>} existingItems
 * @param {Array<{ id: string, status?: S, statusHistory?: StatusHistoryEntryInput[] }>} itemUpdates
 * @param {StatusTransitionAsserter<S>} assertStatusTransitionValid
 * @param {Set<string>} [systemAppliedItemIds] - items whose status change was
 *   applied by the system (the registration-cancellation cascade), exempt from
 *   the transition table
 */
export const updateStatusHistoryForItems = (
  existingItems,
  itemUpdates,
  assertStatusTransitionValid,
  systemAppliedItemIds = new Set()
) => {
  const existingItemsById = new Map(
    existingItems.map((item) => [item.id, item])
  )

  const processedUpdates = itemUpdates.map((updatedItem) => {
    const existingItem = existingItemsById.get(updatedItem.id)
    if (existingItem) {
      existingItemsById.delete(updatedItem.id)
      // Validate status transition for registrations/accreditations
      if (!systemAppliedItemIds.has(updatedItem.id)) {
        assertAndHandleItemStateTransition(
          existingItem,
          updatedItem,
          assertStatusTransitionValid
        )
      }
      return {
        ...updatedItem,
        statusHistory: statusHistoryWithChanges(updatedItem, existingItem)
      }
    } else {
      return {
        ...updatedItem,
        statusHistory: createInitialStatusHistory()
      }
    }
  })

  return [...processedUpdates].map((item) => {
    const { status: _, ...remainingFields } = item
    return remainingFields
  })
}

export const mapDocumentWithCurrentStatuses = (org) => {
  const normalised = /** @type {WithId<Omit<Organisation, 'id'>>} */ (
    normaliseOrganisationFromDb(org)
  )
  const { _id, ...rest } = normalised

  rest.status = /** @type {OrganisationStatus} */ (getCurrentStatus(rest))

  for (const item of rest.registrations) {
    item.status = getCurrentStatus(item)
    item.accreditation = item.accreditation ?? null
  }

  for (const item of rest.accreditations) {
    item.status = getCurrentStatus(item)
  }

  return { id: _id.toString(), ...rest }
}

function prepareRegAccForReplace(validated, existing) {
  const { accreditations: accreditationsAfterUpdate, cascadeCancelledIds } =
    applyRegistrationStatusToLinkedAccreditations(
      validated.registrations,
      validated.accreditations
    )
  validateAccreditationLinkUniqueness(validated.registrations)
  validateAccreditationLinkExists(
    validated.registrations,
    accreditationsAfterUpdate
  )
  validateAccreditationLinkMatches(
    validated.registrations,
    accreditationsAfterUpdate
  )
  validateApprovals(validated.registrations, accreditationsAfterUpdate)
  const registrations = updateStatusHistoryForItems(
    existing.registrations,
    validated.registrations,
    assertRegistrationStatusTransitionValid
  )

  const accreditations = updateStatusHistoryForItems(
    existing.accreditations,
    accreditationsAfterUpdate,
    assertAccreditationStatusTransitionValid,
    cascadeCancelledIds
  )
  return { registrations, accreditations }
}

export const prepareForReplace = (existing, updates) => {
  const validated = validateOrganisationUpdate(updates, existing)
  const { registrations, accreditations } = prepareRegAccForReplace(
    validated,
    existing
  )

  const updatedStatusHistory = statusHistoryWithChanges(validated, existing)

  const users = collateUsers({
    ...validated,
    statusHistory: updatedStatusHistory,
    registrations,
    accreditations
  })

  const { status: _, ...updatesWithoutStatus } = {
    ...validated
  }

  assertOrgStatusTransition(existing, validated)

  return {
    ...updatesWithoutStatus,
    statusHistory: updatedStatusHistory,
    registrations,
    accreditations,
    users,
    version: existing.version + 1
  }
}

const OVERSEAS_SITES_COLLECTION_NAME = 'overseas-sites'

const ORS_ADMIN_LIST_PROJECTION = {
  orgId: 1,
  'registrations.material': 1,
  'registrations.registrationNumber': 1,
  'registrations.accreditationId': 1,
  'registrations.accreditationNumber': 1,
  'registrations.accreditation.accreditationNumber': 1,
  'registrations.overseasSites': 1,
  'accreditations.id': 1,
  'accreditations.accreditationNumber': 1
}

export const escapeRegex = (string) =>
  string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/**
 * The optional criteria a findPage query can be narrowed by. Every criterion
 * that carries a value is ANDed with the others; an empty string or undefined
 * is treated as absent.
 * @typedef {Object} FindPageCriteria
 * @property {string} [search] - case-insensitive substring on companyDetails.name
 * @property {string} [orgId] - business orgId or the organisation's document id
 * @property {string} [registrationId] - exact match on registrations[].id
 * @property {string} [registrationNumber] - case-insensitive exact match on registrations[].registrationNumber
 * @property {string} [accreditationId] - exact match on accreditations[].id
 * @property {string} [accreditationNumber] - case-insensitive exact match on accreditations[].accreditationNumber
 */

/**
 * An organisation as it is stored, before the read path maps `_id` to `id` and
 * derives the current statuses. The in-memory adapter keeps `_id` as the plain
 * id string.
 * @typedef {Omit<Organisation, 'id'|'status'> & { _id: string }} StoredOrganisation
 */

const INTEGER_PATTERN = /^\d+$/
const DOCUMENT_ID_PATTERN = /^[0-9a-fA-F]{24}$/

/** Matches no organisation, used when a criterion cannot be parsed. */
const UNSATISFIABLE_FILTER = { _id: { $in: [] } }

/**
 * @param {FindPageCriteria} criteria
 * @returns {Required<FindPageCriteria>} - every criterion trimmed, absent ones as ''
 */
const normaliseCriteria = ({
  search,
  orgId,
  registrationId,
  registrationNumber,
  accreditationId,
  accreditationNumber
}) => ({
  search: (search ?? '').trim(),
  orgId: (orgId ?? '').trim(),
  registrationId: (registrationId ?? '').trim(),
  registrationNumber: (registrationNumber ?? '').trim(),
  accreditationId: (accreditationId ?? '').trim(),
  accreditationNumber: (accreditationNumber ?? '').trim()
})

/**
 * The interpretations an orgId criterion parses into. Both can apply at once —
 * a 24-digit decimal string is a valid business orgId and a valid document id.
 *
 * @param {string} value
 * @returns {{ businessOrgId: number | null, documentId: string | null }}
 */
const parseOrgIdCriterion = (value) => ({
  businessOrgId: INTEGER_PATTERN.test(value) ? Number(value) : null,
  documentId: DOCUMENT_ID_PATTERN.test(value) ? value : null
})

/**
 * The pattern both adapters match numbers with: the whole value, escaped.
 * @param {string} value
 * @returns {string}
 */
const anchoredPattern = (value) => `^${escapeRegex(value)}$`

/**
 * @param {string} value
 * @returns {{ $regex: string, $options: string }} - anchored, case-insensitive
 */
const anchoredCaseInsensitive = (value) => ({
  $regex: anchoredPattern(value),
  $options: 'i'
})

/**
 * @param {string} value
 * @returns {object} - the organisation-id fragment, unsatisfiable when unparseable
 */
const buildOrgIdFilter = (value) => {
  const { businessOrgId, documentId } = parseOrgIdCriterion(value)
  const branches = []
  if (businessOrgId !== null) {
    branches.push({ orgId: businessOrgId })
  }
  if (documentId !== null) {
    branches.push({ _id: ObjectId.createFromHexString(documentId) })
  }

  return branches.length === 0 ? UNSATISFIABLE_FILTER : { $or: branches }
}

/**
 * Builds the MongoDB filter for a findPage query.
 *
 * @param {FindPageCriteria} criteria
 * @returns {object} - a filter matching organisations satisfying every criterion
 */
export const buildFindPageFilter = (criteria) => {
  const {
    search,
    orgId,
    registrationId,
    registrationNumber,
    accreditationId,
    accreditationNumber
  } = normaliseCriteria(criteria)

  const conditions = []
  if (search !== '') {
    conditions.push({
      'companyDetails.name': { $regex: escapeRegex(search), $options: 'i' }
    })
  }
  if (orgId !== '') {
    conditions.push(buildOrgIdFilter(orgId))
  }
  if (registrationId !== '') {
    conditions.push({ 'registrations.id': registrationId })
  }
  if (registrationNumber !== '') {
    conditions.push({
      'registrations.registrationNumber':
        anchoredCaseInsensitive(registrationNumber)
    })
  }
  if (accreditationId !== '') {
    conditions.push({ 'accreditations.id': accreditationId })
  }
  if (accreditationNumber !== '') {
    conditions.push({
      'accreditations.accreditationNumber':
        anchoredCaseInsensitive(accreditationNumber)
    })
  }

  return conditions.length === 0 ? {} : { $and: conditions }
}

/**
 * @param {string} value
 * @returns {(candidate: string | null | undefined) => boolean}
 */
const anchoredMatcher = (value) => {
  const pattern = new RegExp(anchoredPattern(value), 'i')
  return (candidate) => pattern.test(candidate ?? '')
}

/**
 * @param {string} value
 * @returns {Array<(org: StoredOrganisation) => boolean>} - one predicate per parseable
 *   interpretation; empty when the value parses as neither, so nothing matches
 */
const buildOrgIdMatchers = (value) => {
  const { businessOrgId, documentId } = parseOrgIdCriterion(value)
  const matchers = []
  if (businessOrgId !== null) {
    matchers.push((org) => org.orgId === businessOrgId)
  }
  if (documentId !== null) {
    // The in-memory store keeps _id as the plain id string, unlike MongoDB
    matchers.push((org) => org._id === documentId)
  }

  return matchers
}

/**
 * Builds the in-memory equivalent of {@link buildFindPageFilter}, applied to
 * raw stored documents — so `_id` rather than `id`.
 *
 * @param {FindPageCriteria} criteria
 * @returns {(org: StoredOrganisation) => boolean} - true when the organisation satisfies every criterion
 */
export const buildFindPageMatcher = (criteria) => {
  const {
    search,
    orgId,
    registrationId,
    registrationNumber,
    accreditationId,
    accreditationNumber
  } = normaliseCriteria(criteria)

  /** @type {Array<(org: StoredOrganisation) => boolean>} */
  const checks = []
  if (search !== '') {
    const pattern = new RegExp(escapeRegex(search), 'i')
    checks.push((org) => pattern.test(org.companyDetails.name))
  }
  if (orgId !== '') {
    const matchers = buildOrgIdMatchers(orgId)
    checks.push((org) => matchers.some((matches) => matches(org)))
  }
  if (registrationId !== '') {
    checks.push((org) =>
      org.registrations.some((reg) => reg.id === registrationId)
    )
  }
  if (registrationNumber !== '') {
    const matchesNumber = anchoredMatcher(registrationNumber)
    checks.push((org) =>
      org.registrations.some((reg) => matchesNumber(reg.registrationNumber))
    )
  }
  if (accreditationId !== '') {
    checks.push((org) =>
      org.accreditations.some((acc) => acc.id === accreditationId)
    )
  }
  if (accreditationNumber !== '') {
    const matchesNumber = anchoredMatcher(accreditationNumber)
    checks.push((org) =>
      org.accreditations.some((acc) => matchesNumber(acc.accreditationNumber))
    )
  }

  return (org) => checks.every((check) => check(org))
}

const buildOrsAdminListBasePipeline = ({ registrationNumber }) => [
  {
    $project: {
      orgId: 1,
      registrations: 1,
      accreditations: 1
    }
  },
  { $unwind: '$registrations' },
  {
    $project: {
      orgId: 1,
      registration: '$registrations',
      accreditations: 1,
      overseasSiteMappings: {
        $objectToArray: {
          $ifNull: ['$registrations.overseasSites', {}]
        }
      }
    }
  },
  ...(registrationNumber
    ? [
        {
          $match: {
            'registration.registrationNumber': {
              $regex: escapeRegex(registrationNumber),
              $options: 'i'
            }
          }
        }
      ]
    : []),
  { $unwind: '$overseasSiteMappings' },
  {
    $project: {
      orgId: 1,
      registration: 1,
      accreditations: 1,
      orsId: '$overseasSiteMappings.k',
      overseasSiteId: '$overseasSiteMappings.v.overseasSiteId'
    }
  },
  {
    $lookup: {
      from: OVERSEAS_SITES_COLLECTION_NAME,
      let: { overseasSiteId: '$overseasSiteId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [
                '$_id',
                {
                  $convert: {
                    input: '$$overseasSiteId',
                    to: 'objectId',
                    onError: null,
                    onNull: null
                  }
                }
              ]
            }
          }
        }
      ],
      as: 'site'
    }
  },
  { $unwind: '$site' },
  { $sort: { orsId: 1 } }
]

const ORS_ADMIN_LIST_ROW_PROJECTION = {
  $project: {
    _id: 0,
    orgId: { $ifNull: ['$orgId', null] },
    registrationNumber: { $ifNull: ['$registration.registrationNumber', null] },
    accreditationNumber: {
      $let: {
        vars: {
          matchedAccreditation: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$accreditations',
                  as: 'accreditation',
                  cond: {
                    $eq: ['$$accreditation.id', '$registration.accreditationId']
                  }
                }
              },
              0
            ]
          }
        },
        in: {
          $ifNull: [
            '$registration.accreditation.accreditationNumber',
            {
              $ifNull: [
                '$registration.accreditationNumber',
                {
                  $ifNull: ['$$matchedAccreditation.accreditationNumber', null]
                }
              ]
            }
          ]
        }
      }
    },
    orsId: '$orsId',
    packagingWasteCategory: { $ifNull: ['$registration.material', null] },
    destinationCountry: '$site.country',
    overseasReprocessorName: '$site.name',
    addressLine1: '$site.address.line1',
    addressLine2: { $ifNull: ['$site.address.line2', null] },
    cityOrTown: '$site.address.townOrCity',
    stateProvinceOrRegion: { $ifNull: ['$site.address.stateOrRegion', null] },
    postcode: { $ifNull: ['$site.address.postcode', null] },
    coordinates: { $ifNull: ['$site.coordinates', null] },
    validFrom: { $ifNull: ['$site.validFrom', null] }
  }
}

export const performFindAllForOverseasSitesAdminList = (db) => async () => {
  const docs = await db
    .collection('epr-organisations')
    .find({}, { projection: ORS_ADMIN_LIST_PROJECTION })
    .toArray()

  return docs.map(({ orgId, registrations, accreditations }) => ({
    orgId,
    registrations,
    accreditations
  }))
}

export const performFindPageForOrsAdminList =
  (db) =>
  async (
    /** @type {FindPageForOverseasSitesAdminListParams} */ {
      page,
      pageSize,
      registrationNumber
    }
  ) => {
    const skip = (page - 1) * pageSize

    const [result] = await db
      .collection('epr-organisations')
      .aggregate([
        ...buildOrsAdminListBasePipeline({ registrationNumber }),
        {
          $facet: {
            rows: [
              { $skip: skip },
              { $limit: pageSize },
              ORS_ADMIN_LIST_ROW_PROJECTION
            ],
            totalCount: [{ $count: 'totalItems' }]
          }
        }
      ])
      .toArray()

    return {
      rows: result.rows,
      totalItems: result.totalCount[0]?.totalItems ?? 0
    }
  }
