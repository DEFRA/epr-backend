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
  validateAccreditationNumbersRetained,
  validateApprovals
} from './schema/helpers.js'
import {
  assertAccreditationStatusTransitionValid,
  assertRegistrationStatusTransitionValid
} from '#domain/organisations/status.js'
import { collateUsers } from './collate-users.js'
import { getCurrentStatus } from './status.js'

/** @import { WithId } from 'mongodb' */
/** @import { Organisation, OrganisationStatus } from '#domain/organisations/model.js' */
/** @import { StatusTransitionAsserter } from '#domain/organisations/status.js' */
/** @import { FindPageForOverseasSitesAdminListParams, SearchCriteria } from './port.js' */

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
    // Registrations don't expire (PAE-1904); strip any validTo left on older documents.
    delete (/** @type {Record<string, unknown>} */ (item).validTo)
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
  validateAccreditationNumbersRetained(accreditations, existing.accreditations)
  return { registrations, accreditations }
}

/**
 * A registration or accreditation carries its status only as a derived field,
 * and the update schemas accept it as optional. The requiredness of a number,
 * a validity date and a reprocessing type is conditional on that status, so an
 * update that omits it resolves every one of them to the optional arm, where
 * the schema default writes null over the stored value. Supplying the stored
 * status keeps the conditions keyed to the record as it stands.
 *
 * @template {{ id: string, status?: string }} T
 * @param {Array<{ id: string, status?: string }>} existingItems
 * @param {T[] | undefined} itemUpdates
 * @returns {T[] | undefined}
 */
const withStatusFromExisting = (existingItems, itemUpdates) => {
  if (!itemUpdates) {
    return itemUpdates
  }

  const existingById = new Map(existingItems.map((item) => [item.id, item]))

  return itemUpdates.map((item) => ({
    ...item,
    status: item.status ?? existingById.get(item.id)?.status
  }))
}

export const prepareForReplace = (existing, updates) => {
  const validated = validateOrganisationUpdate(
    {
      ...updates,
      registrations: withStatusFromExisting(
        existing.registrations,
        updates.registrations
      ),
      accreditations: withStatusFromExisting(
        existing.accreditations,
        updates.accreditations
      )
    },
    existing
  )
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
 * An organisation as it is stored, before the read path maps `_id` to `id` and
 * derives the current statuses. The in-memory adapter keeps `_id` as the plain
 * id string.
 * @typedef {Omit<Organisation, 'id'|'status'> & { _id: string }} StoredOrganisation
 */

const INTEGER_PATTERN = /^\d+$/
const DOCUMENT_ID_PATTERN = /^[0-9a-fA-F]{24}$/

/**
 * @param {SearchCriteria} criteria
 * @returns {Required<SearchCriteria>} - every criterion trimmed, absent ones as ''
 */
export const normaliseCriteria = ({
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
export const parseOrgIdCriterion = (value) => ({
  businessOrgId: INTEGER_PATTERN.test(value) ? Number(value) : null,
  documentId: DOCUMENT_ID_PATTERN.test(value) ? value : null
})

/**
 * The pattern both adapters match numbers with: the whole value, escaped.
 * Each adapter turns this into its own form — a Mongo `$regex` fragment or a
 * JavaScript RegExp — so the matching semantics stay defined in one place.
 *
 * @param {string} value
 * @returns {string}
 */
export const anchoredPattern = (value) => `^${escapeRegex(value)}$`

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
