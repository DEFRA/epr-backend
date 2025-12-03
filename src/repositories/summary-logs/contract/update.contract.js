import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildFile, buildPendingFile, buildSummaryLog } from './test-data.js'
import { waitForVersion } from './test-helpers.js'

export const testUpdateBehaviour = (it) => {
  describe('update', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    describe('basic behaviour', () => {
      it('updates an existing summary log', async () => {
        const id = `contract-update-${randomUUID()}`
        const summaryLog = buildSummaryLog({
          status: 'preprocessing',
          file: buildPendingFile({ name: 'scanning.xlsx' })
        })

        await repository.insert(id, summaryLog)
        const current = await repository.findById(id)

        await repository.update(id, current.version, {
          status: 'validating',
          file: buildFile({
            id: summaryLog.file.id,
            name: summaryLog.file.name
          })
        })

        const found = await waitForVersion(repository, id, current.version + 1)
        expect(found.summaryLog.status).toBe('validating')
        expect(found.summaryLog.file.status).toBe('complete')
        expect(found.summaryLog.file.uri).toBe('s3://test-bucket/test-key')
      })

      it('throws not found error when updating non-existent ID', async () => {
        const id = `contract-nonexistent-${randomUUID()}`

        await expect(
          repository.update(id, 1, { status: 'validating' })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 404 }
        })
      })

      it('preserves existing fields not included in update', async () => {
        const id = `contract-preserve-${randomUUID()}`
        const summaryLog = buildSummaryLog({
          status: 'preprocessing',
          organisationId: 'org-123',
          registrationId: 'reg-456',
          file: buildPendingFile()
        })

        await repository.insert(id, summaryLog)
        const current = await repository.findById(id)

        await repository.update(id, current.version, {
          status: 'rejected'
        })

        const found = await waitForVersion(repository, id, current.version + 1)
        expect(found.summaryLog.status).toBe('rejected')
        expect(found.summaryLog.organisationId).toBe('org-123')
        expect(found.summaryLog.registrationId).toBe('reg-456')
      })
    })

    describe('validation', () => {
      describe('id parameter', () => {
        it('rejects null id', async () => {
          await expect(
            repository.update(null, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects undefined id', async () => {
          await expect(
            repository.update(undefined, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects empty string id', async () => {
          await expect(
            repository.update('', 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects number id', async () => {
          const invalidNumberId = 123
          await expect(
            repository.update(invalidNumberId, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })

        it('rejects object id', async () => {
          await expect(
            repository.update({}, 1, { status: 'validating' })
          ).rejects.toThrow(/id/)
        })
      })

      describe('updates parameter', () => {
        it('strips unknown fields from updates', async () => {
          const id = `contract-strip-update-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await repository.update(id, 1, {
            status: 'validating',
            hackerField: 'DROP TABLE users;',
            evilField: 'rm -rf /'
          })

          const found = await waitForVersion(repository, id, 2)
          expect(found.summaryLog.hackerField).toBeUndefined()
          expect(found.summaryLog.evilField).toBeUndefined()
          expect(found.summaryLog.status).toBe('validating')
        })

        it('rejects update with invalid status', async () => {
          const id = `contract-invalid-update-status-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await expect(
            repository.update(id, 1, { status: 'invalid-status' })
          ).rejects.toThrow(/status/)
        })

        it('rejects update with null status', async () => {
          const id = `contract-null-status-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await expect(
            repository.update(id, 1, { status: null })
          ).rejects.toThrow(/status/)
        })

        it('rejects update with empty file object', async () => {
          const id = `contract-empty-file-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await expect(repository.update(id, 1, { file: {} })).rejects.toThrow(
            /file/
          )
        })

        it('rejects update with file missing required fields', async () => {
          const id = `contract-file-missing-fields-${randomUUID()}`
          const summaryLog = buildSummaryLog()
          await repository.insert(id, summaryLog)

          await expect(
            repository.update(id, 1, {
              file: { name: 'test.xlsx' }
            })
          ).rejects.toThrow(/id/)
        })
      })

      describe('validation field', () => {
        it('updates and retrieves validation issues', async () => {
          const id = `contract-validation-${randomUUID()}`
          const summaryLog = buildSummaryLog({ status: 'validating' })

          await repository.insert(id, summaryLog)
          const current = await repository.findById(id)

          await repository.update(id, current.version, {
            status: 'invalid',
            validation: {
              issues: [
                {
                  severity: 'fatal',
                  category: 'technical',
                  message: 'Test error',
                  context: { field: 'PROCESSING_TYPE' }
                }
              ]
            }
          })

          const found = await waitForVersion(
            repository,
            id,
            current.version + 1
          )
          expect(found.summaryLog.validation.issues).toHaveLength(1)
          expect(found.summaryLog.validation.issues[0]).toMatchObject({
            severity: 'fatal',
            category: 'technical',
            message: 'Test error',
            context: { field: 'PROCESSING_TYPE' }
          })
        })

        it('updates and retrieves validation with empty issues array', async () => {
          const id = `contract-validation-empty-${randomUUID()}`
          const summaryLog = buildSummaryLog({ status: 'validating' })

          await repository.insert(id, summaryLog)
          const current = await repository.findById(id)

          await repository.update(id, current.version, {
            status: 'validated',
            validation: {
              issues: []
            }
          })

          const found = await waitForVersion(
            repository,
            id,
            current.version + 1
          )
          expect(found.summaryLog.validation.issues).toEqual([])
        })

        it('updates and retrieves validation with multiple issues', async () => {
          const id = `contract-validation-multiple-${randomUUID()}`
          const summaryLog = buildSummaryLog({ status: 'validating' })

          await repository.insert(id, summaryLog)
          const current = await repository.findById(id)

          await repository.update(id, current.version, {
            status: 'invalid',
            validation: {
              issues: [
                {
                  severity: 'fatal',
                  category: 'business',
                  message: 'Type mismatch',
                  context: { path: 'meta.PROCESSING_TYPE' }
                },
                {
                  severity: 'fatal',
                  category: 'technical',
                  message: 'Invalid format',
                  context: { path: 'meta.MATERIAL' }
                }
              ]
            }
          })

          const found = await waitForVersion(
            repository,
            id,
            current.version + 1
          )
          expect(found.summaryLog.validation.issues).toHaveLength(2)
          expect(found.summaryLog.validation.issues[0].category).toBe(
            'business'
          )
          expect(found.summaryLog.validation.issues[1].category).toBe(
            'technical'
          )
        })

        it('updates and retrieves validation issues with optional code field', async () => {
          const id = `contract-validation-code-${randomUUID()}`
          const summaryLog = buildSummaryLog({ status: 'validating' })

          await repository.insert(id, summaryLog)
          const current = await repository.findById(id)

          await repository.update(id, current.version, {
            status: 'invalid',
            validation: {
              issues: [
                {
                  severity: 'fatal',
                  category: 'technical',
                  message: 'Missing required field',
                  code: 'MISSING_REQUIRED_FIELD',
                  context: { field: 'REGISTRATION_NUMBER' }
                }
              ]
            }
          })

          const found = await waitForVersion(
            repository,
            id,
            current.version + 1
          )
          expect(found.summaryLog.validation.issues[0]).toMatchObject({
            severity: 'fatal',
            category: 'technical',
            message: 'Missing required field',
            code: 'MISSING_REQUIRED_FIELD',
            context: { field: 'REGISTRATION_NUMBER' }
          })
        })

        it('preserves validation issues when updating other fields', async () => {
          const id = `contract-preserve-validation-${randomUUID()}`
          const summaryLog = buildSummaryLog({ status: 'validating' })

          await repository.insert(id, summaryLog)
          let current = await repository.findById(id)

          // First update: add validation issues
          await repository.update(id, current.version, {
            status: 'invalid',
            validation: {
              issues: [
                {
                  severity: 'fatal',
                  category: 'business',
                  message: 'Original error',
                  context: {}
                }
              ]
            }
          })

          current = await waitForVersion(repository, id, current.version + 1)

          // Second update: update file name only
          await repository.update(id, current.version, {
            file: {
              ...current.summaryLog.file,
              name: 'updated-filename.xlsx'
            }
          })

          const found = await waitForVersion(
            repository,
            id,
            current.version + 1
          )
          expect(found.summaryLog.file.name).toBe('updated-filename.xlsx')
          expect(found.summaryLog.validation.issues).toHaveLength(1)
          expect(found.summaryLog.validation.issues[0].message).toBe(
            'Original error'
          )
        })
      })
    })
  })
}
