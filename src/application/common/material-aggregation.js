import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { toNumber } from '#common/helpers/decimal-utils.js'
import { getMonthsOfYear } from '#common/helpers/date-formatter.js'
import { capitalize } from '#common/helpers/formatters.js'

/** @import { Year } from '#common/helpers/dates/year.js' */

export const formatMaterialResults = (results, valueField) => {
  const materialMap = new Map(
    results.map((result) => [result.material, toNumber(result[valueField])])
  )

  const materials = TONNAGE_MONITORING_MATERIALS.map((material) => ({
    material,
    [valueField]: materialMap.get(material) || 0
  }))

  const total = materials.reduce((sum, item) => sum + item[valueField], 0)

  return { materials, total }
}

/**
 * Each material and operator type's tonnage for every month of the year the
 * report shows, zero where none was recorded.
 *
 * @param {Array<{ material: string, year: number, monthNumber: number, type: string, totalTonnage: number }>} results
 * @param {Year} year
 */
export const formatTonnageMonitoringResults = (results, year) => {
  const resultMap = new Map(
    results.map((r) => [
      `${r.material}-${r.year}-${r.monthNumber}-${r.type}`,
      toNumber(r.totalTonnage)
    ])
  )
  const months = getMonthsOfYear(year)
  const types = Object.values(WASTE_PROCESSING_TYPE).map((type) =>
    capitalize(type)
  )

  const materials = TONNAGE_MONITORING_MATERIALS.flatMap((material) =>
    types.map((type) => ({
      material,
      year,
      type,
      months: months.map(({ monthNumber, month }) => ({
        month,
        tonnage:
          resultMap.get(`${material}-${year}-${monthNumber}-${type}`) || 0
      }))
    }))
  ).sort(
    (a, b) =>
      b.type.localeCompare(a.type) || a.material.localeCompare(b.material)
  )

  const total = materials.reduce(
    (sum, item) => sum + item.months.reduce((s, m) => s + m.tonnage, 0),
    0
  )

  return { materials, total }
}
