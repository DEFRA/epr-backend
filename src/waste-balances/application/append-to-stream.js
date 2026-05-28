import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../repository/stream-schema.js'
import {
  closingForSummaryLogSubmitted,
  closingForPrn
} from './stream-closing-balance.js'

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
 *   repository: import('../repository/stream-port.js').WasteBalanceStreamRepository,
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
