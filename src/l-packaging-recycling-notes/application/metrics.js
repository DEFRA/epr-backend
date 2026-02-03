import { incrementCounter } from '#common/helpers/metrics.js'

/**
 * @typedef {import('#l-packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 */

/**
 * @typedef {Object} StatusTransitionDimensions
 * @property {PrnStatus} fromStatus - The status transitioning from
 * @property {PrnStatus} toStatus - The status transitioning to
 * @property {string} [material] - The material type (e.g. 'paper', 'plastic')
 * @property {boolean} [isExport] - Whether this is a PERN (export) or PRN
 */

/**
 * Builds CloudWatch dimensions object, converting values to lowercase
 * and omitting undefined values
 * @param {Record<string, string|boolean|undefined>} dimensions
 * @returns {Record<string, string>}
 */
const buildDimensions = (dimensions) => {
  /** @type {Record<string, string>} */
  const result = {}
  for (const [key, value] of Object.entries(dimensions)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value).toLowerCase()
    }
  }
  return result
}

/**
 * Records a PRN status transition metric
 * @param {StatusTransitionDimensions} dimensions
 */
async function recordStatusTransition({
  fromStatus,
  toStatus,
  material,
  isExport
}) {
  await incrementCounter(
    'prn.statusTransition',
    buildDimensions({ fromStatus, toStatus, material, isExport })
  )
}

/**
 * @typedef {Object} PrnMetrics
 * @property {(dimensions: StatusTransitionDimensions) => Promise<void>} recordStatusTransition - Records a PRN status transition metric
 */

/** @type {PrnMetrics} */
export const prnMetrics = {
  recordStatusTransition
}
