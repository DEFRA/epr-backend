import { createHmac, randomBytes } from 'node:crypto'
import Joi from 'joi'

import { fetchJson } from '#common/helpers/fetch-json.js'
import { tonnageBandSchema } from '#common/validation/tonnage-band-schema.js'
import { ACCREDITATION_STATUSES } from '#organisation-read-model/domain/model.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { ExternalAccreditation, OnDrop } from './to-read-model.js' */
/** @import { ExternalAccreditationsLoader } from './mongodb-and-reg-accred-api.js' */

/** The only year Reg Accred holds accreditations for. */
export const REG_ACCRED_ACCREDITATION_YEAR = /** @type {Year} */ (2027)

/**
 * @typedef {{
 *   baseUrl: string
 *   clientId: string
 *   sharedSecret: string
 * }} RegAccredApiConfig
 */

/**
 * An accreditation as `GET /v1/accreditations` serves it, once validated.
 *
 * @typedef {{
 *   organisationNumber: number
 *   registrationNumber: string
 *   accreditationNumber: string
 *   accreditationYear: number
 *   status: ExternalAccreditation['status']['current']
 *   tonnageBand: ExternalAccreditation['prnIssuance']['tonnageBand']
 * }} RegAccredAccreditationSummary
 */

/**
 * The CDP v3 HMAC headers Reg Accred authenticates callers with.
 *
 * @param {Pick<RegAccredApiConfig, 'clientId' | 'sharedSecret'>} config
 * @param {{ now?: () => Date, newNonce?: () => string }} [sources]
 * @returns {Record<string, string>}
 */
export const signedHeaders = (
  { clientId, sharedSecret },
  {
    now = () => new Date(),
    newNonce = () => randomBytes(16).toString('base64')
  } = {}
) => {
  // yyyy-MM-ddTHH:mm:ssZ (no milliseconds)
  const timestamp = now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
  const nonce = newNonce()
  const payload = ['v3', clientId, '', '', timestamp, nonce].join('\n')
  const signature = createHmac('sha256', sharedSecret)
    .update(payload)
    .digest('base64')

  return {
    'x-cdp-client-id': clientId,
    'x-cdp-auth-timestamp': timestamp,
    'x-cdp-auth-nonce': nonce,
    'x-cdp-auth-signature': signature
  }
}

/**
 * When Reg Accred's current status for an accreditation took effect. Reg
 * Accred serves no status history yet, so each accreditation is taken to have
 * held its current status since the start of 2027.
 */
const REG_ACCRED_STATUS_SINCE = '2027-01-01T00:00:00.000Z'

/**
 * The fields of a `GET /v1/accreditations` item the read model uses. Reg
 * Accred asks callers to ignore fields they do not know, so other fields are
 * allowed. It also asks them to handle a status or tonnage band they do not
 * know, so one of those fails validation.
 */
const regAccredAccreditationSummarySchema = Joi.object({
  organisationNumber: Joi.number().integer().required(),
  registrationNumber: Joi.string().trim().uppercase().required(),
  accreditationNumber: Joi.string().trim().uppercase().required(),
  accreditationYear: Joi.number().integer().required(),
  status: Joi.string()
    .valid(...ACCREDITATION_STATUSES)
    .required(),
  tonnageBand: tonnageBandSchema.required()
}).unknown(true)

/**
 * The item with its numbers trimmed and upper-cased, or `null`, reported
 * through `onDrop`, when the read model cannot represent it.
 *
 * @param {unknown} item
 * @param {OnDrop} onDrop
 * @returns {RegAccredAccreditationSummary | null}
 */
const toValidSummary = (item, onDrop) => {
  const { value, error } = regAccredAccreditationSummarySchema.validate(item)
  if (error) {
    const { accreditationNumber = 'with no number' } =
      /** @type {{ accreditationNumber?: unknown }} */ (item ?? {})
    onDrop(
      `Reg Accred accreditation ${accreditationNumber} is invalid: ${error.message}`
    )
    return null
  }
  return value
}

