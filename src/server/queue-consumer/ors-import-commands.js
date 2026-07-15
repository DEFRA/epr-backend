import Joi from 'joi'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  ORS_IMPORT_COMMAND,
  ORS_IMPORT_STATUS
} from '#overseas-sites/domain/import-status.js'
import { processOrsImport } from '#overseas-sites/application/process-import.js'
import { orsImportMetrics } from '#overseas-sites/metrics/ors-imports.js'

/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {UploadsRepository} from '#domain/uploads/repository/port.js' */
/** @import {OrsImportsRepository} from '#overseas-sites/imports/repository/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {SystemLogsRepository, SystemLogHumanActor} from '#repositories/system-logs/port.js' */
/** @import {CommandHandler} from './summary-log-commands.js' */

const userSchema = Joi.object({
  id: Joi.string().required(),
  email: Joi.string().required(),
  scope: Joi.array().items(Joi.string()).required(),
  role: Joi.string().allow(null).required()
})

/**
 * @typedef {object} OrsImportHandlerDeps
 * @property {TypedLogger} logger
 * @property {OrsImportsRepository} orsImportsRepository
 * @property {UploadsRepository} uploadsRepository
 * @property {OverseasSitesRepository} overseasSitesRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {SystemLogsRepository} systemLogsRepository
 */

/**
 * @typedef {object} OrsImportPayload
 * @property {string} importId
 * @property {SystemLogHumanActor} [user]
 */

/** @type {CommandHandler} */
export const importOverseasSitesHandler = {
  command: ORS_IMPORT_COMMAND.IMPORT_OVERSEAS_SITES,
  payloadSchema: Joi.object({
    importId: Joi.string().required(),
    user: userSchema.optional()
  }),
  execute: async (
    /** @type {OrsImportPayload} */ payload,
    /** @type {OrsImportHandlerDeps} */ deps
  ) => {
    await processOrsImport(payload.importId, {
      orsImportsRepository: deps.orsImportsRepository,
      uploadsRepository: deps.uploadsRepository,
      overseasSitesRepository: deps.overseasSitesRepository,
      organisationsRepository: deps.organisationsRepository,
      systemLogsRepository: deps.systemLogsRepository,
      logger: deps.logger,
      orsImportMetrics,
      user: payload.user
    })
  },
  onFailure: async (
    /** @type {OrsImportPayload} */ payload,
    /** @type {OrsImportHandlerDeps} */ deps
  ) => {
    try {
      const updated = await deps.orsImportsRepository.updateStatus(
        payload.importId,
        ORS_IMPORT_STATUS.FAILED
      )
      if (updated) {
        await orsImportMetrics.recordStatusTransition({
          status: ORS_IMPORT_STATUS.FAILED
        })
      } else {
        deps.logger.info({
          message: `ORS import ${payload.importId} is already in a terminal status; not marking as failed`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
          }
        })
      }
    } catch (err) {
      deps.logger.error({
        err,
        message: `Failed to mark ORS import ${payload.importId} as failed`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
        }
      })
    }
  },
  describe: (/** @type {OrsImportPayload} */ payload) =>
    `importId=${payload.importId}`
}

/** @type {CommandHandler[]} */
export const orsImportCommandHandlers = [importOverseasSitesHandler]
