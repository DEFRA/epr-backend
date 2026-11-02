/**
 * @typedef {object} MongoErrorFields
 * @property {number | string} [code]
 * @property {string} [codeName]
 * @property {Record<string, number>} [keyPattern]
 */

/**
 * Builds an `Error` carrying the MongoDB driver error fields the repositories
 * read (`code`, `codeName`, `keyPattern`). The driver attaches these at
 * runtime, so tests fake them here without weakening the repository types.
 *
 * @param {string} message
 * @param {MongoErrorFields} [fields]
 * @returns {Error & MongoErrorFields}
 */
export const createMongoError = (message, fields = {}) =>
  Object.assign(new Error(message), fields)
