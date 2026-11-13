/**
 * Whether `value` is one of `values`, narrowing it to their type when it is.
 *
 * @template {string} T
 * @param {readonly T[]} values
 * @param {string | undefined} value
 * @returns {value is T}
 */
const isOneOf = (values, value) =>
  /** @type {readonly (string | undefined)[]} */ (values).includes(value)

export { isOneOf }
