import { incrementCounter } from '#common/helpers/metrics.js'

/**
 * @typedef {Object} OrganisationLinkingMetrics
 * @property {() => Promise<void>} organisationLinked - Records organisation linked metric
 */

/** @type {OrganisationLinkingMetrics} */
export const organisationLinkingMetrics = {
  organisationLinked: async () => {
    await incrementCounter('organisation.linked', {})
  }
}

/**
 * @typedef {Object} OrganisationUnlinkingMetrics
 * @property {() => Promise<void>} organisationUnlinked - Records organisation unlinked metric
 */

/** @type {OrganisationUnlinkingMetrics} */
export const organisationUnlinkingMetrics = {
  organisationUnlinked: async () => {
    await incrementCounter('organisation.unlinked', {})
  }
}
