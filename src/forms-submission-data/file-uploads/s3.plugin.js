import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { portAdapter } from '#plugins/port-adapter.js'
import { createFormsFileUploadsRepository } from './forms-file-uploads.js'

/** @import { FormsSubmissionApi } from './forms-file-uploads.js' */
/** @import { RegulatorEmails } from './get-retrieval-key.js' */

/**
 * @typedef {{
 *   s3: { region: string, endpoint: string, forcePathStyle: boolean }
 *   formsSubmissionApi: FormsSubmissionApi
 *   regulators: RegulatorEmails
 * }} FormsFileUploadsOptions
 */

export const formsFileUploadsRepositoryPlugin = portAdapter({
  provides: 'formsFileUploadsRepository',
  needs: [],
  /** @param {FormsFileUploadsOptions} options */
  build: ({ s3, formsSubmissionApi, regulators }) => {
    const repository = createFormsFileUploadsRepository({
      s3Client: createS3Client(s3),
      formsSubmissionApi,
      regulators
    })
    return () => repository
  }
})
