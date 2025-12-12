/**
 * Basel Convention export codes
 *
 * Valid Basel codes for classifying waste exports under the Basel Convention.
 * These codes categorize waste by type for international shipment controls.
 *
 * Format: Letter prefix (A, B, G, Y, etc.) followed by numeric identifier
 * - B codes: Green list wastes (generally non-hazardous)
 * - A codes: Amber list wastes (require prior informed consent)
 * - G codes: Additional green list codes
 * - Y codes: Wastes requiring special consideration
 */
import baselCodesData from './data/basel-codes.json' with { type: 'json' }

export const BASEL_CODES = Object.freeze(baselCodesData)
