import { describe, it, expect, vi } from 'vitest'
import { markExcludedRecords } from './mark-excluded-records.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as validationPipeline from '#domain/summary-logs/table-schemas/validation-pipeline.js'

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
