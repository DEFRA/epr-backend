import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodSchema } from '#reports/repository/schema.js'
import { atNaturalKeys } from '#routes/organisations/at-natural-keys.js'
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
 * @import { NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 */

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
    accredited: false
  },
  {
    path: `${accreditationPath}/reports/{cadence}/{period}/submissions/{submissionNumber}`,
    params: submissionParams(CADENCE.monthly),
    accredited: true
  }
]

/** @type {[NaturalKeyRoute, string][]} */
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
  ...streams.flatMap(({ path, params, accredited }) =>
    submissionRoutes.map(([route, action]) =>
      atNaturalKeys(route, `${path}${action}`, params, { accredited })
    )
  ),
  atNaturalKeys(
    reportsGet,
    `${registrationPath}/reports/calendar`,
    registrationParams
  )
]
