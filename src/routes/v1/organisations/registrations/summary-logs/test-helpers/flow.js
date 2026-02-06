import { asStandardUser } from '#test/inject-auth.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import {
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation,
  pollWhileStatus
} from './test-setup.js'

export const uploadAndValidate = async (
  env,
  organisationId,
  registrationId,
  summaryLogId,
  fileId,
  { filename, uploadData, sharedMeta }
) => {
  const { server, fileDataMap } = env

  // Register the file data for this submission
  fileDataMap[fileId] = { meta: sharedMeta, data: uploadData }

  await server.inject({
    method: 'POST',
    url: buildPostUrl(organisationId, registrationId, summaryLogId),
    payload: createUploadPayload(
      organisationId,
      registrationId,
      UPLOAD_STATUS.COMPLETE,
      fileId,
      filename
    )
  })

  await pollForValidation(server, organisationId, registrationId, summaryLogId)

  return server.inject({
    method: 'GET',
    url: buildGetUrl(organisationId, registrationId, summaryLogId),
    ...asStandardUser({ linkedOrgId: organisationId })
  })
}

export const submitAndPoll = async (
  env,
  organisationId,
  registrationId,
  summaryLogId
) => {
  const { server } = env

  await server.inject({
    method: 'POST',
    url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
    ...asStandardUser({ linkedOrgId: organisationId })
  })

  return pollWhileStatus(server, organisationId, registrationId, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.SUBMITTING,
    maxAttempts: 20
  })
}

export const performSubmission = async (
  env,
  organisationId,
  registrationId,
  summaryLogId,
  fileId,
  { filename, uploadData, sharedMeta }
) => {
  await uploadAndValidate(
    env,
    organisationId,
    registrationId,
    summaryLogId,
    fileId,
    { filename, uploadData, sharedMeta }
  )
  return submitAndPoll(env, organisationId, registrationId, summaryLogId)
}
