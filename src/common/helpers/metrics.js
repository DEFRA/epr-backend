import { config } from '#root/config.js'
import {
  createMetricsLogger,
  StorageResolution,
  Unit
} from 'aws-embedded-metrics'
import { logger } from './logging/logger.js'

/**
 * Records a metric to AWS CloudWatch
 * @param {string} metricName - The name of the metric
 * @param {number} value - The value to record
 * @param {import('aws-embedded-metrics').Unit} unit - The AWS CloudWatch unit
 */
const recordMetric = async (metricName, value, unit) => {
  if (!config.get('isMetricsEnabled')) {
    return
  }

  try {
    const metricsLogger = createMetricsLogger()
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
 */
const incrementCounter = async (metricName, value = 1) => {
  await recordMetric(metricName, value, Unit.Count)
}

/**
 * Records a duration metric in milliseconds
 * @param {string} metricName - The name of the metric
 * @param {number} durationMs - The duration in milliseconds
 */
const recordDuration = async (metricName, durationMs) => {
  await recordMetric(metricName, durationMs, Unit.Milliseconds)
}

/**
 * Executes a function and records its duration as a metric
 * @template T
 * @param {string} metricName - The name of the metric
 * @param {() => Promise<T> | T} fn - The function to execute
 * @returns {Promise<T>} The result of the function
 */
const timed = async (metricName, fn) => {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    await recordDuration(metricName, Date.now() - start)
  }
}

export { incrementCounter, recordDuration, timed }
