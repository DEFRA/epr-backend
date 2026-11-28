import { apply } from './apply/routes/index.js'
import { devFormSubmissionsMigratePost } from './routes/dev/migrate-post.js'
import { formSubmissionsDataGet } from './routes/get-by-id.js'

export { createFormCollections } from './apply/collections/create-update.js'
export { formsFileUploadsRepositoryPlugin } from './file-uploads/s3.plugin.js'
export { createFormDataMigrator } from './migration/migration-orchestrator.js'
export { formSubmissionsRepositoryPlugin } from './repository/mongodb.plugin.js'

/** @import { HapiServer } from '#common/hapi-types.js' */

/**
 * The routes that take submissions from the Defra forms. They write to their
 * collections directly and need no port, so every server registers them, the
 * legacy apply-routes server included.
 */
export const applyRoutesPlugin = {
  name: 'forms-submission-data-apply-routes',

  /** @param {HapiServer} server */
  register: (server) => {
    server.route(apply)
  }
}

/**
 * The forms submission data routes. With `devEndpoints`, it adds the route
 * that migrates one form submission on demand.
 */
export const formsSubmissionDataRoutesPlugin = {
  name: 'forms-submission-data-routes',
  dependencies: ['formSubmissionsRepository'],

  /**
   * @param {HapiServer} server
   * @param {{ devEndpoints: boolean }} options
   */
  register: (server, { devEndpoints }) => {
    if (devEndpoints) {
      server.dependency([
        'formsFileUploadsRepository',
        'organisationsRepository',
        'systemLogsRepository'
      ])
    }

    server.route([
      formSubmissionsDataGet,
      ...(devEndpoints ? [devFormSubmissionsMigratePost] : [])
    ])
  }
}
