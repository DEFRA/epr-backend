import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { siteKey } from '#formsubmission/parsing-common/site.js'

/**
 * Structural subset of Registration/Accreditation fields used to build the
 * identity key. Accepts both domain (post-validation) and migration-time
 * (forms-submission-data) shapes, which differ in fields like `status`.
 *
 * @typedef {{
 *   wasteProcessingType: string;
 *   material: string;
 *   site?: object;
 *   reprocessingType?: string;
 *   glassRecyclingProcess?: string[];
 * }} RegAccKeyFields
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
 * @param {RegAccKeyFields} item - Registration or accreditation object
 * @returns {string} key for registration or accreditation
 */
export function getRegAccKey(item) {
  return Object.values(getRegAccKeyValuePairs(item)).join(KEY_DELIMITER)
}

/**
 * Extracts the identity fields as key-value pairs.
 * Uses conditional spreading for a cleaner, declarative structure.
 *
 * @param {RegAccKeyFields} item
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
    }),
    ...(item.material === MATERIAL.GLASS &&
      item.glassRecyclingProcess?.length === 1 && {
        glassRecyclingProcess: item.glassRecyclingProcess[0]
      })
  }
}

/**
 * Check if an accreditation matches a registration based on type, material, and site
 * @param {RegAccKeyFields} accreditation - The accreditation to check
 * @param {RegAccKeyFields} registration - The registration to match against
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
