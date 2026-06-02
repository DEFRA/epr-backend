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
 *   organisationId?: string
 *   userId?: string
 *   subCategory?: string
 *   limit: number
 *   cursor?: string
 *   direction?: 'next' | 'prev'
 * }} FindParams
 */

/**
 * @typedef {{
 *   systemLogs: SystemLog[]
 *   hasNext: boolean
 *   hasPrev: boolean
 *   nextCursor: string | null
 *   prevCursor: string | null
 * }} PaginatedSystemLogs
 */

/**
 * @typedef {{ id: string, name: string }} SystemLogSubmitter
 */

/**
 * @typedef {{
 *   insert: (systemLog: SystemLog) => Promise<void>
 *   find: (params: FindParams) => Promise<PaginatedSystemLogs>
 *   findSubmittersBySummaryLogIds: (summaryLogIds: string[]) => Promise<Map<string, SystemLogSubmitter>>
 * }} SystemLogsRepository
 */

/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */

/** @typedef {(logger: TypedLogger) => SystemLogsRepository} SystemLogsRepositoryFactory */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
