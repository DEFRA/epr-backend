import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { isRegistrationAccredited } from './is-registration-accredited.js'

/**
 * @import { WasteProcessingTypeValue } from '#domain/organisations/model.js'
 */

/**
 * Operator categories for reporting.
 *
 * Combines wasteProcessingType (exporter/reprocessor) with accreditation
 * status to produce a single discriminator. This determines which date
 * fields are used for period discovery and which report sections apply.
 *
 * For accredited reprocessors, the input/output distinction from the
 * spreadsheet PROCESSING_TYPE metadata is lost at the waste record level,
 * but both variants use identical date fields so a single REPROCESSOR
 * mapping suffices.
 */
export const OPERATOR_CATEGORY = Object.freeze({
  EXPORTER: 'EXPORTER',
  EXPORTER_REGISTERED_ONLY: 'EXPORTER_REGISTERED_ONLY',
  REPROCESSOR: 'REPROCESSOR',
  REPROCESSOR_REGISTERED_ONLY: 'REPROCESSOR_REGISTERED_ONLY'
})

/**
 * @typedef {keyof typeof OPERATOR_CATEGORY} OperatorCategory
 */

const OPERATOR_CATEGORY_BY_WASTE_PROCESSING_TYPE = Object.freeze({
  [WASTE_PROCESSING_TYPE.EXPORTER]: {
    accredited: OPERATOR_CATEGORY.EXPORTER,
    registeredOnly: OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY
  },
  [WASTE_PROCESSING_TYPE.REPROCESSOR]: {
    accredited: OPERATOR_CATEGORY.REPROCESSOR,
    registeredOnly: OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY
  }
})

/**
 * Derives the operator category from a registration.
 *
 * @param {{ wasteProcessingType: string, accreditationId?: string, accreditation: { status?: string } | null }} registration
 * @returns {OperatorCategory}
 */
export function getOperatorCategory(registration) {
  const category =
    OPERATOR_CATEGORY_BY_WASTE_PROCESSING_TYPE[
      /** @type {WasteProcessingTypeValue} */ (registration.wasteProcessingType)
    ]

  if (!category) {
    throw new TypeError(
      `Unknown wasteProcessingType: ${registration.wasteProcessingType}`
    )
  }

  return isRegistrationAccredited(registration)
    ? category.accredited
    : category.registeredOnly
}
