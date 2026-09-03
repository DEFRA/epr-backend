import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
import { toDateRangeResource } from './registration-resource.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

/**
 * The accreditation as a client receives it, at the collection address and at
 * the member address alike. Both routes project through here, so the item a
 * client reads in a list is the resource it gets when it opens one.
 *
 * It reads its material the way the registration does: the applicant's answer
 * stays in `application`, and the resolved one sits at the top level where it
 * exists at all.
 *
 * @param {Accreditation} accreditation
 */
export function toAccreditationResource(accreditation) {
  const material = resolveDetailedMaterial(accreditation)

  return {
    id: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber ?? null,
    status: accreditation.status,
    ...(material !== null && { material }),
    reprocessingType: accreditation.reprocessingType ?? null,
    dateRange: toDateRangeResource(accreditation),
    application: {
      orgName: accreditation.orgName,
      submittedToRegulator: accreditation.submittedToRegulator,
      material: accreditation.material,
      wasteProcessingType: accreditation.wasteProcessingType
    }
  }
}
