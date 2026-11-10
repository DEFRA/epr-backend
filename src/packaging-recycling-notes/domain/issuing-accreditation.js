import Boom from '@hapi/boom'

import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

/**
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { AppliedForMaterial, GlassRecyclingProcess, RegulatorValue, ReprocessingType, WasteProcessingTypeValue } from '#domain/organisations/model.js'
 * @import { AccreditationNumber } from '#domain/organisations/numbers.js'
 * @import { AccreditationCommon, Registration } from '#organisation-read-model/domain/model.js'
 * @import { AccreditationSnapshot } from './model.js'
 */

/**
 * What the PRN rules read about the accreditation a PRN is raised against.
 *
 * @typedef {{
 *   accreditationNumber: AccreditationNumber,
 *   accreditationYear: Year,
 *   status: AccreditationCommon['status']['current'],
 *   submittedToRegulator: RegulatorValue,
 *   wasteProcessingType: WasteProcessingTypeValue,
 *   reprocessingType?: ReprocessingType,
 *   material: AppliedForMaterial,
 *   glassRecyclingProcess?: GlassRecyclingProcess,
 *   siteAddress?: AccreditationSnapshot['siteAddress']
 * }} IssuingAccreditation
 */

/** @type {ReadonlySet<string>} */
const GLASS_PROCESSES = new Set(Object.values(GLASS_RECYCLING_PROCESS))

/**
 * The read model names a glass registration by its recycling process; a PRN
 * states glass and the process apart.
 *
 * @param {Registration['material']} material
 * @returns {Pick<IssuingAccreditation, 'material' | 'glassRecyclingProcess'>}
 */
const toPrnMaterial = (material) =>
  GLASS_PROCESSES.has(material)
    ? {
        material: MATERIAL.GLASS,
        glassRecyclingProcess: /** @type {GlassRecyclingProcess} */ (material)
      }
    : { material: /** @type {AppliedForMaterial} */ (material) }

/**
 * @param {Registration} registration
 * @returns {Pick<IssuingAccreditation, 'reprocessingType' | 'siteAddress'>}
 */
const reprocessorSite = (registration) => {
  if (registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return {}
  }
  const { address } = registration.site
  if (!('line1' in address)) {
    throw Boom.badImplementation(
      'Reprocessor site address has no line1 and postcode to state on a PRN'
    )
  }
  const { line1, line2, town, county, postcode, country } = address
  return {
    reprocessingType: registration.reprocessingType,
    siteAddress: {
      line1,
      postcode,
      ...(town && { town }),
      ...(line2 && { line2 }),
      ...(county && { county }),
      ...(country && { country })
    }
  }
}

/**
 * @param {Registration} registration - from the organisation read model
 * @param {AccreditationCommon} accreditation - the registration's accreditation for `year`
 * @param {Year} year
 * @returns {IssuingAccreditation}
 */
export const toIssuingAccreditation = (registration, accreditation, year) => ({
  accreditationNumber: accreditation.accreditationNumber,
  accreditationYear: year,
  status: accreditation.status.current,
  submittedToRegulator: registration.submittedToRegulator.code,
  wasteProcessingType: registration.wasteProcessingType,
  ...toPrnMaterial(registration.material),
  ...reprocessorSite(registration)
})
