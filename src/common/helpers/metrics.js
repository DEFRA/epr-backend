import { Metrics } from '@defra/cdp-metrics'
import { logger } from './logging/logger.js'

/**
 * @typedef {Record<string, string>} Dimensions
 */

const metrics = new Metrics(logger)

/**
 * Increments a counter metric
 * @param {string} metricName - The name of the metric
 * @param {Dimensions} dimensions - Dimensions for the metric
 * @param {number} [value=1] - The amount to increment by
 */
const incrementCounter = async (metricName, dimensions, value = 1) => {
  await metrics.counter(metricName, value, dimensions)
}

/**
 * Records a duration metric in milliseconds
 * @param {string} metricName - The name of the metric
 * @param {Dimensions} dimensions - Dimensions for the metric
 * @param {number} durationMs - The duration in milliseconds
 */
const recordDuration = async (metricName, dimensions, durationMs) => {
  await metrics.millis(metricName, durationMs, dimensions)
}

/**
 * Executes a function and records its duration as a metric
 * @template T
 * @param {string} metricName - The name of the metric
 * @param {Dimensions} dimensions - Dimensions for the metric
 * @param {() => Promise<T> | T} fn - The function to execute
 * @returns {Promise<T>} The result of the function
 */
const timed = async (metricName, dimensions, fn) => {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    await recordDuration(metricName, dimensions, Date.now() - start)
  }
}

export { incrementCounter, recordDuration, timed }
