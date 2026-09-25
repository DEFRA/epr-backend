import { ObjectId } from 'mongodb'
import {
  GLASS_RECYCLING_PROCESS,
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

/** @import { GlassRecyclingProcess, Material, TonnageBand } from '#domain/organisations/model.js' */

/**
 * What an accredited operator is accredited for, where a test needs other than
 * plastic.
 *
 * @typedef {Object} AccreditedFor
 * @property {Material} [material]
 * @property {TonnageBand} [tonnageBand]
 */

/**
 * @param {Material} material
 * @returns {material is GlassRecyclingProcess}
 */
const isGlass = (material) =>
  Object.values(GLASS_RECYCLING_PROCESS).some((process) => process === material)

/**
 * How a registration or accreditation stores the material.
 *
 * @param {Material} material
 */
export const storedMaterial = (material) =>
  isGlass(material)
    ? { material: MATERIAL.GLASS, glassRecyclingProcess: [material] }
    : { material, glassRecyclingProcess: null }

/**
 * An approved reprocessor accredited for 2026, for plastic unless told
 * otherwise, written through the organisations fixture so the document read
 * back is one the write schema accepts.
 *
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @param {import('#domain/organisations/model.js').RegulatorValue} [regulator] - who the registration and accreditation were submitted to
 * @param {AccreditedFor} [accreditedFor]
 * @returns {Promise<{ organisationId: string, registrationId: string }>}
 */
export const insertAccreditedOperator = async (
  organisationsRepository,
  regulator = REGULATOR.EA,
  { material = MATERIAL.PLASTIC, tonnageBand } = {}
) => {
  const accreditationId = new ObjectId().toString()
  const accredited = {
    ...storedMaterial(material),
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    submittedToRegulator: regulator
  }
  const registration = buildRegistration({ accreditationId, ...accredited })
  const accreditation = buildAccreditation({
    id: accreditationId,
    ...accredited
  })
  if (tonnageBand) {
    accreditation.prnIssuance = { ...accreditation.prnIssuance, tonnageBand }
  }
  const organisation = await buildApprovedOrg(
    organisationsRepository,
    { registrations: [registration], accreditations: [accreditation] },
    { VALID_FROM: '2026-01-01', VALID_TO: '2026-12-31' }
  )

  return { organisationId: organisation.id, registrationId: registration.id }
}
