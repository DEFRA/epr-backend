import { add, toNumber } from '#common/helpers/decimal-utils.js'
import {
  decemberCreditTotalFor,
  decemberRowCountFor
} from '#waste-balances/application/december-credit-total.js'
import {
  classifyWasteRecord,
  getTargetAmount
} from '#waste-balances/application/target-amount.js'
import { hashClassificationContext } from './classification-context-hash.js'
import { RECORD_CHANGE, recordChangeFor } from './record-change.js'

/**
 * @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js'
 * @import {SummaryLogCommit} from '#domain/summary-logs/commit.js'
 * @import {RowClassificationContext} from '#waste-balances/domain/waste-balance-classification.js'
 * @import {SummaryLogSubmittedTotals} from '#waste-balances/repository/ledger-schema.js'
 * @import {RecordChange} from './record-change.js'
 */

/**
 * @param {ValidatedWasteRecord[]} wasteRecords
 * @param {RowClassificationContext} classificationContext
 * @returns {SummaryLogSubmittedTotals}
 */
const submittedTotalsOf = (wasteRecords, classificationContext) => {
  const { accreditation } = classificationContext
  if (accreditation === null) {
    return { creditTotal: 0, decemberCreditTotal: 0 }
  }

  const classifiedRows = wasteRecords.map(({ record }) =>
    classifyWasteRecord(record, classificationContext)
  )
  const creditTotal = classifiedRows.reduce(
    (total, { classification }) =>
      toNumber(add(total, getTargetAmount(classification))),
    0
  )

  return {
    creditTotal,
    decemberCreditTotal: decemberCreditTotalFor(classifiedRows, accreditation)
  }
}

/** @type {Record<RecordChange, 'created' | 'updated' | null>} */
const COUNT_FOR_RECORD_CHANGE = {
  [RECORD_CHANGE.ADDED]: 'created',
  [RECORD_CHANGE.ADJUSTED]: 'updated',
  [RECORD_CHANGE.UNCHANGED]: null
}

/**
 * @param {ValidatedWasteRecord[]} wasteRecords
 * @param {RowClassificationContext} classificationContext
 * @param {Map<string, RecordChange>} recordChanges
 * @returns {SummaryLogCommit['counts']}
 */
const countsOf = (wasteRecords, classificationContext, recordChanges) => {
  /** @param {ValidatedWasteRecord} wasteRecord */
  const changeOf = ({ record }) =>
    COUNT_FOR_RECORD_CHANGE[recordChangeFor(recordChanges, record)]
  const changed = wasteRecords.filter(changeOf)
  /** @param {'created' | 'updated'} kind */
  const countOf = (kind) =>
    changed.filter((wasteRecord) => changeOf(wasteRecord) === kind).length
  const counts = { created: countOf('created'), updated: countOf('updated') }

  return {
    ...counts,
    decemberWasteRowCount: decemberRowCountFor(
      changed.map(({ record }) =>
        classifyWasteRecord(record, classificationContext)
      ),
      classificationContext.accreditation
    )
  }
}

/**
 * What submitting a validated summary log commits (ADR-0058).
 *
 * @param {object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {RowClassificationContext} params.classificationContext
 * @param {Map<string, RecordChange>} params.recordChanges
 * @returns {Omit<SummaryLogCommit, 'rowStatesWritten'>}
 */
export const submissionCommitOf = ({
  wasteRecords,
  classificationContext,
  recordChanges
}) => ({
  contextHash: hashClassificationContext(classificationContext),
  payload: submittedTotalsOf(wasteRecords, classificationContext),
  counts: countsOf(wasteRecords, classificationContext, recordChanges)
})
