import { expect } from 'vitest'

import { errSerializer } from './err-serializer.js'
import { logSchema } from './log-schema.js'

/**
 * Mirrors the `err → error` rename + serializer transform that
 * `@elastic/ecs-pino-format` applies on its way to OpenSearch. Lets tests
 * assert their input shape against the indexed-fields schema, since the
 * input is what mock-based tests capture.
 *
 * @param {Record<string, unknown>} input
 */
const applyEcsErrTransform = (input) => {
  if (!('err' in input)) return input
  const { err, ...rest } = input
  return { ...rest, error: errSerializer(err) }
}

/**
 * Asserts a log object's shape passes the CDP indexed-fields schema, after
 * applying the same `err → error` transform pino+ecs would.
 *
 * @param {Record<string, unknown>} logObject
 */
export const expectLogToBeCdpCompliant = (logObject) => {
  const transformed = applyEcsErrTransform(logObject)
  const { error } = logSchema.validate(transformed)
  const message = error
    ? `${error.message}\n${JSON.stringify(transformed, null, 2)}`
    : undefined

  expect(error, message).toBeUndefined()
}
