import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'

const AWAITING_AUTHORISATION_STATUSES = [PRN_STATUS.AWAITING_AUTHORISATION]
const AWAITING_ACCEPTANCE_STATUSES = [PRN_STATUS.AWAITING_ACCEPTANCE]
const AWAITING_CANCELLATION_STATUSES = [PRN_STATUS.AWAITING_CANCELLATION]
const ACCEPTED_STATUSES = [PRN_STATUS.ACCEPTED]
const CANCELLED_STATUSES = [PRN_STATUS.CANCELLED]
const EXCLUDED_STATUSES = [PRN_STATUS.DELETED, PRN_STATUS.DISCARDED]

const buildTonnageBandLookupStage = () => ({
  $lookup: {
    from: ORGANISATIONS_COLLECTION,
    let: {
      orgId: { $toObjectId: '$_id.orgId' },
      accId: '$_id.accId'
    },
    pipeline: [
      { $match: { $expr: { $eq: ['$_id', '$$orgId'] } } },
      { $unwind: '$accreditations' },
      {
        $match: {
          $expr: { $eq: ['$accreditations.id', '$$accId'] }
        }
      },
      {
        $project: {
          _id: 0,
          orgId: '$orgId',
          tonnageBand: '$accreditations.prnIssuance.tonnageBand'
        }
      }
    ],
    as: 'orgLookup'
  }
})

const buildAggregationPipeline = () => [
  {
    $match: {
      'status.currentStatus': {
        $nin: EXCLUDED_STATUSES
      }
    }
  },
  {
    $group: {
      _id: {
        orgId: '$organisation.id',
        orgName: '$organisation.name',
        accId: '$accreditation.id',
        accNumber: '$accreditation.accreditationNumber',
        material: '$accreditation.material'
      },
      awaitingAuthorisationTonnage: {
        $sum: {
          $cond: [
            { $in: ['$status.currentStatus', AWAITING_AUTHORISATION_STATUSES] },
            '$tonnage',
            0
          ]
        }
      },
      awaitingAcceptanceTonnage: {
        $sum: {
          $cond: [
            { $in: ['$status.currentStatus', AWAITING_ACCEPTANCE_STATUSES] },
            '$tonnage',
            0
          ]
        }
      },
      awaitingCancellationTonnage: {
        $sum: {
          $cond: [
            {
              $in: ['$status.currentStatus', AWAITING_CANCELLATION_STATUSES]
            },
            '$tonnage',
            0
          ]
        }
      },
      acceptedTonnage: {
        $sum: {
          $cond: [
            { $in: ['$status.currentStatus', ACCEPTED_STATUSES] },
            '$tonnage',
            0
          ]
        }
      },
      cancelledTonnage: {
        $sum: {
          $cond: [
            { $in: ['$status.currentStatus', CANCELLED_STATUSES] },
            '$tonnage',
            0
          ]
        }
      }
    }
  },
  buildTonnageBandLookupStage(),
  {
    $addFields: {
      organisationId: {
        $toString: {
          $ifNull: [{ $first: '$orgLookup.orgId' }, '$_id.orgId']
        }
      },
      tonnageBand: { $ifNull: [{ $first: '$orgLookup.tonnageBand' }, null] }
    }
  },
  {
    $project: {
      _id: 0,
      organisationName: '$_id.orgName',
      organisationId: 1,
      accreditationNumber: '$_id.accNumber',
      material: '$_id.material',
      tonnageBand: 1,
      awaitingAuthorisationTonnage: 1,
      awaitingAcceptanceTonnage: 1,
      awaitingCancellationTonnage: 1,
      acceptedTonnage: 1,
      cancelledTonnage: 1
    }
  },
  {
    $sort: {
      organisationName: 1,
      accreditationNumber: 1
    }
  }
]

export const aggregatePrnTonnage = async (db) => {
  const pipeline = buildAggregationPipeline()

  const rows = await db
    .collection(PRNS_COLLECTION)
    .aggregate(pipeline)
    .toArray()

  return {
    generatedAt: new Date().toISOString(),
    rows
  }
}
