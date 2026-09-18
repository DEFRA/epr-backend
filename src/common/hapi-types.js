/**
 * @typedef {import('./helpers/logging/logger.js').TypedLogger} TypedLogger
 * @typedef {import('./helpers/logging/logger.js').IndexedLogProperties} IndexedLogProperties
 * @import {Db} from 'mongodb'
 * @import {LockManager} from 'mongo-locks'
 * @import {PublicRegisterRepository} from '#domain/public-register/repository/port.js'
 * @import {UploadsRepository} from '#domain/uploads/repository/port.js'
 * @import {NonProdDataReset} from '#non-prod-data-reset/mongodb.js'
 * @import {OrsImportsRepository} from '#overseas-sites/imports/repository/port.js'
 * @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js'
 * @import {PrnEvents} from '#packaging-recycling-notes/application/prn-events.plugin.js'
 * @import {PackagingRecyclingNotesRepository} from '#packaging-recycling-notes/repository/port.js'
 * @import {ReportsRepository} from '#reports/repository/port.js'
 * @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 * @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js'
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 * @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js'
 * @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js'
 * @typedef {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} WasteBalanceService
 */

/**
 * @typedef {{ id: string, isMachine: true, name: string }} MachineCredentials
 */

/**
 * @typedef {{
 *   id: string,
 *   email: string,
 *   scope: string[],
 *   role: string | null,
 *   issuer: string,
 *   name?: string
 * }} HumanCredentials
 */

/**
 * @typedef {{ decoded: { payload: import('./helpers/auth/types.js').DefraIdTokenPayload } }} DefraIdArtifacts
 */

/**
 * @typedef {{
 *   isAuthenticated: boolean,
 *   credentials: MachineCredentials | HumanCredentials,
 *   strategy: string,
 *   artifacts?: unknown
 * }} RequestAuth
 */

/**
 * The slice of a request a command executor consumes: the authenticated
 * credentials. A full HapiRequest satisfies this, so route handlers pass their
 * request unchanged while callers that only need to project credentials are
 * spared constructing an entire request.
 *
 * @typedef {{ auth: { credentials: MachineCredentials | HumanCredentials } }} AuthenticatedRequest
 */

/**
 * Omit the base `logger` so our TypedLogger overrides hapi-pino's augmented
 * pino.Logger instead of intersecting with it. Without the Omit, calls like
 * `request.logger.warn({ ...non-allowlisted fields })` resolve to pino's
 * permissive overload and slip past tsc.
 *
 * @template [T=unknown]
 * @typedef {Omit<import('@hapi/hapi').Request, 'logger'> & {
 *  auth: RequestAuth,
 *  db: Db,
 *  locker: LockManager,
 *  logger: TypedLogger,
 *  organisationsRepository: OrganisationsRepository,
 *  systemLogsRepository: SystemLogsRepository,
 *  ledgerRepository: WasteBalanceLedgerRepository,
 *  wasteBalanceService: WasteBalanceService,
 *  payload: T,
 *  server: HapiServer,
 *  config: import('convict').Config<Record<string, any>>
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
 *   context: unknown,
 *   continue: symbol,
 *   realm: Object,
 *   request: Object,
 *   authenticated: (data: {credentials: Object, artifacts?: Object}) => Object,
 *   entity: (options?: {etag?: string, modified?: string, vary?: boolean}) => HapiResponseObject | undefined,
 *   redirect: (uri?: string) => HapiResponseObject,
 *   response: (value?: unknown) => HapiResponseObject,
 *   state: (name: string, value: string | Object, options?: Object) => void,
 *   unauthenticated: (error: Error, data?: {credentials: Object, artifacts?: Object}) => Object,
 *   unstate: (name: string, options?: Object) => void
 * }} HapiResponseToolkit
 */

/**
 * Every dependency `registerDependency` decorates onto `server.app`. The shape
 * is closed, so reading a property no plugin registers fails the type check.
 * Adding a `registerDependency` call means adding its name here too.
 *
 * @typedef {{
 *   formSubmissionsRepository: FormSubmissionsRepository,
 *   ledgerRepository: WasteBalanceLedgerRepository,
 *   nonProdDataReset: NonProdDataReset,
 *   organisationsRepository: OrganisationsRepository,
 *   orsImportsRepository: OrsImportsRepository,
 *   overseasSitesRepository: OverseasSitesRepository,
 *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
 *   prnEvents: PrnEvents,
 *   publicRegisterRepository: PublicRegisterRepository,
 *   reportsRepository: ReportsRepository,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
 *   summaryLogsRepository: SummaryLogsRepository,
 *   systemLogsRepository: SystemLogsRepository,
 *   uploadsRepository: UploadsRepository,
 *   wasteBalanceService: WasteBalanceService
 * }} ServerApp
 */

/**
 * @typedef {Object} HapiServer
 * @property {TypedLogger} logger - CDP-compliant typed logger
 * @property {import('mongodb').Db} [db] - MongoDB database (added by mongoDb plugin)
 * @property {import('mongodb').MongoClient} [mongoClient] - MongoDB client (added by mongoDb plugin)
 * @property {LockManager} [locker] - Mongo lock manager (added by mongoDb plugin)
 * @property {{ on: (criteria: string, listener: Function) => void }} events - Server events emitter
 * @property {ServerApp} app - Server application state
 * @property {Function} decorate - Decorate server/request with additional properties
 * @property {Function} dependency - Declare plugin dependencies
 * @property {Function} register - Register a plugin
 * @property {Function} route - Register a route
 * @property {Function} start - Start the server
 * @property {Function} stop - Stop the server
 * @property {Function} initialize - Initialize the server without starting
 * @property {Function} inject - Inject a request for testing
 * @property {Function} ext - Register extension points
 */

/**
 * A booted server, as its plugins have decorated it. Built on HapiServer rather
 * than hapi's own Server: intersecting the latter resolves `app` reads to `any`,
 * which drops the check that a dependency is read under a registered name.
 *
 * @typedef {HapiServer & { db: Db, locker: LockManager }} StartedServer
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
