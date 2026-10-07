import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodSchema } from '#reports/repository/schema.js'
import {
  accreditationIds,
  atNaturalKeys,
  registrationIds
} from '#routes/organisations/by-natural-key.js'
import {
  accreditationPath,
  registrationParams,
  registrationPath
} from '#routes/organisations/view-route.js'
import { reportsDelete } from './delete.js'
import { reportsGet } from './get.js'
import { reportsGetDetail } from './get-detail.js'
import { reportsPatch } from './patch.js'
import { reportsPost } from './post.js'
import { reportsRequestResubmission } from './request-resubmission.js'
import { reportsStatus } from './status.js'
import { reportsUnsubmit } from './unsubmit.js'
import { submissionNumberSchema } from './shared.js'

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { Route } from '#routes/organisations/by-natural-key.js'
 */

/**
 * The accredited stream needs the accreditation slot filled, but its routes
 * are scoped by registration alone.
 *
 * @param {Parameters<typeof accreditationIds>[0]} request
 */
const accreditedRegistrationIds = async (request) => {
  const { organisationId, registrationId } = await accreditationIds(request)
  return { organisationId, registrationId }
}

/**
 * @param {Cadence} cadence
 */
const submissionParams = (cadence) => ({
  ...registrationParams,
  year: yearSchema().required(),
  cadence: Joi.string().valid(cadence).required(),
  period: periodSchema,
  submissionNumber: submissionNumberSchema
})

const streams = [
  {
    path: `${registrationPath}/reports/{year}/{cadence}/{period}/submissions/{submissionNumber}`,
    params: submissionParams(CADENCE.quarterly),
    resolveIds: registrationIds
  },
  {
    path: `${accreditationPath}/reports/{cadence}/{period}/submissions/{submissionNumber}`,
    params: submissionParams(CADENCE.monthly),
    resolveIds: accreditedRegistrationIds
  }
]

/** @type {[Route, string][]} */
const submissionRoutes = [
  [reportsGetDetail, ''],
  [reportsPost, ''],
  [reportsPatch, ''],
  [reportsDelete, ''],
  [reportsStatus, '/status'],
  [reportsUnsubmit, '/unsubmit'],
  [reportsRequestResubmission, '/request-resubmission']
]

export const reportRoutesByNaturalKey = [
  ...streams.flatMap(({ path, params, resolveIds }) =>
    submissionRoutes.map(([route, action]) =>
      atNaturalKeys(route, `${path}${action}`, params, resolveIds)
    )
  ),
  atNaturalKeys(
    reportsGet,
    `${registrationPath}/reports/calendar`,
    registrationParams,
    registrationIds
  )
]
