/**
 * @typedef {{
 *   createdAt: Date
 *   createdBy: {
 *     id: string
 *     email: string
 *     scope: string[]
 *   }
 *   event: {
 *     category: string
 *     subCategory: string
 *     action: string
 *   }
 *   context: Object
 * }} SystemLog
 */

/**
 * @typedef {{
 *   organisationId: string
 *   limit: number
 *   cursor?: string
 * }} FindByOrganisationIdParams
 */

/**
 * @typedef {{
 *   systemLogs: SystemLog[]
 *   hasMore: boolean
 *   nextCursor: string | null
 * }} PaginatedSystemLogs
 */

/**
 * @typedef {{
 *   insert: (systemLog: SystemLog) => Promise<void>
 *   findByOrganisationId: (params: FindByOrganisationIdParams) => Promise<PaginatedSystemLogs>
 * }} SystemLogsRepository
 */

/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */

/** @typedef {(logger: TypedLogger) => SystemLogsRepository} SystemLogsRepositoryFactory */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
