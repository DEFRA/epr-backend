import { accreditationWindow } from '#common/helpers/dates/accreditation.js'

/** @import {AccreditationWindow} from '#common/helpers/dates/accreditation.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
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
