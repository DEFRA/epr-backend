import { accreditationWindow } from '#common/helpers/dates/accreditation.js'

/** @import {AccreditationWindow} from '#common/helpers/dates/accreditation.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {AccreditationCommon, ExporterAccreditation, ExporterRegistration, Registration} from '#organisation-read-model/domain/model.js' */
/** @import {StatusTimeline} from '#organisation-read-model/domain/model.js' */
/** @import {ORS_VALIDATION_DISABLED} from '#domain/summary-logs/table-schemas/shared/classification-reason.js' */

/**
 * What classification needs to know about an accreditation: the window it is
 * valid for (null when it has never had one) and its status timeline.
 *
 * @typedef {{
 *   window: AccreditationWindow | null,
 *   timeline: StatusTimeline
 * }} AccreditedPeriod
 */

/**
 * Approved overseas sites keyed by site identifier, or the sentinel meaning
 * overseas site validation is disabled.
 *
 * @typedef {Record<string, {
 *   approvedFrom: Date | null,
 *   name: string,
 *   country: string
 * }> | typeof ORS_VALIDATION_DISABLED} OverseasSitesContext
 */

/**
 * @param {Accreditation | null | undefined} legacyAccreditation
 * @returns {AccreditedPeriod | null}
 */
export const toAccreditedPeriod = (legacyAccreditation) =>
  legacyAccreditation
    ? {
        window: accreditationWindow(legacyAccreditation),
        timeline: legacyAccreditation.statusHistory.map(
          ({ status, updatedAt }) => ({
            status,
            at: new Date(updatedAt).toISOString()
          })
        )
      }
    : null

/**
 * The read model keeps no validFrom/validTo for an accreditation. The window
 * starts at the first approval after the last `created` entry (the adapter
 * records the stored validFrom there) and ends on 31 December of the year the
 * accreditation is keyed by.
 *
 * @param {AccreditationCommon} accreditation
 * @param {string | number} year
 * @returns {AccreditedPeriod}
 */
export const readModelAccreditedPeriod = (accreditation, year) => {
  const { timeline } = accreditation.status
  const afterCreated = timeline.slice(
    timeline.findLastIndex(({ status }) => status === 'created') + 1
  )
  const approvalAt = afterCreated.find(
    ({ status }) => status === 'approved'
  )?.at

  return {
    window: approvalAt
      ? accreditationWindow(
          /** @type {any} */ ({
            validFrom: approvalAt,
            validTo: `${year}-12-31`
          })
        )
      : null,
    timeline
  }
}

/**
 * Overseas sites exist only on exporters. A site absent from the registration
 * is absent here (VAL015); a pending one has no approval date (VAL014). An
 * approval date is the start of the day it was approved on, so an export dated
 * that day counts as approved.
 *
 * @param {Registration} registration
 * @param {AccreditationCommon} accreditation
 * @returns {OverseasSitesContext}
 */
export const readModelOverseasSitesContext = (registration, accreditation) => {
  const registeredSites =
    /** @type {ExporterRegistration} */ (registration).overseasSites ?? {}
  const accreditedSites =
    /** @type {ExporterAccreditation} */ (accreditation).overseasSites ?? {}

  return Object.fromEntries(
    Object.entries(accreditedSites).flatMap(([osr, accredited]) => {
      const site = registeredSites[osr]
      return site
        ? [
            [
              osr,
              {
                approvedFrom:
                  accredited.status === 'approved'
                    ? new Date(accredited.approvedOn)
                    : null,
                name: site.name,
                country: site.address.country
              }
            ]
          ]
        : []
    })
  )
}
