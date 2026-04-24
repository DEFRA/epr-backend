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
import { validateApprovals } from './schema/helpers.js'
import { collateUsers } from './collate-users.js'
import { getCurrentStatus } from './status.js'

export const SCHEMA_VERSION = 1

export const createStatusHistoryEntry = (status) => ({
  status,
  updatedAt: new Date()
})

export const createInitialStatusHistory = () => {
  const statusHistory = [createStatusHistoryEntry('created')]
  return validateStatusHistory(statusHistory)
}

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
      statusHistory = existingItem.statusHistory
    }
  }
  return validateStatusHistory(statusHistory)
}

export const updateStatusHistoryForItems = (existingItems, itemUpdates) => {
  const existingItemsById = new Map(
    existingItems.map((item) => [item.id, item])
  )

  const processedUpdates = itemUpdates.map((updatedItem) => {
    const existingItem = existingItemsById.get(updatedItem.id)
    if (existingItem) {
      existingItemsById.delete(updatedItem.id)
      // Validate status transition for registrations/accreditations
      assertAndHandleItemStateTransition(existingItem, updatedItem)
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
  const normalised = normaliseOrganisationFromDb(org)
  const { _id, ...rest } = normalised

  rest.status = getCurrentStatus(rest)

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
  const accreditationsAfterUpdate =
    applyRegistrationStatusToLinkedAccreditations(
      validated.registrations,
      validated.accreditations
    )
  validateApprovals(validated.registrations, accreditationsAfterUpdate)
  const registrations = updateStatusHistoryForItems(
    existing.registrations,
    validated.registrations
  )

  const accreditations = updateStatusHistoryForItems(
    existing.accreditations,
    accreditationsAfterUpdate
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

const escapeRegex = (string) =>
  string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

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
  async ({ page, pageSize, registrationNumber }) => {
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
