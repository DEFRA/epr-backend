import { portAdapter } from '#plugins/port-adapter.js'
import { createOrsImportsRepository } from './imports/repository/mongodb.js'
import { createOverseasSitesRepository } from './repository/mongodb.js'
import { overseasSiteDelete } from './routes/delete-by-id.js'
import { adminOverseasSitesList } from './routes/admin-list.js'
import { adminRegistrationServiceOverseasSitesList } from './routes/admin-registration-service-list.js'
import { orsImportStatus } from './routes/get-import-status.js'
import { overseasSitesCreate } from './routes/post.js'
import { orsImportCreate } from './routes/post-import.js'
import { orsUploadCompleted } from './routes/post-upload-completed.js'

export { processOrsImport } from './application/process-import.js'
export { orsImportMetrics } from './metrics/ors-imports.js'

/** @import { HapiServer } from '#common/hapi-types.js' */

/** The MongoDB adapter for the overseas sites repository. */
export const overseasSitesRepositoryPlugin = portAdapter({
  provides: 'overseasSitesRepository',
  needs: ['mongodb'],
  build: async (_options, { mongodb }) => createOverseasSitesRepository(mongodb)
})

/** The MongoDB adapter for the ORS imports repository. */
export const orsImportsRepositoryPlugin = portAdapter({
  provides: 'orsImportsRepository',
  needs: ['mongodb'],
  build: async (_options, { mongodb }) => createOrsImportsRepository(mongodb)
})

/** The overseas sites routes. */
export const overseasSitesRoutesPlugin = {
  name: 'overseas-sites',
  dependencies: [
    'overseasSitesRepository',
    'orsImportsRepository',
    'organisationReadRepository',
    'uploadsRepository',
    'systemLogsRepository',
    'sqs-command-executor'
  ],

  /** @param {HapiServer} server */
  register: (server) => {
    server.route([
      overseasSiteDelete,
      adminOverseasSitesList,
      adminRegistrationServiceOverseasSitesList,
      orsImportStatus,
      overseasSitesCreate,
      orsImportCreate,
      orsUploadCompleted
    ])
  }
}
