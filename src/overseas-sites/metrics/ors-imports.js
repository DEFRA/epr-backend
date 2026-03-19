import { incrementCounter, timed } from '#common/helpers/metrics.js'

/**
 * Records an ORS import status transition metric
 * @param {{ status: string }} dimensions
 */
async function recordStatusTransition({ status }) {
  await incrementCounter('orsImport.statusTransition', { status })
}

/**
 * Records the count of overseas sites created during an import file
 * @param {number} count
 */
async function recordSitesCreated(count) {
  await incrementCounter('orsImport.sitesCreated', {}, count)
}

/**
 * Records a per-file import result metric
 * @param {{ status: string }} dimensions
 */
async function recordFileResult({ status }) {
  await incrementCounter('orsImport.fileResult', { status })
}

/**
 * Executes a function and records its duration as the import duration metric
 * @template T
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
async function timedImport(fn) {
  return timed('orsImport.duration', {}, fn)
}

/**
 * @typedef {Object} OrsImportMetrics
 * @property {(dimensions: { status: string }) => Promise<void>} recordStatusTransition
 * @property {(count: number) => Promise<void>} recordSitesCreated
 * @property {(dimensions: { status: string }) => Promise<void>} recordFileResult
 * @property {<T>(fn: () => Promise<T> | T) => Promise<T>} timedImport
 */

/** @type {OrsImportMetrics} */
export const orsImportMetrics = {
  recordStatusTransition,
  recordSitesCreated,
  recordFileResult,
  timedImport
}
