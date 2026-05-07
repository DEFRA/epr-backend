import Boom from '@hapi/boom'

import { add, subtract, toNumber } from '#common/helpers/decimal-utils.js'

import {
  LEDGER_PRN_OPERATION_TYPE,
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../repository/ledger-schema.js'
import { appendToLedger } from './append-to-ledger.js'
import { recordWasteBalanceUpdateAudit } from './audit.js'

/**
 * @typedef {Object} PrnOperationDelta
 * @property {import('../repository/ledger-schema.js').LedgerTransactionType} type
 * @property {(opening: import('../repository/ledger-schema.js').LedgerBalanceSnapshot, tonnage: number) => import('../repository/ledger-schema.js').LedgerBalanceSnapshot} closingFor
 */

/**
 * Closing-balance arithmetic for each PRN lifecycle operation. Mirrors the
 * embedded-array v1 helpers in `repository/helpers.js` byte-for-byte so
 * flag-on / flag-off accreditations converge to the same totals for the same
 * lifecycle.
 *
 * @type {Record<import('../repository/ledger-schema.js').LedgerPrnOperationType, PrnOperationDelta>}
 */
const PRN_OPERATION_DELTAS = Object.freeze({
  [LEDGER_PRN_OPERATION_TYPE.CREATED]: {
    type: LEDGER_TRANSACTION_TYPE.DEBIT,
    closingFor: (opening, tonnage) => ({
      amount: opening.amount,
      availableAmount: toNumber(subtract(opening.availableAmount, tonnage))
    })
  },
  [LEDGER_PRN_OPERATION_TYPE.ISSUED]: {
    type: LEDGER_TRANSACTION_TYPE.DEBIT,
    closingFor: (opening, tonnage) => ({
      amount: toNumber(subtract(opening.amount, tonnage)),
      availableAmount: opening.availableAmount
    })
  },
  [LEDGER_PRN_OPERATION_TYPE.CANCELLED]: {
    type: LEDGER_TRANSACTION_TYPE.CREDIT,
    closingFor: (opening, tonnage) => ({
      amount: opening.amount,
      availableAmount: toNumber(add(opening.availableAmount, tonnage))
    })
  },
  [LEDGER_PRN_OPERATION_TYPE.ISSUED_CANCELLED]: {
    type: LEDGER_TRANSACTION_TYPE.CREDIT,
    closingFor: (opening, tonnage) => ({
      amount: toNumber(add(opening.amount, tonnage)),
      availableAmount: toNumber(add(opening.availableAmount, tonnage))
    })
  }
})

/**
 * Append a single PRN-operation transaction to the waste balance ledger and
 * emit the corresponding audit event.
 *
 * One PRN lifecycle event produces exactly one ledger transaction (ADR 0031,
 * "One balance-affecting event produces exactly one transaction"). Closing
 * totals are derived from the latest ledger entry's closing balance — the
 * embedded `transactions[]` array is bypassed entirely for `'ledger'` marker
 * accreditations.
 *
 * Audit emission goes through the shared `recordWasteBalanceUpdateAudit`
 * helper so the back-office system-logs view and the CDP audit stream see the
 * same lifecycle granularity that summary-log writes produce on the ledger
 * path.
 *
 * @param {Object} params
 * @param {import('../repository/ledger-port.js').LedgerRepository} params.ledgerRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.systemLogsRepository]
 * @param {string} params.accreditationId
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.prnId
 * @param {import('../repository/ledger-schema.js').LedgerPrnOperationType} params.operationType
 * @param {number} params.tonnage
 * @param {{ id: string, email: string }} params.user
 */
export const appendPrnOperationToLedger = async ({
  ledgerRepository,
  systemLogsRepository,
  accreditationId,
  organisationId,
  registrationId,
  prnId,
  operationType,
  tonnage,
  user
}) => {
  const delta = PRN_OPERATION_DELTAS[operationType]
  if (!delta) {
    throw Boom.badImplementation(
      `Unknown PRN ledger operation type: ${operationType}`
    )
  }

  const builder = (latest) => ({
    type: delta.type,
    amount: tonnage,
    openingBalance: { ...latest.closingBalance },
    closingBalance: delta.closingFor(latest.closingBalance, tonnage),
    source: {
      kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
      prnOperation: { prnId, operationType }
    },
    createdAt: new Date(),
    createdBy: { id: user.id, name: user.email }
  })

  const [transaction] = await appendToLedger(
    {
      repository: ledgerRepository,
      accreditationId,
      organisationId,
      registrationId
    },
    [builder]
  )

  await recordWasteBalanceUpdateAudit({
    systemLogsRepository,
    accreditationId,
    amount: transaction.closingBalance.amount,
    availableAmount: transaction.closingBalance.availableAmount,
    newTransactions: [transaction],
    user
  })
}
