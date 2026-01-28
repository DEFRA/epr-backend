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
