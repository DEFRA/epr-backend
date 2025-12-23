/**
 * @typedef {import('./helpers/logging/logger.js').TypedLogger} TypedLogger
 * @typedef {import('./helpers/logging/logger.js').IndexedLogProperties} IndexedLogProperties
 * @import {Db} from 'mongodb'
 * @import {LockManager} from 'mongo-locks'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 */

/**
 * @typedef {import('@hapi/hapi').Request & {
 *  auth: *
 *  db: Db,
 *  locker: LockManager,
 *  logger: TypedLogger,
 *  organisationsRepository: OrganisationsRepository
 *  server: HapiServer,
 * }} HapiRequest
 */
/**
 * @typedef {{
 *   code: (statusCode: number) => HapiResponseObject,
 *   message: (httpMessage: string) => HapiResponseObject,
 *   header: (name: string, value: string, options?: {append?: boolean, separator?: string, override?: boolean, duplicate?: boolean}) => HapiResponseObject,
 *   type: (mimeType: string) => HapiResponseObject,
 *   bytes: (length: number) => HapiResponseObject,
 *   charset: (charset?: string) => HapiResponseObject | undefined,
 *   compressed: (encoding: string) => HapiResponseObject,
 *   created: (uri: string) => HapiResponseObject,
 *   encoding: (encoding: 'ascii' | 'utf8' | 'utf16le' | 'ucs2' | 'base64' | 'latin1' | 'binary' | 'hex') => HapiResponseObject,
 *   etag: (tag: string, options?: {weak?: boolean, vary?: boolean}) => HapiResponseObject,
 *   location: (uri: string) => HapiResponseObject,
 *   redirect: (uri: string) => HapiResponseObject,
 *   replacer: (method: Function | Array) => HapiResponseObject,
 *   spaces: (count: number) => HapiResponseObject,
 *   state: (name: string, value: Object | string, options?: Object) => HapiResponseObject,
 *   suffix: (suffix: string) => HapiResponseObject,
 *   ttl: (msec: number) => HapiResponseObject,
 *   unstate: (name: string, options?: Object) => HapiResponseObject,
 *   vary: (header: string) => HapiResponseObject,
 *   takeover: () => HapiResponseObject,
 *   temporary: (isTemporary?: boolean) => HapiResponseObject,
 *   permanent: (isPermanent?: boolean) => HapiResponseObject,
 *   rewritable: (isRewritable?: boolean) => HapiResponseObject
 * }} HapiResponseObject
 */

/**
 * @typedef {{
 *   abandon: symbol,
 *   close: symbol,
 *   context: *,
 *   continue: symbol,
 *   realm: Object,
 *   request: Object,
 *   authenticated: (data: {credentials: Object, artifacts?: Object}) => Object,
 *   entity: (options?: {etag?: string, modified?: string, vary?: boolean}) => HapiResponseObject | undefined,
 *   redirect: (uri?: string) => HapiResponseObject,
 *   response: (value?: *) => HapiResponseObject,
 *   state: (name: string, value: string | Object, options?: Object) => void,
 *   unauthenticated: (error: Error, data?: {credentials: Object, artifacts?: Object}) => Object,
 *   unstate: (name: string, options?: Object) => void
 * }} HapiResponseToolkit
 */

/**
 * @typedef {Object} HapiServer
 * @property {TypedLogger} logger - CDP-compliant typed logger
 * @property {import('mongodb').Db} [db] - MongoDB database (added by mongoDb plugin)
 * @property {*} [mongoClient] - MongoDB client (added by mongoDb plugin)
 * @property {*} [locker] - Mongo lock manager (added by mongoDb plugin)
 * @property {*} events - Server events emitter
 * @property {Record<string, *>} app - Server application state
 * @property {Function} decorate - Decorate server/request with additional properties
 * @property {Function} dependency - Declare plugin dependencies
 * @property {Function} start - Start the server
 * @property {Function} stop - Stop the server
 * @property {Function} initialize - Initialize the server without starting
 * @property {Function} inject - Inject a request for testing
 * @property {Function} ext - Register extension points
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
