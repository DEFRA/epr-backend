/**
 * Waste Balances Module
 *
 * This module contains the domain, application, and repository layers for
 * waste balances. Routes remain in their original location and move in the
 * next slice.
 *
 * @module waste-balances
 */

// Domain exports
export {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from './domain/model.js'

// Repository exports
export { createWasteBalancesRepository } from './repository/mongodb.js'
