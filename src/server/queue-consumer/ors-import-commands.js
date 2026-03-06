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

/** @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger */

/**
 * @typedef {object} OrsImportHandlerDeps
 * @property {TypedLogger} logger
 * @property {object} orsImportsRepository
 * @property {object} uploadsRepository
 * @property {object} overseasSitesRepository
 * @property {object} organisationsRepository
 */

/** @type {import('./summary-log-commands.js').CommandHandler[]} */
export const orsImportCommandHandlers = [
  {
    command: ORS_IMPORT_COMMAND.IMPORT_OVERSEAS_SITES,
    payloadSchema: Joi.object({
      importId: Joi.string().required()
    }),
    execute: async (payload, /** @type {OrsImportHandlerDeps} */ deps) => {
      await processOrsImport(payload.importId, {
        orsImportsRepository: deps.orsImportsRepository,
        uploadsRepository: deps.uploadsRepository,
        overseasSitesRepository: deps.overseasSitesRepository,
        organisationsRepository: deps.organisationsRepository,
        logger: deps.logger
      })
    },
    onFailure: async (payload, /** @type {OrsImportHandlerDeps} */ deps) => {
      try {
        await deps.orsImportsRepository.updateStatus(
          payload.importId,
          ORS_IMPORT_STATUS.FAILED
        )
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
    describe: (payload) => `importId=${payload.importId}`
  }
]
