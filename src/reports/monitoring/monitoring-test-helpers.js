import {
  ACCREDITATION_STATUS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

/**
 * @import { Registration } from '#domain/organisations/registration.js'
 */

/**
 * A registration as the monitoring diagnostics see it. Defaults to the one they
 * cover — an exporter whose accreditation is live — so a test names only the
 * part it is varying.
 *
 * @param {{
 *   wasteProcessingType?: string,
 *   accreditationStatus?: string | null,
 *   accreditationId?: string | null
 * }} [options]
 * @returns {Registration}
 */
export const buildExporterRegistration = ({
  wasteProcessingType = WASTE_PROCESSING_TYPE.EXPORTER,
  accreditationStatus = ACCREDITATION_STATUS.APPROVED,
  accreditationId = null
} = {}) =>
  /** @type {Registration} */ (
    /** @type {unknown} */ ({
      wasteProcessingType,
      accreditation: accreditationStatus
        ? { status: accreditationStatus }
        : null,
      accreditationId
    })
  )
