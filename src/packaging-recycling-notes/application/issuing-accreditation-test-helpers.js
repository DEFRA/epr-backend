import { toYear } from '#common/helpers/dates/year.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  createInMemoryOrganisationReadRepository,
  accreditationsByYear,
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/test-support.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { AccreditationStatus, Registration } from '#organisation-read-model/vocabulary.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/index.js' */

/**
 * @typedef {{
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber,
 *   accreditationNumber: AccreditationNumber,
 *   year?: Year,
 *   status?: AccreditationStatus,
 *   wasteProcessingType?: 'reprocessor' | 'exporter',
 *   reprocessingType?: 'input' | 'output',
 *   withAccreditation?: boolean,
 *   alsoHeld?: Array<{ accreditationNumber: AccreditationNumber, year: Year }>
 * }} HeldAccreditation
 */

/**
 * @param {HeldAccreditation} held
 * @returns {Registration}
 */
const heldRegistration = ({
  accreditationNumber,
  year = toYear(2026),
  status = 'approved',
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType = 'input',
  withAccreditation = true,
  alsoHeld = []
}) => {
  const accreditations = [{ accreditationNumber, year }, ...alsoHeld].map(
    (held) => ({
      ...held,
      status: { ...approvedStatusFrom(`${held.year}-01-01`), current: status }
    })
  )
  if (wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return buildReadExporterRegistration({
      accreditations: withAccreditation
        ? accreditationsByYear(
            ...accreditations.map(buildReadExporterAccreditation)
          )
        : {}
    })
  }
  return buildReadReprocessorRegistration({
    material: 'plastic',
    reprocessingType,
    accreditations: withAccreditation
      ? accreditationsByYear(...accreditations.map(buildReadAccreditation))
      : {}
  })
}

/**
 * An organisation read repository serving one organisation, with one
 * registration holding an accreditation for one year, and for each of
 * `alsoHeld` another, for tests of PRN code that reads the accreditation a PRN
 * was raised against.
 *
 * @param {HeldAccreditation} held
 * @returns {OrganisationReadRepository}
 */
export const readRepositoryHolding = (held) =>
  createInMemoryOrganisationReadRepository([
    buildReadOrganisation({
      organisationNumber: held.organisationNumber,
      name: 'Test Reprocessor',
      registrations: { [held.registrationNumber]: heldRegistration(held) }
    })
  ])()
