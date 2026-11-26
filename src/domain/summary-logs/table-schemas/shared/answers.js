import { isFilled } from '../validation-pipeline.js'
import { DROPDOWN_PLACEHOLDER, YES_NO_VALUES } from './joi-messages.js'

const YES = YES_NO_VALUES.YES.toLowerCase()
const NO = YES_NO_VALUES.NO.toLowerCase()

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export const isAnswered = (value) => isFilled(value, DROPDOWN_PLACEHOLDER)

/**
 * Whether a Yes/No field answers Yes, ignoring case and surrounding whitespace.
 *
 * Shared so that everything reading the same column — waste-balance
 * classification and report aggregation alike — agrees on what Yes means.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isYes(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === YES
}

/**
 * Whether a Yes/No field answers No, read as {@link isYes} reads Yes.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNo(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === NO
}
