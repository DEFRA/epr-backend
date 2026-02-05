import { randomInt } from 'node:crypto'

import { REGULATOR } from '#domain/organisations/model.js'

/**
 * PRN number format: XXNNnnnnn
 * - Position 1: Agency code [E, N, S, W]
 * - Position 2: Operator type [R = Reprocessor, X = Exporter]
 * - Positions 3-4: 2-digit accreditation year (hardcoded to 26 for 2026)
 * - Positions 5-9: 5-digit random number (00000-99999)
 */

export const AGENCY_CODE = Object.freeze({
  [REGULATOR.EA]: 'E',
  [REGULATOR.NIEA]: 'N',
  [REGULATOR.SEPA]: 'S',
  [REGULATOR.NRW]: 'W'
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
 * @param {string} params.regulator - The regulator (ea, sepa, nrw, niea)
 * @param {boolean} params.isExport - True for exporter, false for reprocessor
 * @param {string} [params.suffix] - Optional single character suffix (A-Z) for collision avoidance
 * @returns {string} PRN number in format XXNNnnnnn or XXNNnnnnnX (e.g. ER2612345 or ER2612345A)
 * @throws {Error} If regulator is unknown
 */
export function generatePrnNumber({ regulator, isExport, suffix }) {
  const agencyCode = AGENCY_CODE[regulator]
  if (!agencyCode) {
    throw new Error(`Unknown regulator: ${regulator}`)
  }

  const operatorTypeCode = isExport
    ? OPERATOR_TYPE_CODE.EXPORTER
    : OPERATOR_TYPE_CODE.REPROCESSOR

  const randomSuffix = randomInt(RANDOM_SUFFIX_RANGE)
  const paddedSuffix = String(randomSuffix).padStart(RANDOM_SUFFIX_PADDING, '0')

  const base = `${agencyCode}${operatorTypeCode}${ACCREDITATION_YEAR}${paddedSuffix}`

  return suffix ? `${base}${suffix}` : base
}
