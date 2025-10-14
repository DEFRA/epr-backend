/**
 * @typedef {import('./helpers/logging/logger.js').TypedLogger} TypedLogger
 * @typedef {import('./helpers/logging/logger.js').IndexedLogProperties} IndexedLogProperties
 */

/**
 * @typedef {Object} HapiRequest
 * @property {TypedLogger} logger - CDP-compliant typed logger
 * @property {*} [db] - MongoDB database (added by mongoDb plugin)
 * @property {*} [locker] - Mongo lock manager (added by mongoDb plugin)
 * @property {*} [payload] - Request payload
 * @property {*} [params] - Route parameters
 * @property {*} [query] - Query string parameters
 * @property {*} [headers] - Request headers
 * @property {*} [auth] - Authentication credentials
 * @property {string} [path] - Request path
 * @property {string} [method] - HTTP method
 */

/**
 * @typedef {Object} HapiServer
 * @property {TypedLogger} logger - CDP-compliant typed logger
 * @property {*} [mongoClient] - MongoDB client (added by mongoDb plugin)
 * @property {*} [db] - MongoDB database (added by mongoDb plugin)
 * @property {*} [locker] - Mongo lock manager (added by mongoDb plugin)
 * @property {*} [events] - Server events emitter
 * @property {Function} [decorate] - Decorate server/request with additional properties
 * @property {Function} [start] - Start the server
 * @property {Function} [stop] - Stop the server
 * @property {Function} [initialize] - Initialize the server without starting
 * @property {Function} [inject] - Inject a request for testing
 * @property {Function} [ext] - Register extension points
 */
