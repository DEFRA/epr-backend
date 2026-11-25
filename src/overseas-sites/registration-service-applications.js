import Boom from '@hapi/boom'
import Joi from 'joi'

import { fetchJson } from '#common/helpers/fetch-json.js'
import { regAccredRequestOptions } from '#common/helpers/reg-accred-api.js'

/** @import { RegAccredApiConfig } from '#common/helpers/reg-accred-api.js' */
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

/**
 * The registration numbers the registration service accepts in a path. It
 * refuses any other with a 400, and can hold no application for one.
 */
const SERVABLE_REGISTRATION_NUMBER = /^[A-Za-z0-9_-]{1,40}$/

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
 * its application statuses are an open list, so neither fails validation. The
 * registration must be the one asked for.
 */
const registrationSchema = Joi.object({
  organisationNumber: Joi.number()
    .valid(Joi.ref('$organisationNumber'))
    .required(),
  registrationNumber: Joi.string()
    .valid(Joi.ref('$registrationNumber'))
    .required(),
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
    .min(1)
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
  if (!SERVABLE_REGISTRATION_NUMBER.test(registrationNumber)) {
    return null
  }

  let registration
  try {
    registration = await fetchJson(
      `${config.baseUrl}/v1/organisations/${organisationNumber}/registrations/${registrationNumber}`,
      regAccredRequestOptions(config)
    )
  } catch (failure) {
    if (Boom.isBoom(failure, NOT_FOUND)) {
      return null
    }
    throw failure
  }

  const { value, error } = registrationSchema.validate(registration, {
    context: {
      organisationNumber: Number(organisationNumber),
      registrationNumber
    }
  })
  if (error) {
    throw new Error(
      `The registration service served registration ${registrationNumber} in a shape it does not publish: ${error.message}`
    )
  }
  return value.applications
}
