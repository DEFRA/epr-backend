import {
  PROCESSING_TYPE_TO_REPROCESSING_TYPE,
  PROCESSING_TYPE_TO_WASTE_PROCESSING_TYPE,
  PROCESSING_TYPES,
  REGISTERED_ONLY_PROCESSING_TYPES
} from './meta-fields.js'
import { getTemplate, hasTemplate } from './table-schemas/index.js'
import { DEFAULT_TEMPLATE_YEAR } from './template-year.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { ProcessingType } from './meta-fields.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */

/**
 * The parts of a registration that decide its template.
 *
 * @typedef {{
 *   wasteProcessingType: Registration['wasteProcessingType'],
 *   reprocessingType?: Registration['reprocessingType'],
 *   accreditation: Pick<Accreditation, 'accreditationNumber'> | null
 * }} TemplateRegistration
 */

/**
 * The one processing type the validator accepts for a registration, judged by
 * the same maps it judges an upload's PROCESSING_TYPE against.
 *
 * @param {TemplateRegistration} registration
 * @returns {ProcessingType | undefined}
 */
const processingTypeFor = (registration) => {
  const registeredOnly = !registration.accreditation?.accreditationNumber

  return Object.values(PROCESSING_TYPES).find(
    (processingType) =>
      PROCESSING_TYPE_TO_WASTE_PROCESSING_TYPE[processingType] ===
        registration.wasteProcessingType &&
      REGISTERED_ONLY_PROCESSING_TYPES.has(processingType) === registeredOnly &&
      (PROCESSING_TYPE_TO_REPROCESSING_TYPE[processingType] ??
        registration.reprocessingType) === registration.reprocessingType
  )
}

/**
 * The summary log template a registration's operator would fill in for a year:
 * its processing type and the lowest version of that year's template the
 * validator accepts. A year with no template gets the DEFAULT_TEMPLATE_YEAR
 * template, which validation then rejects as a template year mismatch.
 *
 * @param {TemplateRegistration} registration
 * @param {Year} year
 * @returns {{ PROCESSING_TYPE: ProcessingType, TEMPLATE_VERSION: number }}
 */
export const templateForRegistration = (registration, year) => {
  const PROCESSING_TYPE = processingTypeFor(registration)
  if (!PROCESSING_TYPE) {
    throw new Error('No summary log template fits the registration')
  }

  return {
    PROCESSING_TYPE,
    TEMPLATE_VERSION: getTemplate(
      hasTemplate(year, PROCESSING_TYPE) ? year : DEFAULT_TEMPLATE_YEAR,
      PROCESSING_TYPE
    ).minVersion
  }
}
