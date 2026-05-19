import { add, subtract, toNumber } from '#common/helpers/decimal-utils.js'

import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'

const ZERO_BALANCE = Object.freeze({ amount: 0, availableAmount: 0 })

/**
 * @param {import('../repository/stream-port.js').StreamEvent | null} latest
 */
const openingBalanceFrom = (latest) =>
  latest === null ? { ...ZERO_BALANCE } : { ...latest.closingBalance }

/**
 * @param {import('../repository/stream-port.js').StreamEvent | null} latest
 */
const nextNumberFrom = (latest) => (latest === null ? 1 : latest.number + 1)

/**
 * Compute closing balance for a summary-log-submitted event.
 *
 * The caller supplies the aggregate `creditTotal` for this submission.
 * We read the previous summary-log-submitted event (if any) and compute
 * `delta = creditTotal - previousCreditTotal`. Both `amount` and
 * `availableAmount` shift by delta.
 *
 * @param {import('../repository/stream-schema.js').StreamBalanceSnapshot} opening
 * @param {number} creditTotal
 * @param {number} previousCreditTotal
 * @returns {import('../repository/stream-schema.js').StreamBalanceSnapshot}
 */
const closingForSummaryLogSubmitted = (
  opening,
  creditTotal,
  previousCreditTotal
) => {
  const delta = subtract(creditTotal, previousCreditTotal)
  return {
    amount: toNumber(add(opening.amount, delta)),
    availableAmount: toNumber(add(opening.availableAmount, delta))
  }
}

/**
 * Compute closing balance for a PRN event.
 *
 * @param {import('../repository/stream-schema.js').StreamBalanceSnapshot} opening
 * @param {import('../repository/stream-schema.js').StreamEventKind} kind
 * @param {number} prnAmount
 * @returns {import('../repository/stream-schema.js').StreamBalanceSnapshot}
 */
const closingForPrn = (opening, kind, prnAmount) => {
  switch (kind) {
    case STREAM_EVENT_KIND.PRN_CREATED:
      return {
        amount: opening.amount,
        availableAmount: toNumber(subtract(opening.availableAmount, prnAmount))
      }
    case STREAM_EVENT_KIND.PRN_ISSUED:
      return {
        amount: toNumber(subtract(opening.amount, prnAmount)),
        availableAmount: opening.availableAmount
      }
    case STREAM_EVENT_KIND.PRN_CREATION_CANCELLED:
      return {
        amount: opening.amount,
        availableAmount: toNumber(add(opening.availableAmount, prnAmount))
      }
    case STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE:
      return {
        amount: toNumber(add(opening.amount, prnAmount)),
        availableAmount: toNumber(add(opening.availableAmount, prnAmount))
      }
    default:
      throw new Error(`Unknown PRN event kind: ${kind}`)
  }
}

/**
 * Append a single event to the waste balance stream.
 *
 * Reads the latest event to determine the opening balance and next slot
 * number, computes the closing balance based on the event kind, and
 * persists the event.
 *
 * For `summary-log-submitted` events, also reads the latest event of
 * that kind to determine the previous `creditTotal` for delta computation.
 *
 * Slot conflicts and idempotency conflicts surface directly to the caller.
 *
 * @param {{
 *   repository: import('../repository/stream-port.js').StreamRepository,
 *   registrationId: string,
 *   accreditationId: string | null,
 *   organisationId: string
 * }} context
 * @param {{
 *   kind: import('../repository/stream-schema.js').StreamEventKind,
 *   payload: import('../repository/stream-schema.js').SummaryLogSubmittedPayload | import('../repository/stream-schema.js').PrnPayload,
 *   createdBy: import('../repository/stream-schema.js').StreamUserSummary
 * }} event
 * @returns {Promise<import('../repository/stream-port.js').StreamEvent>}
 */
export const appendToStream = async (
  { repository, registrationId, accreditationId, organisationId },
  { kind, payload, createdBy }
) => {
  const latest = await repository.findLatestByPartition(
    registrationId,
    accreditationId
  )

  const openingBalance = openingBalanceFrom(latest)
  const number = nextNumberFrom(latest)

  let closingBalance

  if (kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED) {
    const { creditTotal } =
      /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
        payload
      )

    const previousSubmission = await repository.findLatestByPartitionAndKind(
      registrationId,
      accreditationId,
      STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
    )

    const previousCreditTotal = previousSubmission
      ? /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
          previousSubmission.payload
        ).creditTotal
      : 0

    closingBalance = closingForSummaryLogSubmitted(
      openingBalance,
      creditTotal,
      previousCreditTotal
    )
  } else {
    const { amount } =
      /** @type {import('../repository/stream-schema.js').PrnPayload} */ (
        payload
      )
    closingBalance = closingForPrn(openingBalance, kind, amount)
  }

  return repository.appendEvent({
    registrationId,
    accreditationId,
    organisationId,
    number,
    kind,
    payload,
    openingBalance,
    closingBalance,
    createdAt: new Date(),
    createdBy
  })
}
