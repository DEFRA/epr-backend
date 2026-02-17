import {
  MATERIAL,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

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
  {
    $addFields: {
      orgId: { $arrayElemAt: ['$orgData.orgId', 0] },
      material: { $arrayElemAt: ['$orgData.material', 0] },
      glassRecyclingProcess: {
        $arrayElemAt: ['$orgData.glassRecyclingProcess', 0]
      }
    }
  },
  { $match: { orgId: { $nin: TEST_ORGANISATION_IDS } } },
  { $match: { material: { $ne: null } } },
  {
    $addFields: {
      effectiveMaterial: {
        $cond: {
          if: { $eq: ['$material', MATERIAL.GLASS] },
          then: { $arrayElemAt: ['$glassRecyclingProcess', 0] },
          else: '$material'
        }
      }
    }
  },
  {
    $group: {
      _id: '$effectiveMaterial',
      availableAmount: { $sum: '$availableAmount' }
    }
  },
  { $sort: { _id: 1 } }
]

const formatResults = (results) => {
  const allMaterials = TONNAGE_MONITORING_MATERIALS
  const materialAmountMap = new Map(
    results.map((r) => [r._id, r.availableAmount])
  )

  const materials = allMaterials.map((material) => ({
    material,
    availableAmount: materialAmountMap.get(material) || 0
  }))

  const total = materials.reduce((sum, item) => sum + item.availableAmount, 0)

  return { materials, total }
}

export const aggregateAvailableBalance = async (db) => {
  const pipeline = buildAggregationPipeline()

  const results = await db
    .collection(WASTE_BALANCES_COLLECTION)
    .aggregate(pipeline)
    .toArray()

  const { materials, total } = formatResults(results)

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
