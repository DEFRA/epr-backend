import { PROCESSING_TYPES } from './meta-fields.js'
import { MIN_TEMPLATE_VERSIONS } from './table-schemas/index.js'

/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { ProcessingType } from './meta-fields.js' */

/**
 * @param {Registration} registration
 * @returns {ProcessingType}
 */
const processingTypeFor = (registration) => {
  const accredited = Boolean(registration.accreditation?.accreditationNumber)

  if (registration.wasteProcessingType === 'exporter') {
    return accredited
      ? PROCESSING_TYPES.EXPORTER
      : PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
  }

  if (!accredited) {
    return PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
  }

  return registration.reprocessingType === 'output'
    ? PROCESSING_TYPES.REPROCESSOR_OUTPUT
    : PROCESSING_TYPES.REPROCESSOR_INPUT
}

/**
 * The summary log template a registration's operator would fill in today:
 * its processing type and the current version of that template.
 *
 * @param {Registration} registration
 * @returns {{ PROCESSING_TYPE: ProcessingType, TEMPLATE_VERSION: number }}
 */
export const templateForRegistration = (registration) => {
  const PROCESSING_TYPE = processingTypeFor(registration)

  return {
    PROCESSING_TYPE,
    TEMPLATE_VERSION: MIN_TEMPLATE_VERSIONS[PROCESSING_TYPE]
  }
}
