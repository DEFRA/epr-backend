import { config } from '#root/config.js'
import { getTraceId } from '@defra/hapi-tracing'
import { ecsFormat } from '@elastic/ecs-pino-format'

/**
 * @typedef {Error & {isBoom: true, output: {statusCode: number, payload: object}, data?: object}} BoomError
 */

const logConfig = config.get('log')
const serviceName = config.get('serviceName')
const serviceVersion = config.get('serviceVersion')
const cdpEnvironment = config.get('cdpEnvironment')
const isProductionEnvironment = cdpEnvironment === 'prod'

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
    /** @param {unknown} err */
    error: (err) => {
      if (!(err instanceof Error)) {
        return err
      }

      const errorObj = {
        message: err.message,
        stack_trace: err.stack,
        type: err.name
      }

      // Include Boom error details for better debugging (non-prod only)
      // @ts-ignore - check for Boom error before casting
      if (!isProductionEnvironment && err.isBoom && err.output) {
        /** @type {BoomError} */
        const boomErr = /** @type {BoomError} */ (err)
        errorObj.statusCode = boomErr.output.statusCode
        errorObj.payload = boomErr.output.payload

        if (boomErr.data) {
          errorObj.message = `${err.message} | data: ${JSON.stringify(boomErr.data)}`
        }
      }

      return errorObj
    },
    // Note: Custom res serializer simplified - hapi-pino passes request.raw.res
    // (Node's raw response) to serializers, not Hapi's response with source.
    // Use log4xxResponseErrors option instead for error response details.
    res: (res) => {
      if (!res) {
        return res
      }
      return {
        statusCode: res.statusCode
      }
    }
  },
  // Log 4xx response bodies as 'err' field in non-prod environments
  // This properly accesses request.response.source which contains error details
  log4xxResponseErrors: !isProductionEnvironment,
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
