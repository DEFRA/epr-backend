import { portAdapter } from '#plugins/port-adapter.js'
import { createMongoOrsImportsRepository } from './imports/repository/mongodb.js'
import { createMongoOverseasSitesRepository } from './repository/mongodb.js'
import { overseasSiteDelete } from './routes/delete-by-id.js'
import { adminOverseasSitesList } from './routes/admin-list.js'
import { adminRegistrationServiceOverseasSitesList } from './routes/admin-registration-service-list.js'
import { orsImportStatus } from './routes/get-import-status.js'
import { overseasSitesCreate } from './routes/post.js'
import { orsImportCreate } from './routes/post-import.js'
import { orsUploadCompleted } from './routes/post-upload-completed.js'

export { orsImportCommandHandlers } from './imports/worker/ors-import-commands.js'

/** @import { HapiServer } from '#common/hapi-types.js' */
/** @import { RegAccredApiConfig } from '#common/helpers/reg-accred-api.js' */

/** The MongoDB adapter for the overseas sites repository. */
export const overseasSitesRepositoryPlugin = portAdapter({
  provides: 'overseasSitesRepository',
  needs: ['mongodb'],
  build: async (_options, { mongodb }) =>
    createMongoOverseasSitesRepository(mongodb)
})

/** The MongoDB adapter for the ORS imports repository. */
export const orsImportsRepositoryPlugin = portAdapter({
  provides: 'orsImportsRepository',
  needs: ['mongodb'],
  build: async (_options, { mongodb }) =>
    createMongoOrsImportsRepository(mongodb)
})

/** The overseas sites routes. */
export const overseasSitesRoutesPlugin = {
  name: 'overseas-sites-routes',
  dependencies: [
    'overseasSitesRepository',
    'orsImportsRepository',
    'organisationReadRepository',
    'uploadsRepository',
    'systemLogsRepository',
    'sqs-command-executor'
  ],

  /**
   * @param {HapiServer} server
   * @param {{ orsBucket: string, regAccredApi: RegAccredApiConfig }} options
   */
  register: (server, { orsBucket, regAccredApi }) => {
    server.route([
      overseasSiteDelete,
      adminOverseasSitesList,
      adminRegistrationServiceOverseasSitesList({ regAccredApi }),
      orsImportStatus,
      overseasSitesCreate,
      orsImportCreate,
      orsUploadCompleted({ orsBucket })
    ])
  }
}
