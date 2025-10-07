import Boom from '@hapi/boom'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */

export const summaryLogsUploadCompletedPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/upload-completed'

export const summaryLogsUploadCompleted = {
  method: 'POST',
  path: summaryLogsUploadCompletedPath,
  options: {
    validate: {
      payload: (data, _options) => {
        if (!data || typeof data !== 'object') {
          throw Boom.badRequest('Invalid payload')
        }

        if (!data.form?.file) {
          throw Boom.badData('form.file is missing in payload')
        }

        return data
      }
    }
  },
  /**
   * @param {Object} request
   * @param {SummaryLogsRepository} request.summaryLogsRepository
   * @param {Object} request.payload
   * @param {Object} request.params
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ summaryLogsRepository, payload, params }, h) => {
    const { summaryLogId } = params
    const { file } = payload.form

    await summaryLogsRepository.insert({
      summaryLogId,
      fileId: file.fileId,
      filename: file.filename,
      fileStatus: file.fileStatus,
      s3Bucket: file.s3Bucket,
      s3Key: file.s3Key
    })

    return h.response().code(200)
  }
}
