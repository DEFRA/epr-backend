import { devFormSubmissionsMigratePost } from './routes/dev/migrate-post.js'
import { formSubmissionsDataGet } from './routes/get-by-id.js'

export { apply } from './apply/routes/index.js'
export { createFormCollections } from './apply/collections/create-update.js'
export { createFormsFileUploadsRepository } from './file-uploads/forms-file-uploads.js'
export { createFormDataMigrator } from './migration/migration-orchestrator.js'
export { createFormSubmissionsRepository } from './repository/mongodb.js'
export { formSubmissionsRepositoryPlugin } from './repository/mongodb.plugin.js'

/** @import { HapiServer } from '#common/hapi-types.js' */

/**
 * The forms submission data routes. With `devEndpoints`, it adds the route
 * that migrates one form submission on demand.
 */
export const formsSubmissionDataRoutesPlugin = {
  name: 'forms-submission-data',
  dependencies: ['formSubmissionsRepository'],

  /**
   * @param {HapiServer} server
   * @param {{ devEndpoints: boolean }} options
   */
  register: (server, { devEndpoints }) => {
    if (devEndpoints) {
      server.dependency(['organisationsRepository', 'systemLogsRepository'])
    }

    server.route([
      formSubmissionsDataGet,
      ...(devEndpoints ? [devFormSubmissionsMigratePost] : [])
    ])
  }
}
