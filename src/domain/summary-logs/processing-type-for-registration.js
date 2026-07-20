import {
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { PROCESSING_TYPES } from './meta-fields.js'

/**
 * @import {ProcessingType} from './meta-fields.js'
 * @import {Registration} from '#domain/organisations/registration.js'
 */

const ACCREDITED_REPROCESSOR_TEMPLATES = Object.freeze({
  [REPROCESSING_TYPE.INPUT]: PROCESSING_TYPES.REPROCESSOR_INPUT,
  [REPROCESSING_TYPE.OUTPUT]: PROCESSING_TYPES.REPROCESSOR_OUTPUT
})

const REGISTERED_ONLY_TEMPLATES = Object.freeze({
  [WASTE_PROCESSING_TYPE.EXPORTER]: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
  [WASTE_PROCESSING_TYPE.REPROCESSOR]:
    PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
})

const WASTE_PROCESSING_TYPES_WITH_TEMPLATES = new Set(
  Object.keys(REGISTERED_ONLY_TEMPLATES)
)

/**
 * The summary-log template a registration reports under. This is the inverse of
 * the `PROCESSING_TYPE_TO_*` maps: a template names one waste processing type
 * and, for reprocessors, one reprocessing type, so the registration's own
 * properties name the template back.
 *
 * A registration without an accreditation reports under the registered-only
 * variant, which is why the accreditation is an input: the same reprocessor
 * reports under `REPROCESSOR_INPUT` once accredited and
 * `REPROCESSOR_REGISTERED_ONLY` before then. One registered-only template
 * serves both reprocessing types, so `reprocessingType` is only consulted for
 * an accredited reprocessor — and is required there, since without it no
 * template can be named.
 *
 * @param {Pick<Registration, 'wasteProcessingType' | 'reprocessingType'>} registration
 * @param {{ accredited: boolean }} context
 * @returns {ProcessingType}
 */
export const processingTypeForRegistration = (
  { wasteProcessingType, reprocessingType },
  { accredited }
) => {
  if (!WASTE_PROCESSING_TYPES_WITH_TEMPLATES.has(wasteProcessingType)) {
    throw new Error(
      `No summary log template for waste processing type: ${wasteProcessingType}`
    )
  }

  if (!accredited) {
    return REGISTERED_ONLY_TEMPLATES[wasteProcessingType]
  }

  if (wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return PROCESSING_TYPES.EXPORTER
  }

  const template =
    reprocessingType && ACCREDITED_REPROCESSOR_TEMPLATES[reprocessingType]
  if (!template) {
    throw new Error(
      'Accredited reprocessor registration has no reprocessingType, so names no summary log template'
    )
  }
  return template
}
