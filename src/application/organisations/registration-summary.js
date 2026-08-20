import Joi from 'joi'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

/** @import { Registration } from '#domain/organisations/registration.js' */

/**
 * @typedef {{
 *   id: string;
 *   registrationNumber: string | null;
 *   status: string;
 *   material: string;
 *   processingType: string;
 *   site: string | null;
 * }} RegistrationSummary
 */

/**
 * The wire shape of a RegistrationSummary. Every route that serves the summary
 * validates against this one schema, so the two cannot drift apart.
 */
export const registrationSummarySchema = Joi.object({
  id: Joi.string().required(),
  registrationNumber: Joi.string().allow(null).required(),
  status: Joi.string().required(),
  material: Joi.string().required(),
  processingType: Joi.string().required(),
  site: Joi.string().allow(null).required()
})

/**
 * Projects a registration onto the fields every regulator and admin page shows
 * above its own content: what the registration covers, and where.
 *
 * @param {Registration} registration
 * @returns {RegistrationSummary}
 */
export function toRegistrationSummary(registration) {
  return {
    id: registration.id,
    registrationNumber: registration.registrationNumber ?? null,
    status: registration.status,
    material: registration.material,
    processingType: getProcessingType(registration),
    site: isExporter(registration)
      ? null
      : (registration.site.address.line1 ?? null)
  }
}

/**
 * @typedef {{ town: string | null; postcode: string | null }} SiteLocation
 */

/**
 * The wire shape of a SiteLocation.
 */
export const siteLocationSchema = Joi.object({
  town: Joi.string().allow(null).required(),
  postcode: Joi.string().allow(null).required()
})

/**
 * Names the site by where it is, for a page whose heading gives the town and
 * postcode rather than the first line of the address. An exporter processes
 * waste abroad and holds no site here, so it has no location to give.
 *
 * @param {Registration} registration
 * @returns {SiteLocation}
 */
export function toSiteLocation(registration) {
  if (isExporter(registration)) {
    return { town: null, postcode: null }
  }

  const { address } = registration.site
  return {
    town: address.town ?? null,
    postcode: address.postcode ?? null
  }
}

/**
 * @param {{ wasteProcessingType: string }} registration
 * @returns {boolean}
 */
function isExporter(registration) {
  return registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
}

/**
 * @param {{ wasteProcessingType: string, reprocessingType?: string | null }} registration
 * @returns {string}
 */
function getProcessingType(registration) {
  if (isExporter(registration)) {
    return WASTE_PROCESSING_TYPE.EXPORTER
  }
  return registration.reprocessingType
    ? `${WASTE_PROCESSING_TYPE.REPROCESSOR} - ${registration.reprocessingType}`
    : WASTE_PROCESSING_TYPE.REPROCESSOR
}
