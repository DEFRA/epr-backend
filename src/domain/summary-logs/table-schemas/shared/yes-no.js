import { YES_NO_VALUES } from './joi-messages.js'

const YES = YES_NO_VALUES.YES.toLowerCase()

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
