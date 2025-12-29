import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration,
  prepareOrgUpdate
} from './test-data.js'
import {
  MATERIAL,
  REG_ACC_STATUS,
  REPROCESSING_TYPE,
  TIME_SCALE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

export const testRegAccApprovalValidation = (it) => {
  const DAY = 24 * 60 * 60 * 1000
  const oneDayAgo = new Date(Date.now() - DAY)
  const twoDaysAgo = new Date(Date.now() - 2 * DAY)

  describe('approval validation', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('accreditation approval validation', () => {
      it('rejects when approved accreditation has no linked approved registration', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        const accreditationToUpdate = {
          ...inserted.accreditations[0],
          status: REG_ACC_STATUS.APPROVED,
          accreditationNumber: 'ACC12345',
          validFrom: new Date('2025-01-01'),
          validTo: new Date('2025-12-31'),
          reprocessingType: REPROCESSING_TYPE.INPUT
        }

        await expect(
          repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              accreditations: [accreditationToUpdate]
            })
          )
        ).rejects.toThrow(
          `Accreditations with id ${inserted.accreditations[0].id} are approved but not linked to an approved registration`
        )
      })

      it('accepts when approved accreditation has linked approved registration', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        const accreditationToUpdate = {
          ...inserted.accreditations[0],
          status: REG_ACC_STATUS.APPROVED,
          accreditationNumber: 'ACC12345',
          validFrom: new Date('2025-01-01'),
          validTo: new Date('2025-12-31'),
          reprocessingType: REPROCESSING_TYPE.INPUT
        }

        const registrationToUpdate = {
          ...inserted.registrations[0],
          status: REG_ACC_STATUS.APPROVED,
          validFrom: new Date('2025-01-01'),
          registrationNumber: 'REG12345',
          validTo: new Date('2025-12-31'),
          reprocessingType: REPROCESSING_TYPE.INPUT,
          accreditationId: inserted.accreditations[0].id
        }

        await repository.replace(
          organisation.id,
          1,
          prepareOrgUpdate(inserted, {
            accreditations: [accreditationToUpdate],
            registrations: [registrationToUpdate]
          })
        )

        const updated = await repository.findById(organisation.id, 2)
        const updatedAcc = updated.accreditations.find(
          (a) => a.id === accreditationToUpdate.id
        )
        expect(updatedAcc.status).toBe(REG_ACC_STATUS.APPROVED)
        expect(updatedAcc.accreditationNumber).toBe('ACC12345')
      })
    })

    describe('unique approval validation', () => {
      describe('accreditations', () => {
        it('accepts approved reprocessor accreditations with different keys', async () => {
          const organisation = buildOrganisation()
          const acc1Id = new ObjectId().toString()
          const acc2Id = new ObjectId().toString()

          const orgData = {
            ...organisation,
            accreditations: [
              buildAccreditation({
                id: acc1Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                site: {
                  address: { line1: '123 Test St', postcode: 'AB12 3CD' }
                }
              }),
              buildAccreditation({
                id: acc2Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.ALUMINIUM,
                glassRecyclingProcess: null,
                site: {
                  address: { line1: '456 Test Ave', postcode: 'XY98 7ZW' }
                }
              })
            ],
            registrations: [
              buildRegistration({
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                accreditationId: acc1Id,
                site: {
                  address: { line1: '123 Test St', postcode: 'AB12 3CD' },
                  gridReference: 'ST123456',
                  siteCapacity: [
                    {
                      material: MATERIAL.PAPER,
                      siteCapacityInTonnes: 1000,
                      siteCapacityTimescale: TIME_SCALE.YEARLY
                    }
                  ]
                }
              }),
              buildRegistration({
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.ALUMINIUM,
                glassRecyclingProcess: null,
                accreditationId: acc2Id,
                site: {
                  address: { line1: '456 Test Ave', postcode: 'XY98 7ZW' },
                  gridReference: 'ST789012',
                  siteCapacity: [
                    {
                      material: MATERIAL.ALUMINIUM,
                      siteCapacityInTonnes: 2000,
                      siteCapacityTimescale: TIME_SCALE.YEARLY
                    }
                  ]
                }
              })
            ]
          }

          await repository.insert(orgData)
          const inserted = await repository.findById(organisation.id)

          const validUpdates = {
            accreditations: inserted.accreditations.map((acc) => ({
              ...acc,
              status: REG_ACC_STATUS.APPROVED,
              accreditationNumber: `ACC-${acc.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            })),
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            }))
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, validUpdates)
          )

          const saved = await repository.findById(organisation.id, 2)
          expect(saved.accreditations).toHaveLength(2)
          expect(
            saved.accreditations.every(
              (a) => a.status === REG_ACC_STATUS.APPROVED
            )
          ).toBe(true)
        })

        it('accepts approved exporter accreditations with different keys', async () => {
          const organisation = buildOrganisation()
          const acc1Id = new ObjectId().toString()
          const acc2Id = new ObjectId().toString()

          const orgData = {
            ...organisation,
            accreditations: [
              buildAccreditation({
                id: acc1Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                site: undefined,
                orsFileUploads: [
                  {
                    defraFormUploadedFileId: 'file-1',
                    defraFormUserDownloadLink: 'https://example.com/file-1'
                  }
                ]
              }),
              buildAccreditation({
                id: acc2Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.ALUMINIUM,
                glassRecyclingProcess: null,
                site: undefined,
                orsFileUploads: [
                  {
                    defraFormUploadedFileId: 'file-2',
                    defraFormUserDownloadLink: 'https://example.com/file-2'
                  }
                ]
              })
            ],
            registrations: [
              buildRegistration({
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.PAPER,
                accreditationId: acc1Id,
                exportPorts: ['Port A'],
                noticeAddress: { line1: '123 Test St', postcode: 'AB12 3CD' }
              }),
              buildRegistration({
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.ALUMINIUM,
                accreditationId: acc2Id,
                exportPorts: ['Port B'],
                noticeAddress: { line1: '456 Test Ave', postcode: 'XY98 7ZW' }
              })
            ]
          }

          await repository.insert(orgData)
          const inserted = await repository.findById(organisation.id)

          const validUpdates = {
            accreditations: inserted.accreditations.map((acc) => {
              return {
                ...acc,
                status: REG_ACC_STATUS.APPROVED,
                accreditationNumber: `ACC-${acc.id}`,
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              }
            }),
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }))
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, validUpdates)
          )

          const saved = await repository.findById(organisation.id, 2)
          expect(saved.accreditations).toHaveLength(2)
        })

        it('rejects duplicate approved reprocessor accreditations with same key', async () => {
          const organisation = buildOrganisation()
          const acc1Id = new ObjectId().toString()
          const acc2Id = new ObjectId().toString()

          const orgData = {
            ...organisation,
            accreditations: [
              buildAccreditation({
                id: acc1Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                reprocessingType: REPROCESSING_TYPE.INPUT,
                site: {
                  address: { line1: '123 Test St', postcode: 'AB12 3CD' }
                }
              }),
              buildAccreditation({
                id: acc2Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                reprocessingType: REPROCESSING_TYPE.INPUT,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                site: {
                  address: { line1: '456 Test Ave', postcode: 'AB12 3CD' }
                }
              })
            ]
          }

          await repository.insert(orgData)
          const inserted = await repository.findById(organisation.id)

          const invalidUpdates = {
            accreditations: inserted.accreditations.map((acc) => ({
              ...acc,
              status: REG_ACC_STATUS.APPROVED,
              accreditationNumber: `ACC-${acc.id}`,
              ...(acc.wasteProcessingType ===
                WASTE_PROCESSING_TYPE.REPROCESSOR && {
                reprocessingType: REPROCESSING_TYPE.INPUT
              }),
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            })),
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              ...(reg.wasteProcessingType ===
                WASTE_PROCESSING_TYPE.REPROCESSOR && {
                reprocessingType: REPROCESSING_TYPE.INPUT
              }),
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }))
          }

          const duplicateKey = 'reprocessor::paper::AB123CD::input'
          const expectedError =
            `Accreditations with id ${inserted.accreditations[0].id}, ${inserted.accreditations[1].id} are approved but not linked to an approved registration; ` +
            `Multiple approved accreditations found with duplicate keys [${duplicateKey}]: ${inserted.accreditations[0].id}, ${inserted.accreditations[1].id}`

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, invalidUpdates)
            )
          ).rejects.toThrow(expectedError)
        })

        it('rejects duplicate approved exporter accreditations with same key', async () => {
          const organisation = buildOrganisation()
          const acc1Id = new ObjectId().toString()
          const acc2Id = new ObjectId().toString()

          const orgData = {
            ...organisation,
            accreditations: [
              buildAccreditation({
                id: acc1Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                site: undefined,
                orsFileUploads: [
                  {
                    defraFormUploadedFileId: 'file-1',
                    defraFormUserDownloadLink: 'https://example.com/file-1'
                  }
                ],
                formSubmissionTime: twoDaysAgo
              }),
              buildAccreditation({
                id: acc2Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                site: undefined,
                orsFileUploads: [
                  {
                    defraFormUploadedFileId: 'file-2',
                    defraFormUserDownloadLink: 'https://example.com/file-2'
                  }
                ],
                formSubmissionTime: oneDayAgo
              })
            ]
          }

          await repository.insert(orgData)
          const inserted = await repository.findById(organisation.id)

          const invalidUpdates = {
            accreditations: inserted.accreditations.map((acc) => {
              return {
                ...acc,
                status: REG_ACC_STATUS.APPROVED,
                accreditationNumber: `ACC-${acc.id}`,
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              }
            })
          }

          const duplicateKey = `exporter::paper`
          const expectedError =
            `Accreditations with id ${inserted.accreditations[0].id}, ${inserted.accreditations[1].id} are approved but not linked to an approved registration; ` +
            `Multiple approved accreditations found with duplicate keys [${duplicateKey}]: ${inserted.accreditations[0].id}, ${inserted.accreditations[1].id}`
          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, invalidUpdates)
            )
          ).rejects.toThrow(expectedError)
        })
      })

      describe('registrations', () => {
        it('rejects duplicate approved reprocessor registrations with same key', async () => {
          const organisation = buildOrganisation()

          const orgData = {
            ...organisation,
            registrations: [
              buildRegistration({
                id: new ObjectId().toString(),
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                site: {
                  address: { line1: '123 Test St', postcode: 'AB12 3CD' },
                  gridReference: 'ST123456',
                  siteCapacity: [
                    {
                      material: MATERIAL.PAPER,
                      siteCapacityInTonnes: 1000,
                      siteCapacityTimescale: TIME_SCALE.YEARLY
                    }
                  ]
                }
              }),
              buildRegistration({
                id: new ObjectId().toString(),
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                site: {
                  address: { line1: '456 Test Ave', postcode: 'AB12 3CD' },
                  gridReference: 'ST789012',
                  siteCapacity: [
                    {
                      material: MATERIAL.PAPER,
                      siteCapacityInTonnes: 2000,
                      siteCapacityTimescale: TIME_SCALE.YEARLY
                    }
                  ]
                }
              })
            ]
          }

          await repository.insert(orgData)
          const inserted = await repository.findById(organisation.id)

          const invalidUpdates = {
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            }))
          }

          const duplicateKey = 'reprocessor::paper::AB123CD::input'
          const expectedError = `Multiple approved registrations found with duplicate keys [${duplicateKey}]: ${inserted.registrations[0].id}, ${inserted.registrations[1].id}`

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, invalidUpdates)
            )
          ).rejects.toThrow(expectedError)
        })

        it('accepts approved reprocessor registrations with different keys', async () => {
          const organisation = buildOrganisation()

          const orgData = {
            ...organisation,
            registrations: [
              buildRegistration({
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.PAPER,
                glassRecyclingProcess: null,
                site: {
                  address: { line1: '123 Test St', postcode: 'AB12 3CD' },
                  gridReference: 'ST123456',
                  siteCapacity: [
                    {
                      material: MATERIAL.PAPER,
                      siteCapacityInTonnes: 1000,
                      siteCapacityTimescale: TIME_SCALE.YEARLY
                    }
                  ]
                }
              }),
              buildRegistration({
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
                material: MATERIAL.ALUMINIUM,
                glassRecyclingProcess: null,
                site: {
                  address: { line1: '456 Test Ave', postcode: 'XY98 7ZW' },
                  gridReference: 'ST789012',
                  siteCapacity: [
                    {
                      material: MATERIAL.ALUMINIUM,
                      siteCapacityInTonnes: 2000,
                      siteCapacityTimescale: TIME_SCALE.YEARLY
                    }
                  ]
                }
              })
            ]
          }

          await repository.insert(orgData)
          const inserted = await repository.findById(organisation.id)

          const validUpdates = {
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31'),
              reprocessingType: REPROCESSING_TYPE.INPUT
            }))
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, validUpdates)
          )

          const saved = await repository.findById(organisation.id, 2)
          expect(saved.registrations).toHaveLength(2)
        })

        it('accepts approved exporter registrations with different keys', async () => {
          const organisation = buildOrganisation()

          const orgData = {
            ...organisation,
            registrations: [
              buildRegistration({
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.PAPER,
                exportPorts: ['Port A'],
                noticeAddress: { line1: '123 Test St', postcode: 'AB12 3CD' }
              }),
              buildRegistration({
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.ALUMINIUM,
                exportPorts: ['Port B'],
                noticeAddress: { line1: '456 Test Ave', postcode: 'XY98 7ZW' }
              })
            ]
          }

          await repository.insert(orgData)
          const inserted = await repository.findById(organisation.id)

          const validUpdates = {
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }))
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, validUpdates)
          )

          const saved = await repository.findById(organisation.id, 2)
          expect(saved.registrations).toHaveLength(2)
        })

        it('rejects duplicate approved exporter registrations with same key', async () => {
          const organisation = buildOrganisation()

          const orgData = {
            ...organisation,
            registrations: [
              buildRegistration({
                id: new ObjectId().toString(),
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.PAPER,
                exportPorts: ['Port A'],
                noticeAddress: { line1: '123 Test St', postcode: 'AB12 3CD' }
              }),
              buildRegistration({
                id: new ObjectId().toString(),
                wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
                material: MATERIAL.PAPER,
                exportPorts: ['Port B'],
                noticeAddress: { line1: '456 Test Ave', postcode: 'XY98 7ZW' }
              })
            ]
          }

          await repository.insert(orgData)
          const inserted = await repository.findById(organisation.id)

          const invalidUpdates = {
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }))
          }

          const duplicateKey = 'exporter::paper'
          const expectedError = `Multiple approved registrations found with duplicate keys [${duplicateKey}]: ${inserted.registrations[0].id}, ${inserted.registrations[1].id}`

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, invalidUpdates)
            )
          ).rejects.toThrow(expectedError)
        })
      })
    })

    describe('conditional field validation', () => {
      describe('reprocessingType', () => {
        it('rejects update when registration status changes to approved without reprocessingType', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                registrations: [registrationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.reprocessingType: any.only; registrations.0.reprocessingType: any.invalid; registrations.0.reprocessingType: string.base'
          )
        })

        it('rejects update when accreditation status changes to approved without reprocessingType', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC123',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                accreditations: [accreditationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.reprocessingType: any.only; accreditations.0.reprocessingType: any.invalid; accreditations.0.reprocessingType: string.base'
          )
        })
      })

      describe('registrationNumber', () => {
        it('rejects update when registration status changes to approved without registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: null,
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                registrations: [registrationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.registrationNumber: any.invalid'
          )
        })

        it('allows update when registration status changes to approved with registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31'),
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [registrationToUpdate]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registrationToUpdate.id
          )

          expect(updatedReg.status).toBe(REG_ACC_STATUS.APPROVED)
          expect(updatedReg.registrationNumber).toBe('REG12345')
          expect(updatedReg.validFrom.toISOString()).toBe(
            '2025-01-01T00:00:00.000Z'
          )
          expect(updatedReg.validTo.toISOString()).toBe(
            '2025-12-31T00:00:00.000Z'
          )
        })

        it('rejects update when registration status changes to suspended without registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.SUSPENDED,
            registrationNumber: null,
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                registrations: [registrationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.registrationNumber: any.invalid'
          )
        })
      })

      describe('accreditationNumber', () => {
        it('rejects update when accreditation status changes to approved without accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: null,
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                accreditations: [accreditationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.accreditationNumber: any.invalid'
          )
        })

        it('allows update when accreditation status changes to approved with accreditationNumber and approved registration', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31'),
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              accreditations: [accreditationToUpdate],
              registrations: [
                {
                  ...inserted.registrations[0],
                  status: REG_ACC_STATUS.APPROVED,
                  validFrom: new Date('2025-01-01'),
                  registrationNumber: 'REG12345',
                  validTo: new Date('2025-12-31'),
                  accreditationId: inserted.accreditations[0].id,
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.status).toBe(REG_ACC_STATUS.APPROVED)
          expect(updatedAcc.accreditationNumber).toBe('ACC12345')
          expect(updatedAcc.validFrom.toISOString()).toBe(
            '2025-01-01T00:00:00.000Z'
          )
          expect(updatedAcc.validTo.toISOString()).toBe(
            '2025-12-31T00:00:00.000Z'
          )
        })

        it('rejects update when accreditation status changes to suspended without accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.SUSPENDED,
            accreditationNumber: null,
            reprocessingType: REPROCESSING_TYPE.INPUT,
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                accreditations: [accreditationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.accreditationNumber: any.invalid'
          )
        })

        it('allows update when accreditation status is not approved or suspended without accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            material: 'plastic',
            accreditationNumber: null,
            glassRecyclingProcess: null
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              accreditations: [accreditationToUpdate]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.material).toBe('plastic')
          expect(updatedAcc.accreditationNumber).toBeNull()
        })
      })

      describe('validFrom and validTo for registrations', () => {
        it('rejects update when registration status changes to approved without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: null,
            validTo: new Date('2025-12-31'),
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                registrations: [registrationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.validFrom: any.invalid'
          )
        })

        it('rejects update when registration status changes to approved without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            reprocessingType: REPROCESSING_TYPE.INPUT,
            validTo: null
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                registrations: [registrationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.validTo: any.invalid'
          )
        })

        it('allows update when registration status changes to approved with validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom,
            validTo,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [registrationToUpdate]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registrationToUpdate.id
          )

          expect(updatedReg.status).toBe(REG_ACC_STATUS.APPROVED)
          expect(updatedReg.validFrom).toEqual(validFrom)
          expect(updatedReg.validTo).toEqual(validTo)
          expect(updatedReg.validFrom.toISOString()).toBe(
            '2025-01-01T00:00:00.000Z'
          )
          expect(updatedReg.validTo.toISOString()).toBe(
            '2025-12-31T00:00:00.000Z'
          )
        })

        it('rejects update when registration status changes to suspended without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.SUSPENDED,
            registrationNumber: 'REG12345',
            validFrom: null,
            validTo: new Date('2025-12-31'),
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                registrations: [registrationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.validFrom: any.invalid'
          )
        })

        it('rejects update when registration status changes to suspended without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: REG_ACC_STATUS.SUSPENDED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: null,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                registrations: [registrationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: registrations.0.validTo: any.invalid'
          )
        })

        it('allows update when registration status is not approved or suspended without validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            material: 'plastic',
            glassRecyclingProcess: null,
            validFrom: null,
            validTo: null
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [registrationToUpdate]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedReg = result.registrations.find(
            (r) => r.id === registrationToUpdate.id
          )

          expect(updatedReg.material).toBe('plastic')
          expect(updatedReg.validFrom).toBeNull()
          expect(updatedReg.validTo).toBeNull()
        })
      })

      describe('validFrom and validTo for accreditations', () => {
        it('rejects update when accreditation status changes to approved without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: null,
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                accreditations: [accreditationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.validFrom: any.invalid'
          )
        })

        it('rejects update when accreditation status changes to approved without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: null
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                accreditations: [accreditationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.validTo: any.invalid'
          )
        })

        it('allows update when accreditation status changes to approved with validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom,
            validTo,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              accreditations: [accreditationToUpdate],
              registrations: [
                {
                  ...inserted.registrations[0],
                  status: REG_ACC_STATUS.APPROVED,
                  validFrom: new Date('2025-01-01'),
                  registrationNumber: 'REG12345',
                  validTo: new Date('2025-12-31'),
                  accreditationId: inserted.accreditations[0].id,
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.status).toBe(REG_ACC_STATUS.APPROVED)
          expect(updatedAcc.validFrom).toEqual(validFrom)
          expect(updatedAcc.validTo).toEqual(validTo)
          expect(updatedAcc.validFrom.toISOString()).toBe(
            '2025-01-01T00:00:00.000Z'
          )
          expect(updatedAcc.validTo.toISOString()).toBe(
            '2025-12-31T00:00:00.000Z'
          )
        })

        it('rejects update when accreditation status changes to suspended without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom: null,
            validTo: new Date('2025-12-31')
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                accreditations: [accreditationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.validFrom: any.invalid'
          )
        })

        it('rejects update when accreditation status changes to suspended without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: REG_ACC_STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: null
          }

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, {
                accreditations: [accreditationToUpdate]
              })
            )
          ).rejects.toThrow(
            'Invalid organisation data: accreditations.0.validTo: any.invalid'
          )
        })

        it('allows update when accreditation status is not approved or suspended without validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            material: 'plastic',
            validFrom: null,
            validTo: null,
            glassRecyclingProcess: null
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              accreditations: [accreditationToUpdate]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.material).toBe('plastic')
          expect(updatedAcc.validFrom).toBeNull()
          expect(updatedAcc.validTo).toBeNull()
        })
      })
    })
  })
}
