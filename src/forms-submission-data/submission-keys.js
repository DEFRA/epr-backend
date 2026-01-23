import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { siteKey } from '#formsubmission/parsing-common/site.js'

/**
 * @import {Registration, Accreditation, RegistrationOrAccreditation} from './types.js'
 */

const KEY_DELIMITER = '::'

/**
 * Generates a unique key for a registration or accreditation based on waste processing type,
 * material, site (for reprocessors), and optional reprocessing type.
 *
 * The key format is:
 * - For exporters: `{wasteProcessingType}::{material}[::{reprocessingType}]`
 * - For reprocessors: `{wasteProcessingType}::{material}::{normalizedPostcode}[::{reprocessingType}]`
 *
 * @param {RegistrationOrAccreditation} item - Registration or accreditation object
 * @returns {string} key for registration or accreditation
 */
export function getRegAccKey(item) {
  return Object.values(getRegAccKeyValuePairs(item)).join(KEY_DELIMITER)
}

/**
 * Extracts the identity fields as key-value pairs.
 * Uses conditional spreading for a cleaner, declarative structure.
 */
function getRegAccKeyValuePairs(item) {
  return {
    wasteProcessingType: item.wasteProcessingType,
    material: item.material,
    ...(item.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR && {
      postcode: siteKey(item.site)
    }),
    ...(item.reprocessingType && {
      reprocessingType: item.reprocessingType
    })
  }
}

/**
 * Check if an accreditation matches a registration based on type, material, and site
 * @param {Accreditation} accreditation - The accreditation to check
 * @param {Registration} registration - The registration to match against
 * @returns {boolean} True if the accreditation matches the registration
 */
export function isAccreditationForRegistration(accreditation, registration) {
  const accFields = getRegAccKeyValuePairs(accreditation)
  const regFields = getRegAccKeyValuePairs(registration)

  const accKeys = Object.keys(accFields)
  const regKeys = Object.keys(regFields)

  return (
    accKeys.length === regKeys.length &&
    accKeys.every(
      (key) => accFields[key] !== undefined && accFields[key] === regFields[key]
    )
  )
}
