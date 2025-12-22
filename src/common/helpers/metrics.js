import { config } from '#root/config.js'
import {
  createMetricsLogger,
  StorageResolution,
  Unit
} from 'aws-embedded-metrics'
import { logger } from './logging/logger.js'

/**
 * @typedef {Record<string, string>} Dimensions
 */

/**
 * Records a metric to AWS CloudWatch
 * @param {string} metricName - The name of the metric
 * @param {number} value - The value to record
 * @param {import('aws-embedded-metrics').Unit} unit - The AWS CloudWatch unit
 * @param {Dimensions} [dimensions] - Optional dimensions for the metric
 */
const recordMetric = async (metricName, value, unit, dimensions) => {
  if (!config.get('isMetricsEnabled')) {
    return
  }

  try {
    const metricsLogger = createMetricsLogger()
    if (dimensions) {
      metricsLogger.putDimensions(dimensions)
    }
    metricsLogger.putMetric(metricName, value, unit, StorageResolution.Standard)
    await metricsLogger.flush()
  } catch (error) {
    logger.error(error, error.message)
  }
}

/**
 * Increments a counter metric
 * @param {string} metricName - The name of the metric
 * @param {number} [value=1] - The amount to increment by
 * @param {Dimensions} [dimensions] - Optional dimensions for the metric
 */
const incrementCounter = async (metricName, value = 1, dimensions) => {
  await recordMetric(metricName, value, Unit.Count, dimensions)
}

/**
 * Records a duration metric in milliseconds
 * @param {string} metricName - The name of the metric
 * @param {number} durationMs - The duration in milliseconds
 * @param {Dimensions} [dimensions] - Optional dimensions for the metric
 */
const recordDuration = async (metricName, durationMs, dimensions) => {
  await recordMetric(metricName, durationMs, Unit.Milliseconds, dimensions)
}

/**
 * Executes a function and records its duration as a metric
 * @template T
 * @param {string} metricName - The name of the metric
 * @param {() => Promise<T> | T} fn - The function to execute
 * @param {Dimensions} [dimensions] - Optional dimensions for the metric
 * @returns {Promise<T>} The result of the function
 */
const timed = async (metricName, fn, dimensions) => {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    await recordDuration(metricName, Date.now() - start, dimensions)
  }
}

export { incrementCounter, recordDuration, timed }
