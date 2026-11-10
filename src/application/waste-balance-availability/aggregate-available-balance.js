import {
  buildEffectiveMaterialStages,
  formatMaterialResults
} from '#application/common/material-aggregation.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'

const ORGANISATIONS_COLLECTION = 'epr-organisations'

const accreditationNumberOfRegistration = {
  $let: {
    vars: {
      accreditation: {
        $arrayElemAt: [
          {
            $filter: {
              input: '$accreditations',
              cond: { $eq: ['$$this.id', '$registrations.accreditationId'] }
            }
          },
          0
        ]
      }
    },
    in: '$$accreditation.accreditationNumber'
  }
}

const buildAccreditedRegistrationStages = () => [
  { $unwind: '$registrations' },
  {
    $match: {
      'registrations.accreditationId': { $exists: true, $ne: null }
    }
  },
  {
    $project: {
      _id: 0,
      registrationNumber: '$registrations.registrationNumber',
      accreditationNumber: accreditationNumberOfRegistration,
      orgData: [
        {
          orgId: '$orgId',
          material: '$registrations.material',
          glassRecyclingProcess: '$registrations.glassRecyclingProcess'
        }
      ]
    }
  }
]

const buildLatestLedgerEventLookupStage = () => ({
  $lookup: {
    from: WASTE_BALANCE_EVENTS_COLLECTION_NAME,
    let: {
      registrationNumber: '$registrationNumber',
      accreditationNumber: '$accreditationNumber'
    },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ['$registrationNumber', '$$registrationNumber'] },
              { $eq: ['$accreditationNumber', '$$accreditationNumber'] }
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
    as: 'latestLedgerEvent'
  }
})

// Mirrors currentWasteBalance
// (waste-balances/application/current-waste-balance.js): the latest ledger
// event's closing balance is the source of truth, resolving to zero when the
// ledger is empty.
const buildLedgerAvailableAmountStage = () => ({
  $addFields: {
    availableAmount: {
      $ifNull: [{ $arrayElemAt: ['$latestLedgerEvent.availableAmount', 0] }, 0]
    }
  }
})

const buildAggregationPipeline = () => [
  ...buildAccreditedRegistrationStages(),
  ...buildEffectiveMaterialStages(),
  buildLatestLedgerEventLookupStage(),
  buildLedgerAvailableAmountStage(),
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
    .collection(ORGANISATIONS_COLLECTION)
    .aggregate(pipeline)
    .toArray()

  const { materials, total } = formatMaterialResults(results, 'availableAmount')

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
