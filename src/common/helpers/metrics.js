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
 * @param {number} [value=1] - The value to record
 * @param {import('aws-embedded-metrics').Unit} [unit=Unit.Count] - The AWS CloudWatch unit
 */
const metricsCounter = async (metricName, value = 1, unit = Unit.Count) => {
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

export { metricsCounter }
