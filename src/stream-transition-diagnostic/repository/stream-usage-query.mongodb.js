import { REGISTERED_ONLY_PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'

/**
 * Ad-hoc read for the PAE-1924 stream-transition diagnostic only — not a
 * supported summary-logs repository method, so it stays out of
 * src/repositories/summary-logs/ rather than sit alongside findAllByOrgReg
 * and friends as something other callers might reach for.
 */

/**
 * @typedef {Object} StreamUsage
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {number} registeredOnlySubmissions - count of successful registered-only submissions
 * @property {number} accreditedSubmissions - count of successful accredited submissions
 * @property {Date} registeredOnlyLastSubmittedAt
 * @property {Date} accreditedFirstSubmittedAt
 * @property {string[]} registrationNumbers - distinct `meta.REGISTRATION_NUMBER` values seen
 * @property {string[]} accreditationNumbers - distinct `meta.ACCREDITATION_NUMBER` values seen
 */

const REGISTERED_ONLY = [...REGISTERED_ONLY_PROCESSING_TYPES]

/**
 * Successful submissions only: a rejected or failed upload produced no
 * reported data, so it is not one of the times an operator "got data in" on a
 * stream. This is narrower than findAllByOrgReg's
 * [SUBMITTED, ...SUMMARY_LOG_FAILURE_STATUS] set, which exists to show an
 * operator their history including what failed.
 */
const STREAM_USAGE_PIPELINE = [
  {
    $match: {
      status: SUMMARY_LOG_STATUS.SUBMITTED,
      'meta.PROCESSING_TYPE': { $exists: true }
    }
  },
  {
    $addFields: {
      _stream: {
        $cond: [
          { $in: ['$meta.PROCESSING_TYPE', REGISTERED_ONLY] },
          'registeredOnly',
          'accredited'
        ]
      }
    }
  },
  {
    $group: {
      _id: {
        organisationId: '$organisationId',
        registrationId: '$registrationId'
      },
      streams: { $addToSet: '$_stream' },
      registeredOnlySubmissions: {
        $sum: { $cond: [{ $eq: ['$_stream', 'registeredOnly'] }, 1, 0] }
      },
      accreditedSubmissions: {
        $sum: { $cond: [{ $eq: ['$_stream', 'accredited'] }, 1, 0] }
      },
      registeredOnlyLastSubmittedAt: {
        $max: {
          $cond: [{ $eq: ['$_stream', 'registeredOnly'] }, '$submittedAt', null]
        }
      },
      accreditedFirstSubmittedAt: {
        $min: {
          $cond: [{ $eq: ['$_stream', 'accredited'] }, '$submittedAt', null]
        }
      },
      registrationNumbers: { $addToSet: '$meta.REGISTRATION_NUMBER' },
      accreditationNumbers: { $addToSet: '$meta.ACCREDITATION_NUMBER' }
    }
  },
  // Both streams present: streams holds at most two values, so a second entry
  // existing means the pair spans both.
  { $match: { 'streams.1': { $exists: true } } }
]

/**
 * Finds every `{organisationId, registrationId}` pair whose successful
 * summary-log submissions span both the registered-only and accredited
 * streams, with per-stream submission counts and boundary timestamps.
 *
 * @param {import('mongodb').Db} db
 * @returns {() => Promise<{ scanned: number, usages: StreamUsage[] }>}
 */
export const createStreamUsageQuery = (db) => {
  const collection = db.collection(COLLECTION_NAME)

  return async () => {
    const [scanned, docs] = await Promise.all([
      collection.estimatedDocumentCount(),
      collection.aggregate(STREAM_USAGE_PIPELINE).toArray()
    ])

    // Both streams are guaranteed present by the pipeline's final $match, so
    // registeredOnlyLastSubmittedAt/accreditedFirstSubmittedAt are always set.
    const usages = docs.map((doc) => ({
      organisationId: doc._id.organisationId,
      registrationId: doc._id.registrationId,
      registeredOnlySubmissions: doc.registeredOnlySubmissions,
      accreditedSubmissions: doc.accreditedSubmissions,
      registeredOnlyLastSubmittedAt: doc.registeredOnlyLastSubmittedAt,
      accreditedFirstSubmittedAt: doc.accreditedFirstSubmittedAt,
      registrationNumbers: doc.registrationNumbers.filter(Boolean),
      accreditationNumbers: doc.accreditationNumbers.filter(Boolean)
    }))

    return { scanned, usages }
  }
}
