import { describe, it, expect, vi } from 'vitest'
import {
  performUpdateWasteBalanceTransactions,
  markExcludedRecords
} from './helpers.js'
import { findBalance, saveBalance } from './inmemory.js'
import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as validationPipeline from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'

describe('src/waste-balances/repository/helpers.js', () => {
  describe('markExcludedRecords', () => {
    it('should return empty array when wasteRecords is empty', () => {
      const result = markExcludedRecords([])
      expect(result).toEqual([])
    })

    it('should mark all records as not excluded when processingType is not available', () => {
      const record1 = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {} // no processingType
      }
      const record2 = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-2',
        versions: [],
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {} // no processingType
      }

      const result = markExcludedRecords([record1, record2])

      expect(result).toHaveLength(2)
      expect(result[0].excludedFromWasteBalance).toBe(false)
      expect(result[1].excludedFromWasteBalance).toBe(false)
    })

    it('should mark INCLUDED SENT_ON record as not excluded for exporters', () => {
      const sentOnRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      classifyRowSpy.mockReturnValue({
        outcome: ROW_OUTCOME.INCLUDED,
        issues: [],
        data: {}
      })

      const result = markExcludedRecords([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
    })

    it('should mark record as not excluded when exporter has unknown record type (no matching schema)', () => {
      // Cast to any: deliberately using an invalid type value ('unknown-type' is
      // not a WasteRecordType) to test the no-matching-schema branch.
      const unknownTypeRecord = /** @type {any} */ ({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: 'unknown-type',
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      })

      const result = markExcludedRecords([unknownTypeRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)
    })

    it('should mark record as not excluded when processingType is not EXPORTER (no schema lookup)', () => {
      const reprocessorRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      const result = markExcludedRecords([reprocessorRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)
    })

    it('should mark INCLUDED PROCESSED record as not excluded for reprocessor output', () => {
      const processedRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.PROCESSED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      classifyRowSpy.mockReturnValue({
        outcome: ROW_OUTCOME.INCLUDED,
        issues: [],
        data: {}
      })

      const result = markExcludedRecords([processedRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
    })

    it('should mark INCLUDED SENT_ON record as not excluded for reprocessor output', () => {
      const sentOnRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      classifyRowSpy.mockReturnValue({
        outcome: ROW_OUTCOME.INCLUDED,
        issues: [],
        data: {}
      })

      const result = markExcludedRecords([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
    })

    it('should mark INCLUDED RECEIVED record as not excluded for reprocessor input', () => {
      const receivedRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      classifyRowSpy.mockReturnValue({
        outcome: ROW_OUTCOME.INCLUDED,
        issues: [],
        data: {}
      })

      const result = markExcludedRecords([receivedRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
    })

    it('should mark INCLUDED EXPORTED record as not excluded for exporters', () => {
      const exportedRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      classifyRowSpy.mockReturnValue({
        outcome: ROW_OUTCOME.INCLUDED,
        issues: [],
        data: {}
      })

      const result = markExcludedRecords([exportedRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
    })

    it('should mark record as not excluded when processingType is completely unknown', () => {
      const unknownProcRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: 'completely-unknown'
        }
      }

      const result = markExcludedRecords([unknownProcRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)
    })

    it('should mark INCLUDED SENT_ON record as not excluded for reprocessor input', () => {
      const sentOnRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      classifyRowSpy.mockReturnValue({
        outcome: ROW_OUTCOME.INCLUDED,
        issues: [],
        data: {}
      })

      const result = markExcludedRecords([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
    })

    it('should mark record as not excluded for unknown record type in reprocessor output', () => {
      // Cast to any: deliberately using an invalid type value ('UNKNOWN' is not
      // a WasteRecordType) to test the no-matching-schema branch.
      const unknownRecord = /** @type {any} */ ({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: 'UNKNOWN',
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
        }
      })

      const result = markExcludedRecords([unknownRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)
    })

    it('should mark EXCLUDED record as excluded', () => {
      const excludedRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      classifyRowSpy.mockReturnValue({
        outcome: ROW_OUTCOME.EXCLUDED,
        issues: [],
        data: {}
      })

      const result = markExcludedRecords([excludedRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(true)

      classifyRowSpy.mockRestore()
    })
  })

  describe('performUpdateWasteBalanceTransactions', () => {
    const buildContext = () => {
      const wasteBalanceStorage = []
      const streamRepository = createInMemoryStreamRepository()()
      return {
        wasteBalanceStorage,
        streamRepository,
        find: findBalance(wasteBalanceStorage),
        save: saveBalance(wasteBalanceStorage)
      }
    }

    const user = { id: 'user-1', email: 'user-1@example.test' }

    it('does nothing when wasteRecords is empty', async () => {
      const { find, save, streamRepository, wasteBalanceStorage } =
        buildContext()

      await performUpdateWasteBalanceTransactions({
        wasteRecords: /** @type {any[]} */ ([]),
        accreditation: { id: 'acc-1' },
        dependencies: { streamRepository },
        findBalance: find,
        saveBalance: save,
        user,
        overseasSites: ORS_VALIDATION_DISABLED,
        summaryLogId: 'log-1'
      })

      expect(wasteBalanceStorage).toHaveLength(0)
      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-1'
      )
      expect(latest).toBeNull()
    })

    it('creates a shell document and appends a credit event for a brand-new accreditation', async () => {
      const { find, save, streamRepository, wasteBalanceStorage } =
        buildContext()

      const wasteRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-new',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {}
      }

      await performUpdateWasteBalanceTransactions({
        wasteRecords: [wasteRecord],
        accreditation: { id: 'acc-new' },
        dependencies: { streamRepository },
        findBalance: find,
        saveBalance: save,
        user,
        overseasSites: ORS_VALIDATION_DISABLED,
        summaryLogId: 'log-1'
      })

      expect(wasteBalanceStorage).toHaveLength(1)
      const shell = wasteBalanceStorage[0]
      expect(shell.accreditationId).toBe('acc-new')
      expect(shell.registrationId).toBe('reg-1')

      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-new'
      )
      expect(latest).not.toBeNull()
      expect(latest.kind).toBe('summary-log-submitted')
    })

    it('appends to the stream without creating a new document when the balance already exists', async () => {
      const { find, save, streamRepository, wasteBalanceStorage } =
        buildContext()

      wasteBalanceStorage.push({
        id: 'bal-existing',
        accreditationId: 'acc-existing',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        amount: 0,
        availableAmount: 0,
        version: 1,
        schemaVersion: 1
      })

      const wasteRecord = {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-existing',
        rowId: 'row-1',
        versions: [],
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {}
      }

      await performUpdateWasteBalanceTransactions({
        wasteRecords: [wasteRecord],
        accreditation: { id: 'acc-existing' },
        dependencies: { streamRepository },
        findBalance: find,
        saveBalance: save,
        user,
        overseasSites: ORS_VALIDATION_DISABLED,
        summaryLogId: 'log-1'
      })

      expect(wasteBalanceStorage).toHaveLength(1)
      const latest = await streamRepository.findLatestByPartition(
        'reg-1',
        'acc-existing'
      )
      expect(latest).not.toBeNull()
      expect(latest.kind).toBe('summary-log-submitted')
    })
  })
})
