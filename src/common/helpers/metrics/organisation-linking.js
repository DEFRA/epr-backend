import { incrementCounter } from '#common/helpers/metrics.js'

/**
 * @typedef {Object} OrganisationLinkingMetrics
 * @property {() => Promise<void>} organisationLinked - Records organisation linked metric
 * @property {() => Promise<void>} organisationUnlinked - Records organisation unlinked metric
 */

/** @type {OrganisationLinkingMetrics} */
export const organisationLinkingMetrics = {
  organisationLinked: async () => {
    await incrementCounter('organisation.linked', {})
  },
  organisationUnlinked: async () => {
    await incrementCounter('organisation.unlinked', {})
  }
}
