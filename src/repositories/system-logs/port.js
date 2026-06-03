/**
 * The actor on a system log. A human session carries an email and scope; a
 * machine credential carries a name instead. Both always carry an id.
 *
 * @typedef {(
 *   | { id: string, email: string, scope: string[] }
 *   | { id: string, name: string }
 * )} SystemLogActor
 */

/**
 * @typedef {{
 *   createdAt: Date
 *   createdBy: SystemLogActor
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
 *   cursor?: string | null
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
 * @typedef {{
 *   summaryLogId: string
 *   createdBy: SystemLog['createdBy']
 * }} SummaryLogSubmitActor
 */

/**
 * @typedef {{
 *   insert: (systemLog: SystemLog) => Promise<void>
 *   find: (params: FindParams) => Promise<PaginatedSystemLogs>
 *   findSummaryLogSubmitActors: (organisationId: string) => Promise<SummaryLogSubmitActor[]>
 * }} SystemLogsRepository
 */

/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */

/** @typedef {(logger: TypedLogger) => SystemLogsRepository} SystemLogsRepositoryFactory */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
