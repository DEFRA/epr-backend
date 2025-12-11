/**
 * European Waste Catalogue (EWC) codes
 *
 * Valid EWC codes for waste classification. These codes are defined by
 * EU legislation and used to categorize waste types.
 *
 * Format: "XX XX XX" with optional asterisk suffix for hazardous waste
 * Example: "03 03 08" (non-hazardous) or "01 03 04*" (hazardous)
 */
import ewcCodesData from './data/ewc-codes.json' with { type: 'json' }

export const EWC_CODES = Object.freeze(ewcCodesData)
