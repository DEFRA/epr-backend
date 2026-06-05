import {
  buildEffectiveMaterialStages,
  formatMaterialResults
} from '#application/common/material-aggregation.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/stream-mongodb.js'

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const WASTE_BALANCES_COLLECTION = 'waste-balances'
const ACCREDITATION_ID_FIELD = '$accreditationId'

const buildMaterialLookupStage = () => ({
  $lookup: {
    from: ORGANISATIONS_COLLECTION,
    let: {
      orgId: { $toObjectId: '$organisationId' },
      accId: ACCREDITATION_ID_FIELD
    },
    pipeline: [
      { $match: { $expr: { $eq: ['$_id', '$$orgId'] } } },
      { $unwind: '$registrations' },
      {
        $match: {
          $expr: { $eq: ['$registrations.accreditationId', '$$accId'] }
        }
      },
      {
        $project: {
          orgId: '$orgId',
          material: '$registrations.material',
          glassRecyclingProcess: '$registrations.glassRecyclingProcess'
        }
      }
    ],
    as: 'orgData'
  }
})

const buildLatestStreamEventLookupStage = () => ({
  $lookup: {
    from: WASTE_BALANCE_EVENTS_COLLECTION_NAME,
    let: { regId: '$registrationId', accId: ACCREDITATION_ID_FIELD },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ['$registrationId', '$$regId'] },
              { $eq: [ACCREDITATION_ID_FIELD, '$$accId'] }
            ]
          }
        }
      },
      { $sort: { number: -1 } },
      { $limit: 1 },
      {
        $project: { _id: 0, availableAmount: '$closingBalance.availableAmount' }
      }
    ],
    as: 'latestStreamEvent'
  }
})

// Mirrors resolveBalanceAmounts
// (waste-balances/repository/resolve-balance-amounts.js): the latest stream
// closing balance is the source of truth, resolving to zero when the stream is
// empty.
const buildStreamAvailableAmountStage = () => ({
  $addFields: {
    availableAmount: {
      $ifNull: [{ $arrayElemAt: ['$latestStreamEvent.availableAmount', 0] }, 0]
    }
  }
})

const buildAggregationPipeline = () => [
  buildMaterialLookupStage(),
  ...buildEffectiveMaterialStages(),
  buildLatestStreamEventLookupStage(),
  buildStreamAvailableAmountStage(),
  {
    $group: {
      _id: '$effectiveMaterial',
      availableAmount: { $sum: '$availableAmount' }
    }
  },
  { $sort: { _id: 1 } }
]

export const aggregateAvailableBalance = async (db) => {
  const pipeline = buildAggregationPipeline()

  const results = await db
    .collection(WASTE_BALANCES_COLLECTION)
    .aggregate(pipeline)
    .toArray()

  const { materials, total } = formatMaterialResults(results, 'availableAmount')

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
