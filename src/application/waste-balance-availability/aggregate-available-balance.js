import {
  buildEffectiveMaterialStages,
  formatMaterialResults
} from '#application/common/material-aggregation.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
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

// Mirrors resolveBalanceAmounts (waste-balances/repository/marker-aware-read.js):
// 'ledger' resolves to the latest stream closing balance (zero when the stream
// is empty); every other marker keeps the document's own availableAmount.
const buildLedgerAwareAvailableAmountStage = () => ({
  $addFields: {
    availableAmount: {
      $cond: {
        if: {
          $eq: ['$canonicalSource', WASTE_BALANCE_CANONICAL_SOURCE.LEDGER]
        },
        then: {
          $ifNull: [
            { $arrayElemAt: ['$latestStreamEvent.availableAmount', 0] },
            0
          ]
        },
        else: '$availableAmount'
      }
    }
  }
})

const buildAggregationPipeline = () => [
  buildMaterialLookupStage(),
  ...buildEffectiveMaterialStages(),
  buildLatestStreamEventLookupStage(),
  buildLedgerAwareAvailableAmountStage(),
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
