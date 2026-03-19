import Boom from '@hapi/boom'
import {
  createReportSchema,
  updateReportSchema,
  deleteReportParamsSchema,
  findPeriodicReportsSchema,
  findReportByIdSchema
} from './schema.js'

/**
 * @param {import('./port.js').CreateReportParams} params
 * @returns {import('./port.js').CreateReportParams}
 */
export const validateCreateReport = (params) => {
  const { error, value } = createReportSchema.validate(params, {
    abortEarly: false
  })

  if (error) {
    throw Boom.badRequest(error.message)
  }

  return value
}

/**
 * @param {import('./port.js').UpdateReportParams} params
 * @returns {import('./port.js').UpdateReportParams}
 */
export const validateUpdateReport = (params) => {
  const { error, value } = updateReportSchema.validate(params, {
    abortEarly: false
  })

  if (error) {
    throw Boom.badRequest(error.message)
  }

  return value
}

/**
 * @param {import('./port.js').DeleteReportParams} params
 * @returns {import('./port.js').DeleteReportParams}
 */
export const validateDeleteReportParams = (params) => {
  const { error, value } = deleteReportParamsSchema.validate(params, {
    abortEarly: false
  })

  if (error) {
    throw Boom.badRequest(error.message)
  }

  return value
}

/**
 * @param {import('./port.js').FindPeriodicReportsParams} params
 * @returns {import('./port.js').FindPeriodicReportsParams}
 */
export const validateFindPeriodicReports = (params) => {
  const { error, value } = findPeriodicReportsSchema.validate(params, {
    abortEarly: false
  })

  if (error) {
    throw Boom.badRequest(error.message)
  }

  return value
}

/**
 * @param {string} reportId
 * @returns {string}
 */
export const validateFindReportById = (reportId) => {
  const { error, value } = findReportByIdSchema.validate(reportId)

  if (error) {
    throw Boom.badRequest(error.message)
  }

  return value
}
