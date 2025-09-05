import Boom from '@hapi/boom'
import { logger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/index.js'
export const reportPath = '/v1/apply/report'

const allowLists = {
  organisation: ['Registered charity?'],
  accreditation: [],
  registration: []
}

function isValidIsoDateWithTemporal(str) {
  return true
  // try {
  //   // Temporal.PlainDate.from(str)
  //   return true
  // } catch {
  //   return false
  // }
}

function processAnswers(entityName, answers) {
  const allowedValues = allowLists[entityName] || []

  console.log('entityName', entityName)

  const processedAnswers = answers.map((answer) => {
    const answerBlock = {
      key: answer.shortDescription,
      valueLength: String(answer.value).length
    }

    if (allowedValues.includes(answer.shortDescription)) {
      answerBlock.value = answer.value
    }

    return answerBlock
  })

  return processedAnswers
}

const NUMBER_OF_DAYS = 30

async function getEntity(db, entityName, fromDate, toDate) {
  const cursor = db.collection(entityName).aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(
            new Date().getTime() - NUMBER_OF_DAYS * 24 * 60 * 60 * 1000
          ),
          $lt: new Date()
        }
      }
    },
    {
      $project: {
        orgId: '$orgId',
        createdAt: '$createdAt',
        orgName: '$orgName',
        email: '$email',
        nation: '$nations',
        answers: '$answers'
      }
    }
  ])

  const resp = await cursor.toArray()
  const processedResp = resp.map((obj) => {
    const { answers, ...rest } = obj
    const processedAnswers = processAnswers(entityName, answers)
    return { ...rest, answers: processedAnswers }
  })

  return { count: processedResp.length, items: processedResp }
}

const extractFromDate = (data) => {
  if (!data.fromDate) {
    throw Boom.badData('fromDate parameter is missing')
  }

  if (!isValidIsoDateWithTemporal(data.fromDate)) {
    throw Boom.badData('wrong format in fromDate')
  }

  return new Date(data.fromDate)
}

const extractToDate = (data) => {
  if (!data.toDate) {
    return null
  }

  if (!isValidIsoDateWithTemporal(data.toDate)) {
    throw Boom.badData('wrong format in toDate')
  }

  return new Date(data.toDate)
}

/**
 * Apply: Report
 * Retrieves report data.
 */
export const report = {
  method: 'GET',
  path: reportPath,
  options: {
    validate: {
      query: (data, _options) => {
        if (!data || typeof data !== 'object') {
          throw Boom.badRequest('Invalid query parameters')
        }

        const fromDate = extractFromDate(data)
        const toDate = extractToDate(data)

        return {
          fromDate,
          toDate
        }
      }
    }
    // auth: 'simple',
    // handler: (request, h) => {
    //   const { credentials } = request.auth
    //   return { message: `Hello, ${credentials.name}` }
    // }
  },
  handler: async ({ db, query }, h) => {
    const { fromDate, toDate } = query

    try {
      const organisations = await getEntity(
        db,
        'organisation',
        fromDate,
        toDate
      )
      const registrations = await getEntity(
        db,
        'registrations',
        fromDate,
        toDate
      )
      const accreditations = await getEntity(
        db,
        'accreditation',
        fromDate,
        toDate
      )
      return h.response({ organisations, registrations, accreditations })
    } catch (err) {
      const message = `Failure on ${reportPath}`

      logger.error(err, {
        message,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: 500
          }
        }
      })

      throw Boom.badImplementation(message)
    }
  }
}
