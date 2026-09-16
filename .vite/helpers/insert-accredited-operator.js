import { ObjectId } from 'mongodb'
import {
  MATERIAL,
  REGULATOR,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'

/**
 * An approved plastic reprocessor accredited for 2026, written through the
 * organisations fixture so the document read back is one the write schema
 * accepts.
 *
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @param {import('#domain/organisations/model.js').RegulatorValue} [regulator] - who holds the accreditation
 * @returns {Promise<{ organisationId: string, registrationId: string }>}
 */
export const insertAccreditedOperator = async (
  organisationsRepository,
  regulator = REGULATOR.EA
) => {
  const accreditationId = new ObjectId().toString()
  const registration = buildRegistration({
    accreditationId,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    glassRecyclingProcess: null,
    submittedToRegulator: regulator
  })
  const accreditation = buildAccreditation({
    id: accreditationId,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    glassRecyclingProcess: null,
    submittedToRegulator: regulator
  })
  const organisation = await buildApprovedOrg(
    organisationsRepository,
    { registrations: [registration], accreditations: [accreditation] },
    { VALID_FROM: '2026-01-01', VALID_TO: '2026-12-31' }
  )

  return { organisationId: organisation.id, registrationId: registration.id }
}
