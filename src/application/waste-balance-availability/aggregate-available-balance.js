import {
  buildEffectiveMaterialStages,
  formatMaterialResults
} from '#application/common/material-aggregation.js'

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const WASTE_BALANCES_COLLECTION = 'waste-balances'

const buildMaterialLookupStage = () => ({
  $lookup: {
    from: ORGANISATIONS_COLLECTION,
    let: {
      orgId: '$organisationId',
      accId: '$accreditationId'
    },
    pipeline: [
      { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$orgId'] } } },
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

const buildAggregationPipeline = () => [
  buildMaterialLookupStage(),
  ...buildEffectiveMaterialStages(),
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
