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
 * Append a single event to the waste balance stream.
 *
 * The event is written into the slot `expectedHead + 1`, where `expectedHead`
 * is the stream position the caller's decision was based on (`0` for a stream
 * the caller believes is empty). The slot index is the optimistic-concurrency
 * guard: if a competing write has advanced the head since the caller read it,
 * the slot is already occupied and `appendEvent` rejects with a
 * `StreamSlotConflictError` (ADR-0036 "detection over absorption"). Deriving
 * the slot from the caller position — rather than re-reading the head here — is
 * what makes the guard able to fire on a stale decision.
 *
 * The latest event supplies the opening balance and, for
 * `summary-log-submitted` events, the previous `creditTotal` for delta
 * computation. On the success path the head has not moved, so the latest event
 * is exactly the one at `expectedHead`; on a moved head the append fails before
 * the computed balance is persisted.
 *
 * Slot conflicts and idempotency conflicts surface directly to the caller.
 *
 * @param {import('../repository/stream-schema.js').RegistrationOrAccreditationId & {
 *   repository: import('../repository/stream-port.js').WasteBalanceStreamRepository,
 *   expectedHead: number
 * }} context
 * @param {{
 *   kind: import('../repository/stream-schema.js').StreamEventKind,
 *   payload: import('../repository/stream-schema.js').SummaryLogSubmittedPayload | import('../repository/stream-schema.js').PrnPayload,
 *   createdBy: import('../repository/stream-schema.js').StreamUserSummary
 * }} event
 * @returns {Promise<import('../repository/stream-port.js').StreamEvent>}
 */
export const appendToStream = async (
  { repository, registrationId, accreditationId, organisationId, expectedHead },
  { kind, payload, createdBy }
) => {
  const latest = await repository.findLatestByPartition(
    registrationId,
    accreditationId
  )

  const openingBalance = openingBalanceFrom(latest)
  const number = expectedHead + 1

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
