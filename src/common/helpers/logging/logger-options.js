import { config } from '#root/config.js'
import { getTraceId } from '@defra/hapi-tracing'
import { ecsFormat } from '@elastic/ecs-pino-format'

const logConfig = config.get('log')
const serviceName = config.get('serviceName')
const serviceVersion = config.get('serviceVersion')

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
  logRequestStart: true,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  ...formatters[logConfig.format],
  nesting: true,
  logEvents: ['onPostStart', 'onPostStop', 'response', 'request-error'],
  serializers: {
    /** @param {unknown} err */
    err: (err) => {
      if (!(err instanceof Error)) {
        return err
      }

      const errorObj = {
        message: err.message,
        stack_trace: err.stack,
        type: err.name
      }

      // @ts-ignore - err.code is a convention on Error subclasses
      if (err.code) {
        // @ts-ignore
        errorObj.code = err.code
      }

      // Surface bounded classifiers from the .cause chain — name and code are
      // enum-shaped identifiers (ECONNREFUSED, AbortError, etc.) that classify
      // the failure without leaking cause.message or cause.stack content.
      if (err.cause instanceof Error) {
        const cause = /** @type {Error & { code?: string | number }} */ (
          err.cause
        )
        errorObj.cause = {
          type: cause.name,
          code: cause.code
        }
      }

      return errorObj
    },
    res: (res) => {
      if (!res) {
        return res
      }
      return {
        statusCode: res.statusCode
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
