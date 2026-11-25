import Joi from 'joi'

import { fetchJson } from '#common/helpers/fetch-json.js'
import { signedHeaders } from '#common/helpers/reg-accred-signed-headers.js'

/** @import { RegAccredApiConfig } from '#common/helpers/reg-accred-signed-headers.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * An overseas site as it stands on an application, selected or not.
 *
 * @typedef {{
 *   siteId: number
 *   orsId: string | null
 *   siteName: string
 *   formattedAddress?: string | null
 *   address?: {
 *     line1?: string | null
 *     line2?: string | null
 *     town?: string | null
 *     country?: string | null
 *   } | null
 *   coordinates?: string | null
 *   selected: boolean
 * }} RegistrationServiceOverseasSite
 */

/**
 * One of a registration's applications, as the registration service's
 * `GET /v1/organisations/{organisationNumber}/registrations/{registrationNumber}`
 * serves it.
 *
 * @typedef {{
 *   year: number
 *   applicationReference?: string
 *   applicationStatus: string
 *   accreditationNumber?: string
 *   overseasSites: RegistrationServiceOverseasSite[]
 * }} RegistrationServiceApplication
 */

const REQUEST_TIMEOUT_MS = 10_000

const nullableString = Joi.string().allow(null)

const overseasSiteSchema = Joi.object({
  siteId: Joi.number().integer().required(),
  orsId: nullableString.required(),
  siteName: Joi.string().required(),
  formattedAddress: nullableString,
  address: Joi.object({
    line1: nullableString,
    line2: nullableString,
    town: nullableString,
    country: nullableString
  })
    .unknown(true)
    .allow(null),
  coordinates: nullableString,
  selected: Joi.boolean().required()
}).unknown(true)

/**
 * The registration service asks callers to ignore fields they do not know, and
 * its application statuses are an open list, so neither fails validation.
 */
const registrationSchema = Joi.object({
  applications: Joi.array()
    .items(
      Joi.object({
        year: Joi.number().integer().required(),
        applicationReference: Joi.string(),
        applicationStatus: Joi.string().required(),
        accreditationNumber: Joi.string(),
        overseasSites: Joi.array().items(overseasSiteSchema).required()
      }).unknown(true)
    )
    .required()
}).unknown(true)

const NOT_FOUND = 404

/**
 * Every application the registration service holds for the registration from
 * 2027 on, whatever its status, or `null` when it holds none.
 *
 * @param {RegAccredApiConfig} config
 * @param {OrganisationNumber} organisationNumber
 * @param {RegistrationNumber} registrationNumber
 * @returns {Promise<RegistrationServiceApplication[] | null>}
 */
export const fetchRegistrationServiceApplications = async (
  config,
  organisationNumber,
  registrationNumber
) => {
  let registration
  try {
    registration = await fetchJson(
      `${config.baseUrl}/v1/organisations/${organisationNumber}/registrations/${encodeURIComponent(registrationNumber)}`,
      {
        headers: { accept: 'application/json', ...signedHeaders(config) },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }
    )
  } catch (error) {
    if (error.output.statusCode === NOT_FOUND) {
      return null
    }
    throw error
  }

  const { value, error } = registrationSchema.validate(registration)
  if (error) {
    throw new Error(
      `The registration service served registration ${registrationNumber} in a shape it does not publish: ${error.message}`
    )
  }
  return value.applications
}
