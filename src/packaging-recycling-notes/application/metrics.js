import { buildDimensions, incrementCounter } from '#common/helpers/metrics.js'

/**
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 * @typedef {import('#domain/summary-logs/meta-fields.js').ProcessingType} ProcessingType
 */

/**
 * @typedef {Object} StatusTransitionDimensions
 * @property {PrnStatus} fromStatus - The status transitioning from
 * @property {PrnStatus} toStatus - The status transitioning to
 * @property {string} [material] - The material type (e.g. 'paper', 'plastic')
 * @property {boolean} [isExport] - Whether this is a PERN (export) or PRN
 * @property {boolean} isDecemberWaste - The PRN's statutory December-waste disclosure (ADR-0049)
 * @property {boolean} isAcceptedIntoNextObligationYear - True when the PRN's obligationYear is the accreditation year plus one
 */

/**
 * @typedef {Object} CreatedDimensions
 * @property {string} [material] - The material type (e.g. 'paper', 'plastic')
 * @property {boolean} isDecemberWaste - The PRN's statutory December-waste disclosure (ADR-0049)
 * @property {ProcessingType} processingType - The accreditation's processing type (exporter, reprocessor input/output)
 */

/**
 * Records a PRN status transition metric
 * @param {StatusTransitionDimensions} dimensions
 */
async function recordStatusTransition({
  fromStatus,
  toStatus,
  material,
  isExport,
  isDecemberWaste,
  isAcceptedIntoNextObligationYear
}) {
  await incrementCounter(
    'prn.statusTransition',
    buildDimensions({
      fromStatus,
      toStatus,
      material,
      isExport,
      isDecemberWaste,
      isAcceptedIntoNextObligationYear
    })
  )
}

/**
 * Records a PRN creation metric
 * @param {CreatedDimensions} dimensions
 */
async function recordCreated({ material, isDecemberWaste, processingType }) {
  await incrementCounter(
    'prn.created',
    buildDimensions({ material, isDecemberWaste, processingType })
  )
}

/**
 * @typedef {Object} PrnMetrics
 * @property {(dimensions: StatusTransitionDimensions) => Promise<void>} recordStatusTransition - Records a PRN status transition metric
 * @property {(dimensions: CreatedDimensions) => Promise<void>} recordCreated - Records a PRN creation metric
 */

/** @type {PrnMetrics} */
export const prnMetrics = {
  recordStatusTransition,
  recordCreated
}
