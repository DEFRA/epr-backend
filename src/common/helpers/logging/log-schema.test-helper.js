import { logSchema } from './log-schema.js'

/**
 * Asserts a log object's shape passes the CDP indexed-fields schema.
 * Intended for test-time use; throws with the Joi error message on mismatch
 * so vitest surfaces the failure clearly.
 *
 * @param {object} logObject
 */
export const expectLogToBeCdpCompliant = (logObject) => {
  const { error } = logSchema.validate(logObject)
  if (!error) return
  throw new Error(
    `log object is not CDP-compliant: ${error.message}\n${JSON.stringify(
      logObject,
      null,
      2
    )}`
  )
}
