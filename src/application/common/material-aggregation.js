import {
  MATERIAL,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { toNumber } from '#common/helpers/decimal-utils.js'
import { getMonthRange } from '#common/helpers/date-formatter.js'
import { capitalize } from '#common/helpers/formatters.js'

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

const getMaterialMonthlyCombinations = () => {
  const monthsByYear = Object.groupBy(getMonthRange(), (m) => m.year)

  return TONNAGE_MONITORING_MATERIALS.flatMap((material) =>
    Object.values(WASTE_PROCESSING_TYPE)
      .map((type) => capitalize(type))
      .flatMap((type) =>
        Object.entries(monthsByYear).map(([year, months]) => ({
          material,
          type,
          year,
          months
        }))
      )
  )
}

export const formatTonnageMonitoringResults = (results) => {
  const resultMap = new Map(
    results.map((r) => [
      `${r.material}-${r.year}-${r.monthNumber}-${r.type}`,
      toNumber(r.totalTonnage)
    ])
  )

  const materials = getMaterialMonthlyCombinations()
    .map(({ material, type, year, months }) => ({
      material,
      year: Number(year),
      type,
      months: months.map(({ monthNumber, month }) => ({
        month,
        tonnage:
          resultMap.get(`${material}-${year}-${monthNumber}-${type}`) || 0
      }))
    }))
    .sort(
      (a, b) =>
        b.year - a.year ||
        b.type.localeCompare(a.type) ||
        a.material.localeCompare(b.material)
    )

  const total = materials.reduce(
    (sum, item) => sum + item.months.reduce((s, m) => s + m.tonnage, 0),
    0
  )

  return { materials, total }
}
