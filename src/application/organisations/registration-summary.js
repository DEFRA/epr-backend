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
  const isExporter =
    registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER

  return {
    id: registration.id,
    registrationNumber: registration.registrationNumber ?? null,
    status: registration.status,
    material: registration.material,
    processingType: getProcessingType(registration),
    site: isExporter ? null : (registration.site.address.line1 ?? null)
  }
}

/**
 * @param {{ wasteProcessingType: string, reprocessingType?: string | null }} registration
 * @returns {string}
 */
function getProcessingType(registration) {
  if (registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return WASTE_PROCESSING_TYPE.EXPORTER
  }
  return registration.reprocessingType
    ? `${WASTE_PROCESSING_TYPE.REPROCESSOR} - ${registration.reprocessingType}`
    : WASTE_PROCESSING_TYPE.REPROCESSOR
}
