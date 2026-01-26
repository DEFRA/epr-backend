/**
 * PRN (Packaging Recycling Note) number format generation and validation
 *
 * Format: XXNNnnnnnX (e.g. ER2625468U)
 * - Position 1: Agency code (E=England, N=Northern Ireland, S=Scotland, W=Wales)
 * - Position 2: Issuer type (R=Reprocessor, X=Exporter)
 * - Positions 3-4: Accreditation year (e.g. 26 for 2026)
 * - Positions 5-9: Sequential number (00001-99999)
 * - Position 10: Check character (A-Z)
 */

import { NATION, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

/**
 * Maps nation values to agency codes
 * @type {Record<string, string>}
 */
export const AGENCY_CODE = Object.freeze({
  [NATION.ENGLAND]: 'E',
  [NATION.NORTHERN_IRELAND]: 'N',
  [NATION.SCOTLAND]: 'S',
  [NATION.WALES]: 'W'
})

/**
 * Maps waste processing types to issuer type codes
 * @type {Record<string, string>}
 */
export const ISSUER_TYPE_CODE = Object.freeze({
  [WASTE_PROCESSING_TYPE.REPROCESSOR]: 'R',
  [WASTE_PROCESSING_TYPE.EXPORTER]: 'X'
})

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const ALPHABET_LENGTH = 26
const SEQUENCE_MAX = 99999
const SEQUENCE_PADDING = 5
const YEAR_PADDING = 2
const CENTURY_DIVISOR = 100

/**
 * Calculates the check character for a PRN number using a weighted sum algorithm.
 *
 * The algorithm assigns weights to each position and sums the product of
 * character values and weights. The check character is determined by
 * taking the sum modulo 26 and mapping to A-Z.
 *
 * @param {string} agencyCode - Single character agency code (E/N/S/W)
 * @param {string} issuerTypeCode - Single character issuer type (R/X)
 * @param {number} year - Two-digit year (e.g. 26 for 2026)
 * @param {number} sequenceNumber - Sequential number (1-99999)
 * @returns {string} Single character check character (A-Z)
 */
export function calculateCheckCharacter(
  agencyCode,
  issuerTypeCode,
  year,
  sequenceNumber
) {
  // Convert to string representation for consistent processing
  const yearStr = String(year).padStart(YEAR_PADDING, '0')
  const seqStr = String(sequenceNumber).padStart(SEQUENCE_PADDING, '0')
  const baseString = `${agencyCode}${issuerTypeCode}${yearStr}${seqStr}`

  // Weights for each position (1-9)
  const weights = [7, 3, 1, 7, 3, 1, 7, 3, 1]

  let sum = 0
  for (let i = 0; i < baseString.length; i++) {
    const char = baseString[i]
    // For letters, use position in alphabet (A=0, B=1, etc.)
    // For digits, use the numeric value
    const value = char >= 'A' ? char.charCodeAt(0) - 'A'.charCodeAt(0) : +char
    sum += value * weights[i]
  }

  return ALPHABET[sum % ALPHABET_LENGTH]
}

/**
 * Generates a PRN number in the standard format
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.nation - Nation value from NATION enum
 * @param {string} params.wasteProcessingType - Processing type from WASTE_PROCESSING_TYPE enum
 * @param {number} params.year - Full year (e.g. 2026) or two-digit year (e.g. 26)
 * @param {number} params.sequenceNumber - Sequential number (1-99999)
 * @returns {string} Formatted PRN number (e.g. 'ER2625468U')
 * @throws {Error} If parameters are invalid
 */
export function generatePrnNumber({
  nation,
  wasteProcessingType,
  year,
  sequenceNumber
}) {
  const agencyCode = AGENCY_CODE[nation]
  if (!agencyCode) {
    throw new Error(`Invalid nation: ${nation}`)
  }

  const issuerTypeCode = ISSUER_TYPE_CODE[wasteProcessingType]
  if (!issuerTypeCode) {
    throw new Error(`Invalid waste processing type: ${wasteProcessingType}`)
  }

  if (sequenceNumber < 1 || sequenceNumber > SEQUENCE_MAX) {
    throw new Error(
      `Sequence number must be between 1 and ${SEQUENCE_MAX}, got: ${sequenceNumber}`
    )
  }

  // Convert full year to two-digit year if needed
  const twoDigitYear = year >= CENTURY_DIVISOR ? year % CENTURY_DIVISOR : year

  const checkChar = calculateCheckCharacter(
    agencyCode,
    issuerTypeCode,
    twoDigitYear,
    sequenceNumber
  )

  const yearStr = String(twoDigitYear).padStart(YEAR_PADDING, '0')
  const seqStr = String(sequenceNumber).padStart(SEQUENCE_PADDING, '0')

  return `${agencyCode}${issuerTypeCode}${yearStr}${seqStr}${checkChar}`
}

/**
 * Regular expression pattern for validating PRN number format
 * Matches: agency(E/N/S/W) + issuer(R/X) + year(2 digits) + sequence(5 digits) + check(A-Z)
 */
export const PRN_NUMBER_PATTERN = /^[ENSW][RX]\d{2}\d{5}[A-Z]$/

/**
 * Validates a PRN number format and check character
 *
 * @param {string} prnNumber - PRN number to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validatePrnNumber(prnNumber) {
  if (!prnNumber || typeof prnNumber !== 'string') {
    return { valid: false, error: 'PRN number is required' }
  }

  if (!PRN_NUMBER_PATTERN.test(prnNumber)) {
    return {
      valid: false,
      error: 'PRN number must match format XXNNnnnnnX (e.g. ER2625468U)'
    }
  }

  // Extract components
  const agencyCode = prnNumber[0]
  const issuerTypeCode = prnNumber[1]
  const year = parseInt(prnNumber.slice(2, 4), 10)
  const sequenceNumber = parseInt(prnNumber.slice(4, 9), 10)
  const providedCheckChar = prnNumber[9]

  // Validate check character
  const expectedCheckChar = calculateCheckCharacter(
    agencyCode,
    issuerTypeCode,
    year,
    sequenceNumber
  )

  if (providedCheckChar !== expectedCheckChar) {
    return {
      valid: false,
      error: `Invalid check character: expected ${expectedCheckChar}, got ${providedCheckChar}`
    }
  }

  return { valid: true }
}

/**
 * Parses a PRN number into its component parts
 *
 * @param {string} prnNumber - PRN number to parse
 * @returns {{ agencyCode: string, issuerTypeCode: string, year: number, sequenceNumber: number, checkCharacter: string } | null}
 *   Parsed components or null if invalid format
 */
export function parsePrnNumber(prnNumber) {
  if (!PRN_NUMBER_PATTERN.test(prnNumber)) {
    return null
  }

  return {
    agencyCode: prnNumber[0],
    issuerTypeCode: prnNumber[1],
    year: parseInt(prnNumber.slice(2, 4), 10),
    sequenceNumber: parseInt(prnNumber.slice(4, 9), 10),
    checkCharacter: prnNumber[9]
  }
}
