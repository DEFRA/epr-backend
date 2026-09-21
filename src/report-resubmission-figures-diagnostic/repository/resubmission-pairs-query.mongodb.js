import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { reportsCollection } from '#reports/repository/mongodb-collection.js'

/**
 * Ad-hoc read for the PAE-1985 resubmission-figures spike only — it groups
 * submitted reports into their resubmission chains, so it stays out of
 * src/reports/repository/ rather than sit alongside the supported repository
 * methods as something other callers might reach for.
 */

/** @import { ResubmissionPeriodGroup } from '#report-resubmission-figures-diagnostic/application/diagnose-resubmission-figures.js' */

/**
 * A period is a resubmission chain only when it has more than one submitted
 * report; a lone submission has nothing to diff against.
 */
const MIN_SUBMISSIONS_FOR_RESUBMISSION = 2

const RESUBMISSION_PAIRS_PIPELINE = [
  { $match: { 'status.currentStatus': REPORT_STATUS.SUBMITTED } },
  { $sort: { submissionNumber: 1 } },
  {
    $group: {
      _id: {
        organisationId: '$organisationId',
        registrationId: '$registrationId',
        year: '$year',
        cadence: '$cadence',
        period: '$period'
      },
      submissions: {
        $push: {
          submissionNumber: '$submissionNumber',
          resubmissionRequired: '$resubmissionRequired',
          recyclingActivity: '$recyclingActivity',
          exportActivity: '$exportActivity',
          wasteSent: '$wasteSent',
          prn: '$prn'
        }
      },
      count: { $sum: 1 }
    }
  },
  { $match: { count: { $gte: MIN_SUBMISSIONS_FOR_RESUBMISSION } } }
]

/**
 * Finds every reporting period with at least two submitted reports (a
 * resubmission chain), returning each submission's figure-bearing blocks in
 * `submissionNumber` order so the caller can diff successive pairs.
 *
 * @param {import('mongodb').Db} db
 * @returns {() => Promise<{ scanned: number, groups: ResubmissionPeriodGroup[] }>}
 */
export const createResubmissionPairsQuery = (db) => {
  const collection = reportsCollection(db)

  return async () => {
    const [scanned, docs] = await Promise.all([
      collection.countDocuments({
        'status.currentStatus': REPORT_STATUS.SUBMITTED
      }),
      collection.aggregate(RESUBMISSION_PAIRS_PIPELINE).toArray()
    ])

    const groups = docs.map((doc) => ({
      organisationId: doc._id.organisationId,
      registrationId: doc._id.registrationId,
      year: doc._id.year,
      cadence: doc._id.cadence,
      period: doc._id.period,
      submissions: doc.submissions
    }))

    return { scanned, groups }
  }
}
