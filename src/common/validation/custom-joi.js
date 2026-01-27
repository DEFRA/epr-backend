import Joi from 'joi'

/**
 * Extended Joi with a custom string type that coerces numbers to strings.
 * ExcelJS may return numeric values for cells that look like numbers,
 * even when they're intended to be string identifiers (e.g. postal codes).
 */
export const customJoi = Joi.extend(
  /** @type {import('joi').ExtensionFactory} */
  (
    (joi) => ({
      type: 'coercedString',
      base: joi.string(),
      coerce(value) {
        if (typeof value === 'number') {
          return { value: String(value) }
        }
        // Returning undefined means "no coercion needed" in Joi's API
        return undefined
      }
    })
  )
)
