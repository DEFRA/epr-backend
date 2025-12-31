import { config } from '#root/config.js'
import { getTraceId } from '@defra/hapi-tracing'
import { ecsFormat } from '@elastic/ecs-pino-format'

const logConfig = config.get('log')
const serviceName = config.get('serviceName')
const serviceVersion = config.get('serviceVersion')
const cdpEnvironment = config.get('cdpEnvironment')
const isProductionEnvironment = cdpEnvironment === 'prod'

const HTTP_STATUS_BAD_REQUEST = 400

const formatters = {
  ecs: {
    ...ecsFormat({
      serviceVersion,
      serviceName
    })
  },
  'pino-pretty': { transport: { target: 'pino-pretty' } }
}

export const loggerOptions = {
  enabled: logConfig.isEnabled,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  ...formatters[logConfig.format],
  nesting: true,
  // Log request errors - includes validation errors, Boom errors, etc.
  logEvents: ['onPostStart', 'onPostStop', 'response', 'request-error'],
  serializers: {
    error: (err) => {
      if (err instanceof Error) {
        const errorObj = {
          message: err.message,
          stack_trace: err.stack,
          type: err.name
        }

        // Include Boom error details for better debugging (non-prod only)
        // In production, detailed error payloads could expose sensitive information
        // @ts-ignore - Boom errors have isBoom and output properties
        if (!isProductionEnvironment && err.isBoom && err.output) {
          // @ts-ignore
          errorObj.statusCode = err.output.statusCode
          // @ts-ignore
          errorObj.payload = err.output.payload
        }

        return errorObj
      }
      return err
    },
    // Custom serializer for Hapi response errors (non-prod only)
    res: (res) => {
      if (!res) {
        return res
      }

      // In production, only log status code to avoid leaking sensitive details
      if (isProductionEnvironment) {
        return {
          statusCode: res.statusCode
        }
      }

      return {
        statusCode: res.statusCode,
        // Include error payload for 4xx/5xx responses (non-prod only)
        ...(res.statusCode >= HTTP_STATUS_BAD_REQUEST &&
          res.source && {
            error: res.source.error,
            message: res.source.message,
            validation: res.source.validation
          })
      }
    }
  },
  // @fixme: add coverage
  /* v8 ignore next 8 */
  mixin() {
    const mixinValues = {}
    const traceId = getTraceId()
    if (traceId) {
      mixinValues.trace = { id: traceId }
    }
    return mixinValues
  }
}
