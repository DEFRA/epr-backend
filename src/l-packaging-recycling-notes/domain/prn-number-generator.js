import { NATION } from '#domain/organisations/model.js'

/**
 * PRN number format: XXNNnnnnn
 * - Position 1: Agency code [E, N, S, W]
 * - Position 2: Operator type [R = Reprocessor, X = Exporter]
 * - Positions 3-4: 2-digit accreditation year (hardcoded to 26 for 2026)
 * - Positions 5-9: 5-digit random number (00000-99999)
 */

export const AGENCY_CODE = Object.freeze({
  [NATION.ENGLAND]: 'E',
  [NATION.NORTHERN_IRELAND]: 'N',
  [NATION.SCOTLAND]: 'S',
  [NATION.WALES]: 'W'
})

export const OPERATOR_TYPE_CODE = Object.freeze({
  REPROCESSOR: 'R',
  EXPORTER: 'X'
})

export const ACCREDITATION_YEAR = '26'

const RANDOM_SUFFIX_RANGE = 100000
const RANDOM_SUFFIX_PADDING = 5

/**
 * Generates a PRN number for a packaging recycling note.
 *
 * @param {Object} params
 * @param {string} params.nation - The nation (england, scotland, wales, northern_ireland)
 * @param {boolean} params.isExport - True for exporter, false for reprocessor
 * @returns {string} PRN number in format XXNNnnnnn (e.g. ER2612345)
 * @throws {Error} If nation is unknown
 */
export function generatePrnNumber({ nation, isExport }) {
  const agencyCode = AGENCY_CODE[nation]
  if (!agencyCode) {
    throw new Error(`Unknown nation: ${nation}`)
  }

  const operatorTypeCode = isExport
    ? OPERATOR_TYPE_CODE.EXPORTER
    : OPERATOR_TYPE_CODE.REPROCESSOR

  const randomSuffix = Math.floor(Math.random() * RANDOM_SUFFIX_RANGE)
  const paddedSuffix = String(randomSuffix).padStart(RANDOM_SUFFIX_PADDING, '0')

  return `${agencyCode}${operatorTypeCode}${ACCREDITATION_YEAR}${paddedSuffix}`
}
