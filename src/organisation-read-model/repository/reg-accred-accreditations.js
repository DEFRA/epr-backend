import { createHmac, randomBytes } from 'node:crypto'

import { fetchJson } from '#common/helpers/fetch-json.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { ExternalAccreditation } from './to-read-model.js' */
/** @import { ExternalAccreditationsLoader } from './mongodb.js' */

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
 * An accreditation as `GET /v1/accreditations` serves it.
 *
 * @typedef {{
 *   organisationNumber: number
 *   registrationNumber: string
 *   accreditationNumber: string
 *   accreditationYear: number
 *   wasteProcessingType: 'reprocessor' | 'exporter'
 *   status: ExternalAccreditation['status']['current']
 *   tonnageBand: ExternalAccreditation['prnIssuance']['tonnageBand']
 * }} RegAccredAccreditationSummary
 */

/**
 * The CDP v3 HMAC headers Reg Accred authenticates callers with.
 *
 * @param {Pick<RegAccredApiConfig, 'clientId' | 'sharedSecret'>} config
 * @param {() => Date} [now]
 * @returns {Record<string, string>}
 */
export const signedHeaders = (
  { clientId, sharedSecret },
  now = () => new Date()
) => {
  // yyyy-MM-ddTHH:mm:ssZ (no milliseconds)
  const timestamp = now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
  const nonce = randomBytes(16).toString('base64')
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
 * @param {RegAccredAccreditationSummary} summary
 * @param {Date} loadedAt
 * @returns {ExternalAccreditation}
 */
const toExternalAccreditation = (summary, loadedAt) =>
  /** @type {ExternalAccreditation} */ (
    /** @type {unknown} */ ({
      organisationNumber: String(summary.organisationNumber),
      registrationNumber: summary.registrationNumber.trim().toUpperCase(),
      year: /** @type {Year} */ (summary.accreditationYear),
      accreditationNumber: summary.accreditationNumber.trim().toUpperCase(),
      prnIssuance: { tonnageBand: summary.tonnageBand },
      status: {
        current: summary.status,
        // TODO: take this from the Reg Accred response once it serves when
        // the accreditation was last updated.
        lastUpdatedAt: loadedAt.toISOString(),
        // TODO: take this from the Reg Accred response once it serves the
        // accreditation's status history.
        timeline: [{ status: summary.status, at: REG_ACCRED_STATUS_SINCE }]
      },
      // TODO: take an exporter's accredited overseas sites from the Reg Accred
      // response once it serves them. Until then it is accredited for none.
      ...(summary.wasteProcessingType === 'exporter' && { overseasSites: {} })
    })
  )

/** The most accreditations Reg Accred serves on one page. */
const PAGE_LIMIT = 100

/**
 * A page of `GET /v1/accreditations`.
 *
 * @typedef {{
 *   pageNumber: number
 *   limit: number
 *   totalItems: number
 *   items: RegAccredAccreditationSummary[]
 * }} RegAccredAccreditationsPage
 */

/**
 * Every accreditation for `year` Reg Accred holds that matches `filter`,
 * asking for one page after another until it has `totalItems` of them. Reg
 * Accred orders them by accreditation number, so the pages do not overlap.
 *
 * @param {RegAccredApiConfig} config
 * @param {Year} year
 * @param {Record<string, string>} [filter]
 * @returns {Promise<RegAccredAccreditationSummary[]>}
 */
const fetchEveryAccreditation = async (config, year, filter) => {
  /** @type {RegAccredAccreditationSummary[]} */
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
        }
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
 * given organisation's, or every organisation's when none is given.
 *
 * @param {RegAccredApiConfig} config
 * @param {() => Date} [now]
 * @returns {ExternalAccreditationsLoader}
 */
export const createRegAccredAccreditationsLoader =
  (config, now = () => new Date()) =>
  async (year, organisationNumber) => {
    const accreditations = await fetchEveryAccreditation(
      config,
      year,
      organisationNumber && { organisationNumber }
    )
    const loadedAt = now()
    return accreditations.map((summary) =>
      toExternalAccreditation(summary, loadedAt)
    )
  }
