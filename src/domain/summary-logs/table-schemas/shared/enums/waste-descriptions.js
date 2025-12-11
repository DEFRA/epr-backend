/**
 * Valid waste descriptions for the DESCRIPTION_WASTE field
 *
 * These are the allowed values for classifying waste received for reprocessing.
 * Material-specific descriptions that align with PRN/PERN categories.
 */
import wasteDescriptionsData from './data/waste-descriptions.json' with { type: 'json' }

export const WASTE_DESCRIPTIONS = Object.freeze(wasteDescriptionsData)
