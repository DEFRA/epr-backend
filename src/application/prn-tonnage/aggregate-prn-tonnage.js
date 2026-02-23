import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'

const CREATED_STATUSES = [PRN_STATUS.DRAFT, PRN_STATUS.AWAITING_AUTHORISATION]
const ISSUED_STATUSES = [PRN_STATUS.AWAITING_ACCEPTANCE]
const CANCELLED_STATUSES = [
  PRN_STATUS.AWAITING_CANCELLATION,
  PRN_STATUS.CANCELLED
]
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
      createdTonnage: {
        $sum: {
          $cond: [
            { $in: ['$status.currentStatus', CREATED_STATUSES] },
            '$tonnage',
            0
          ]
        }
      },
      issuedTonnage: {
        $sum: {
          $cond: [
            { $in: ['$status.currentStatus', ISSUED_STATUSES] },
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
      tonnageBand: {
        $ifNull: [{ $first: '$orgLookup.tonnageBand' }, null]
      }
    }
  },
  {
    $project: {
      _id: 0,
      organisationName: '$_id.orgName',
      organisationId: '$_id.orgId',
      accreditationNumber: '$_id.accNumber',
      material: '$_id.material',
      tonnageBand: 1,
      createdTonnage: 1,
      issuedTonnage: 1,
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