/**
 * @param {RegAccredAccreditationSummary} summary
 * @param {Date} loadedAt
 * @returns {ExternalAccreditation}
 */
const toExternalAccreditation = (summary, loadedAt) =>
  /** @type {ExternalAccreditation} */ (
    /** @type {unknown} */ ({
      organisationNumber: String(summary.organisationNumber),
      registrationNumber: summary.registrationNumber,
      year: /** @type {Year} */ (summary.accreditationYear),
      accreditationNumber: summary.accreditationNumber,
      prnIssuance: { tonnageBand: summary.tonnageBand },
      status: {
        current: summary.status,
        // TODO: take this from the Reg Accred response once it serves when
        // the accreditation was last updated.
        lastUpdatedAt: loadedAt.toISOString(),
        // TODO: take this from the Reg Accred response once it serves the
        // accreditation's status history.
        timeline: [{ status: summary.status, at: REG_ACCRED_STATUS_SINCE }]
      }
    })
  )

/** The most accreditations Reg Accred serves on one page. */
const PAGE_LIMIT = 100

/**
 * How long one page request may take before it is abandoned and the load
 * fails. Without it a slow Reg Accred holds the read for undici's 300 second
 * default on each page.
 */
const PAGE_TIMEOUT_MS = 10_000

/**
 * A page of `GET /v1/accreditations`, its items not yet validated.
 *
 * @typedef {{
 *   pageNumber: number
 *   limit: number
 *   totalItems: number
 *   items: unknown[]
 * }} RegAccredAccreditationsPage
 */

/**
 * Every accreditation for `year` Reg Accred holds that matches `filter`,
 * asking for one page after another until it has `totalItems` of them. Reg
 * Accred orders them by accreditation number, so the pages do not overlap.
 *
 * @param {RegAccredApiConfig} config
 * @param {number} timeoutMs - how long each page request may take
 * @param {Year} year
 * @param {Record<string, string>} [filter]
 * @returns {Promise<unknown[]>}
 */
const fetchEveryAccreditation = async (config, timeoutMs, year, filter) => {
  /** @type {unknown[]} */
  const accreditations = []
  for (let pageNumber = 1; ; pageNumber++) {
    const query = new URLSearchParams({
      year: String(year),
      ...filter,
      pageNumber: String(pageNumber),
      limit: String(PAGE_LIMIT)
    })
    const { items, totalItems } = /** @type {RegAccredAccreditationsPage} */ (
      await fetchJson(`${config.baseUrl}/v1/accreditations?${query}`, {
        headers: {
          accept: 'application/json',
          ...signedHeaders(config)
        },
        signal: AbortSignal.timeout(timeoutMs)
      })
    )
    accreditations.push(...items)
    // An empty page ends the search even short of `totalItems`, in case
    // accreditations are withdrawn while it pages.
    if (items.length === 0 || accreditations.length >= totalItems) {
      return accreditations
    }
  }
}

/**
 * Loads the year's accreditations from Reg Accred, every page of them: the
 * given organisation's, or every organisation's when none is given. An
 * accreditation the read model cannot represent, such as one with a status it
 * does not know, is dropped and reported through `onDrop`. A page request
 * that takes longer than `timeoutMs` fails the load.
 *
 * @param {RegAccredApiConfig} config
 * @param {{ onDrop: OnDrop, now?: () => Date, timeoutMs?: number }} options
 * @returns {ExternalAccreditationsLoader}
 */
export const createRegAccredAccreditationsLoader =
  (config, { onDrop, now = () => new Date(), timeoutMs = PAGE_TIMEOUT_MS }) =>
  async (year, organisationNumber) => {
    const accreditations = await fetchEveryAccreditation(
      config,
      timeoutMs,
      year,
      organisationNumber && { organisationNumber }
    )
    const loadedAt = now()
    return accreditations
      .map((item) => toValidSummary(item, onDrop))
      .filter((summary) => summary !== null)
      .map((summary) => toExternalAccreditation(summary, loadedAt))
  }
