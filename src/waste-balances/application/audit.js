import {
  isPayloadSmallEnoughToAudit,
  safeAudit
} from '#root/auditing/helpers.js'

/**
 * Emit the back-office system-log entry and the CDP audit event for a waste
 * balance update. Both write paths — the embedded-array path in
 * `repository/helpers.js` and the ledger-append path in
 * `application/update-via-ledger.js` — share this helper so they produce
 * identical audit shapes (ADR 0031's transparency requirement).
 *
 * Anonymous calls (no user id and no email) skip emission to support
 * background sync flows that legitimately have no user context.
 *
 * If the full payload exceeds the safe-audit size limit, the system-log
 * entry falls back to a count-only context. The audit event itself goes
 * through `safeAudit`, which has its own internal trim.
 *
 * @param {Object} params
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.systemLogsRepository]
 * @param {string} params.accreditationId
 * @param {number} params.amount
 * @param {number} params.availableAmount
 * @param {Array<Object>} params.newTransactions
 * @param {Object} [params.user]
 */
export const recordWasteBalanceUpdateAudit = async ({
  systemLogsRepository,
  accreditationId,
  amount,
  availableAmount,
  newTransactions,
  user
}) => {
  if (!user?.id && !user?.email) {
    return
  }

  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'waste-balance',
      action: 'update'
    },
    context: {
      accreditationId,
      amount,
      availableAmount,
      newTransactions
    },
    user
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: {
          accreditationId,
          amount,
          availableAmount,
          transactionCount: newTransactions.length
        }
      }

  safeAudit(safeAuditingPayload)

  if (systemLogsRepository) {
    await systemLogsRepository.insert({
      createdAt: new Date(),
      createdBy: user,
      event: payload.event,
      context: payload.context
    })
  }
}
