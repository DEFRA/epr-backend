import { describe, expect, it } from 'vitest'
import scenarioA from './scenario-a-simple-submission.json' with { type: 'json' }
import scenarioB from './scenario-b-prn-created-and-issued.json' with { type: 'json' }
import scenarioC from './scenario-c-prn-then-modified-submission.json' with { type: 'json' }

describe('Waste Balance Seed Data', () => {
  describe('Scenario A: Simple Summary Log Submission', () => {
    it('should have valid structure', () => {
      expect(scenarioA._id).toBe('674a1234567890abcdef0001')
      expect(scenarioA.organisationId).toBe('674a1234567890abcdef1001')
      expect(scenarioA.accreditationId).toBe('674a1234567890abcdef2001')
      expect(scenarioA.schemaVersion).toBe(1)
      expect(scenarioA.version).toBe(1)
      expect(scenarioA.amount).toBe(125.5)
      expect(scenarioA.availableAmount).toBe(125.5)
      expect(scenarioA.transactions).toHaveLength(1)
    })

    it('should have correct transaction amounts', () => {
      const tx = scenarioA.transactions[0]
      expect(tx.type).toBe('credit')
      expect(tx.amount).toBe(125.5)
      expect(tx.openingAmount).toBe(0)
      expect(tx.closingAmount).toBe(125.5)
      expect(tx.openingAvailableAmount).toBe(0)
      expect(tx.closingAvailableAmount).toBe(125.5)
    })

    it('should have 3 waste record entities', () => {
      const tx = scenarioA.transactions[0]
      expect(tx.entities).toHaveLength(3)
      expect(tx.entities.every((e) => e.type === 'waste_record:received')).toBe(
        true
      )
      expect(tx.entities.every((e) => e.previousVersionIds.length === 0)).toBe(
        true
      )
    })
  })

  describe('Scenario B: PRN Created and Issued', () => {
    it('should have valid structure', () => {
      expect(scenarioB._id).toBe('674a1234567890abcdef0002')
      expect(scenarioB.version).toBe(3)
      expect(scenarioB.amount).toBe(35.75)
      expect(scenarioB.availableAmount).toBe(35.75)
      expect(scenarioB.transactions).toHaveLength(4)
    })

    it('should demonstrate PRN lifecycle', () => {
      const [credit, pendingDebit, debit, sentOn] = scenarioB.transactions

      // Transaction 1: Credit from waste received
      expect(credit.type).toBe('credit')
      expect(credit.amount).toBe(100.0)
      expect(credit.closingAmount).toBe(100.0)
      expect(credit.closingAvailableAmount).toBe(100.0)

      // Transaction 2: PRN created (pending debit)
      expect(pendingDebit.type).toBe('pending_debit')
      expect(pendingDebit.amount).toBe(50.0)
      expect(pendingDebit.closingAmount).toBe(100.0) // Amount unchanged
      expect(pendingDebit.closingAvailableAmount).toBe(50.0) // Available decreased
      expect(pendingDebit.entities[0].type).toBe('prn:created')

      // Transaction 3: PRN issued (settles pending)
      expect(debit.type).toBe('debit')
      expect(debit.amount).toBe(50.0)
      expect(debit.closingAmount).toBe(50.0) // Amount decreased
      expect(debit.closingAvailableAmount).toBe(50.0) // Available unchanged
      expect(debit.entities[0].type).toBe('prn:issued')
      expect(debit.entities[0].previousVersionIds).toHaveLength(1)

      // Transaction 4: Waste sent on
      expect(sentOn.type).toBe('debit')
      expect(sentOn.amount).toBe(14.25)
      expect(sentOn.closingAmount).toBe(35.75)
    })

    it('should maintain balance integrity', () => {
      const finalTx = scenarioB.transactions[scenarioB.transactions.length - 1]
      expect(finalTx.closingAmount).toBe(scenarioB.amount)
      expect(finalTx.closingAvailableAmount).toBe(scenarioB.availableAmount)
    })
  })

  describe('Scenario C: PRN Then Modified Submission', () => {
    it('should have valid structure', () => {
      expect(scenarioC._id).toBe('674a1234567890abcdef0003')
      expect(scenarioC.version).toBe(4)
      expect(scenarioC.amount).toBe(83.25)
      expect(scenarioC.availableAmount).toBe(58.25)
      expect(scenarioC.transactions).toHaveLength(4)
    })

    it('should demonstrate resubmission delta', () => {
      const [initial, prn, delta, exported] = scenarioC.transactions

      // Transaction 1: Initial submission
      expect(initial.type).toBe('credit')
      expect(initial.amount).toBe(75.0)
      expect(initial.entities[0].previousVersionIds).toHaveLength(0)

      // Transaction 2: PRN created
      expect(prn.type).toBe('pending_debit')
      expect(prn.amount).toBe(25.0)

      // Transaction 3: Resubmission delta (+15t)
      expect(delta.type).toBe('credit')
      expect(delta.amount).toBe(15.0)
      expect(delta.entities[0].previousVersionIds).toHaveLength(1) // References v1
      expect(delta.openingAmount).toBe(75.0)
      expect(delta.closingAmount).toBe(90.0)
      // Available amount increases by 15 (pending debit still applies)
      expect(delta.openingAvailableAmount).toBe(50.0) // 75 - 25 pending
      expect(delta.closingAvailableAmount).toBe(65.0) // 90 - 25 pending

      // Transaction 4: Export/send waste
      expect(exported.type).toBe('debit')
      expect(exported.amount).toBe(6.75)
      expect(exported.entities).toHaveLength(2) // exported + sent_on
    })

    it('should show pending debit affects available amount', () => {
      const finalAmount = scenarioC.amount
      const finalAvailable = scenarioC.availableAmount
      const pendingDebit = 25.0

      expect(finalAmount - finalAvailable).toBe(pendingDebit)
    })

    it('should maintain balance integrity', () => {
      const finalTx = scenarioC.transactions[scenarioC.transactions.length - 1]
      expect(finalTx.closingAmount).toBe(scenarioC.amount)
      expect(finalTx.closingAvailableAmount).toBe(scenarioC.availableAmount)
    })
  })

  describe('Data Integrity Checks', () => {
    const scenarios = [scenarioA, scenarioB, scenarioC]

    it('should have unique IDs across all scenarios', () => {
      const ids = scenarios.map((s) => s._id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(scenarios.length)
    })

    it('should have unique accreditation IDs', () => {
      const accIds = scenarios.map((s) => s.accreditationId)
      const uniqueAccIds = new Set(accIds)
      expect(uniqueAccIds.size).toBe(scenarios.length)
    })

    scenarios.forEach((scenario, index) => {
      describe(`Scenario ${String.fromCharCode(65 + index)}`, () => {
        it('should have valid MongoDB ObjectId format', () => {
          expect(scenario._id).toMatch(/^[0-9a-f]{24}$/)
          expect(scenario.organisationId).toMatch(/^[0-9a-f]{24}$/)
          expect(scenario.accreditationId).toMatch(/^[0-9a-f]{24}$/)
        })

        it('should have all transactions with valid timestamps', () => {
          scenario.transactions.forEach((tx) => {
            expect(new Date(tx.createdAt).toISOString()).toBe(tx.createdAt)
          })
        })

        it('should have transactions in chronological order', () => {
          for (let i = 1; i < scenario.transactions.length; i++) {
            const prev = new Date(scenario.transactions[i - 1].createdAt)
            const curr = new Date(scenario.transactions[i].createdAt)
            expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime())
          }
        })

        it('should have final transaction closing amounts match document amounts', () => {
          const lastTx = scenario.transactions[scenario.transactions.length - 1]
          expect(lastTx.closingAmount).toBe(scenario.amount)
          expect(lastTx.closingAvailableAmount).toBe(scenario.availableAmount)
        })

        it('should have chained opening/closing amounts', () => {
          for (let i = 1; i < scenario.transactions.length; i++) {
            const prev = scenario.transactions[i - 1]
            const curr = scenario.transactions[i]
            expect(curr.openingAmount).toBe(prev.closingAmount)
            expect(curr.openingAvailableAmount).toBe(
              prev.closingAvailableAmount
            )
          }
        })
      })
    })
  })
})
