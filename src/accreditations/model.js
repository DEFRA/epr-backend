import Joi from 'joi'
import {
  ACCREDITATION_STATUS,
  TONNAGE_BAND
} from '#domain/organisations/model.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { AccreditationStatus, TonnageBand } from '#domain/organisations/model.js' */

/**
 * The scheme year every accreditation held in `epr-organisations` belongs to.
 * Accreditations for later years are held by the registration service, so this
 * service can only answer for this one (ADR 0034).
 */
export const LOCALLY_HELD_YEAR = 2026

/**
 * @typedef {{
 *   fullName: string
 *   email: string
 *   phone?: string
 *   jobTitle?: string
 * }} AccreditationContact
 */

/**
 * An accreditation as REEX reads it from whichever service holds it: the 2026
 * accreditations this service holds, and in time the registration service's
 * 2027 ones, answer in this shape.
 *
 * It carries only what the accreditation itself owns. What it shares with its
 * registration — material, processing type, site, regulator — is read from the
 * registration, and `validTo` is always 31 December of `year`, so neither is
 * repeated here.
 *
 * @typedef {{
 *   id: string
 *   registrationId: string
 *   year: number
 *   status: AccreditationStatus
 *   statusHistory: { status: AccreditationStatus, updatedAt: Date | string }[]
 *   accreditationNumber: string | null
 *   validFrom: string | null
 *   prnIssuance: {
 *     tonnageBand: TonnageBand | null
 *     signatories: AccreditationContact[]
 *   }
 *   submitterContactDetails: AccreditationContact | null
 * }} AccreditationRecord
 */

/**
 * Picks the contact fields, so nothing else a stored user carries reaches the
 * contract.
 *
 * @param {AccreditationContact} user
 * @returns {AccreditationContact}
 */
const toContact = ({ fullName, email, phone, jobTitle }) => ({
  fullName,
  email,
  ...(phone && { phone }),
  ...(jobTitle && { jobTitle })
})

/**
 * Projects an accreditation this service holds into the contract.
 *
 * @param {Accreditation} accreditation
 * @param {string} registrationId - the registration that links to it
 * @returns {AccreditationRecord}
 */
export const toAccreditationRecord = (accreditation, registrationId) => ({
  id: accreditation.id,
  registrationId,
  year: LOCALLY_HELD_YEAR,
  status: accreditation.status,
  statusHistory: accreditation.statusHistory.map(({ status, updatedAt }) => ({
    status,
    updatedAt
  })),
  accreditationNumber: accreditation.accreditationNumber ?? null,
  validFrom: accreditation.validFrom ?? null,
  prnIssuance: {
    tonnageBand: accreditation.prnIssuance?.tonnageBand ?? null,
    signatories: (accreditation.prnIssuance?.signatories ?? []).map(toContact)
  },
  submitterContactDetails: accreditation.submitterContactDetails
    ? toContact(accreditation.submitterContactDetails)
    : null
})

const contactSchema = Joi.object({
  fullName: Joi.string().required(),
  email: Joi.string().required(),
  phone: Joi.string(),
  jobTitle: Joi.string()
})

const statusSchema = Joi.string().valid(...Object.values(ACCREDITATION_STATUS))

export const accreditationRecordSchema = Joi.object({
  id: Joi.string().required(),
  registrationId: Joi.string().required(),
  year: Joi.number().integer().required(),
  status: statusSchema.required(),
  statusHistory: Joi.array()
    .items(
      Joi.object({
        status: statusSchema.required(),
        updatedAt: Joi.date().required()
      })
    )
    .min(1)
    .required(),
  accreditationNumber: Joi.string().allow(null).required(),
  validFrom: Joi.date().allow(null).required(),
  prnIssuance: Joi.object({
    tonnageBand: Joi.string()
      .valid(...Object.values(TONNAGE_BAND))
      .allow(null)
      .required(),
    signatories: Joi.array().items(contactSchema).required()
  }).required(),
  submitterContactDetails: contactSchema.allow(null).required()
}).label('Accreditation')
