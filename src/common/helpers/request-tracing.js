import { config } from '#root/config.js'
import { tracing } from '@defra/hapi-tracing'

export const getTracingHeaderName = () => config.get('tracing.header')

export const requestTracing = {
  plugin: tracing.plugin,
  options: {
    tracingHeader: getTracingHeaderName()
  }
}
