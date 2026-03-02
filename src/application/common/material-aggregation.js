import {
  MATERIAL,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { toNumber } from '#common/helpers/decimal-utils.js'

export const buildEffectiveMaterialStages = () => [
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
  }
]

export const formatMaterialResults = (results, valueField) => {
  const materialMap = new Map(
    results.map((result) => [result._id, toNumber(result[valueField])])
  )

  const materials = TONNAGE_MONITORING_MATERIALS.map((material) => ({
    material,
    [valueField]: materialMap.get(material) || 0
  }))

  const total = materials.reduce((sum, item) => sum + item[valueField], 0)

  return { materials, total }
}
