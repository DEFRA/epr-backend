/** @import { ExporterAccreditation } from '#organisation-read-model/domain/model.js' */
/** @import { ReportRegistration } from './operator-category.js' */

/**
 * @typedef {{ siteName: string|null, country: string|null, validFrom: Date|null }} OrsDetails
 */

/**
 * Each of an exporter's overseas sites by ORS key, approved from the day the
 * accreditation reported under approved it. A reprocessor has none.
 *
 * @param {ReportRegistration} reportRegistration
 * @returns {Map<string, OrsDetails>}
 */
export function orsDetailsOf({ registration, accreditation }) {
  if (!('overseasSites' in registration)) {
    return new Map()
  }
  const approvals =
    /** @type {ExporterAccreditation | null} */ (accreditation)
      ?.overseasSites ?? {}
  return new Map(
    Object.entries(registration.overseasSites).map(([orsKey, site]) => {
      const approval = approvals[orsKey]
      return [
        orsKey,
        {
          siteName: site.name,
          country: site.address.country,
          validFrom:
            approval?.status === 'approved'
              ? new Date(approval.approvedOn)
              : null
        }
      ]
    })
  )
}
