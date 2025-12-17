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
  STATUS,
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
          status: STATUS.APPROVED,
          accreditationNumber: 'ACC12345',
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
          `Accreditations with id ${inserted.accreditations[0].id} are approved but not linked to an approved registration`
        )
      })

      it('accepts when approved accreditation has linked approved registration', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        const accreditationToUpdate = {
          ...inserted.accreditations[0],
          status: STATUS.APPROVED,
          accreditationNumber: 'ACC12345',
          validFrom: new Date('2025-01-01'),
          validTo: new Date('2025-12-31')
        }

        const registrationToUpdate = {
          ...inserted.registrations[0],
          status: STATUS.APPROVED,
          validFrom: new Date('2025-01-01'),
          registrationNumber: 'REG12345',
          validTo: new Date('2025-12-31'),
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
        expect(updatedAcc.status).toBe(STATUS.APPROVED)
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
              status: STATUS.APPROVED,
              accreditationNumber: `ACC-${acc.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            })),
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: STATUS.APPROVED,
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
          expect(
            saved.accreditations.every((a) => a.status === STATUS.APPROVED)
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
                status: STATUS.APPROVED,
                accreditationNumber: `ACC-${acc.id}`,
                validFrom: new Date('2025-01-01'),
                validTo: new Date('2025-12-31')
              }
            }),
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: STATUS.APPROVED,
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
                site: {
                  address: { line1: '123 Test St', postcode: 'AB12 3CD' }
                }
              }),
              buildAccreditation({
                id: acc2Id,
                wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
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
              status: STATUS.APPROVED,
              accreditationNumber: `ACC-${acc.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            })),
            registrations: inserted.registrations.map((reg) => ({
              ...reg,
              status: STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }))
          }

          const duplicateKey = 'reprocessor::paper::AB12 3CD'
          const expectedError =
            `Accreditations with id ${inserted.accreditations[0].id}, ${inserted.accreditations[1].id} are approved but not linked to an approved registration; ` +
            `Multiple approved accreditations found with duplicate keys [${duplicateKey}]: ${inserted.accreditations[0].id}, ${inserted.accreditations[1].id}`

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, invalidUpdates)
            )
          ).rejects.toThrow(`Invalid organisation data: ${expectedError}`)
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
                status: STATUS.APPROVED,
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
          ).rejects.toThrow(`Invalid organisation data: ${expectedError}`)
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
              status: STATUS.APPROVED,
              registrationNumber: `REG-${reg.id}`,
              validFrom: new Date('2025-01-01'),
              validTo: new Date('2025-12-31')
            }))
          }

          const duplicateKey = 'reprocessor::paper::AB12 3CD'
          const expectedError = `Multiple approved registrations found with duplicate keys [${duplicateKey}]: ${inserted.registrations[0].id}, ${inserted.registrations[1].id}`

          await expect(
            repository.replace(
              organisation.id,
              1,
              prepareOrgUpdate(inserted, invalidUpdates)
            )
          ).rejects.toThrow(`Invalid organisation data: ${expectedError}`)
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
              status: STATUS.APPROVED,
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
              status: STATUS.APPROVED,
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
              status: STATUS.APPROVED,
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
          ).rejects.toThrow(`Invalid organisation data: ${expectedError}`)
        })
      })
    })

    describe('conditional field validation', () => {
      describe('registrationNumber', () => {
        it('rejects update when registration status changes to approved without registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: undefined,
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
            'Invalid organisation data: registrations.0.registrationNumber: any.required'
          )
        })

        it('allows update when registration status changes to approved with registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
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

          expect(updatedReg.status).toBe(STATUS.APPROVED)
          expect(updatedReg.registrationNumber).toBe('REG12345')
        })

        it('rejects update when registration status changes to suspended without registrationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: STATUS.SUSPENDED,
            registrationNumber: undefined,
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
            'Invalid organisation data: registrations.0.registrationNumber: any.required'
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
            status: STATUS.APPROVED,
            accreditationNumber: undefined,
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
            'Invalid organisation data: accreditations.0.accreditationNumber: any.required'
          )
        })

        it('allows update when accreditation status changes to approved with accreditationNumber and approved registration', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              accreditations: [accreditationToUpdate],
              registrations: [
                {
                  ...inserted.registrations[0],
                  status: STATUS.APPROVED,
                  validFrom: new Date('2025-01-01'),
                  registrationNumber: 'REG12345',
                  validTo: new Date('2025-12-31'),
                  accreditationId: inserted.accreditations[0].id
                }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.status).toBe(STATUS.APPROVED)
          expect(updatedAcc.accreditationNumber).toBe('ACC12345')
        })

        it('rejects update when accreditation status changes to suspended without accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: undefined,
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
            'Invalid organisation data: accreditations.0.accreditationNumber: any.required'
          )
        })

        it('allows update when accreditation status changes to suspended with accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
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

          expect(updatedAcc.status).toBe(STATUS.SUSPENDED)
          expect(updatedAcc.accreditationNumber).toBe('ACC12345')
        })

        it('allows update when accreditation status is not approved or suspended without accreditationNumber', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            material: 'plastic',
            accreditationNumber: undefined,
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
          expect(
            updatedAcc.accreditationNumber === null ||
              updatedAcc.accreditationNumber === undefined
          ).toBe(true)
        })
      })

      describe('validFrom and validTo for registrations', () => {
        it('rejects update when registration status changes to approved without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: undefined,
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
            'Invalid organisation data: registrations.0.validFrom: any.required'
          )
        })

        it('rejects update when registration status changes to approved without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: undefined
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
            'Invalid organisation data: registrations.0.validTo: any.required'
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
            status: STATUS.APPROVED,
            registrationNumber: 'REG12345',
            validFrom,
            validTo
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

          expect(updatedReg.status).toBe(STATUS.APPROVED)
          expect(updatedReg.validFrom).toEqual(validFrom)
          expect(updatedReg.validTo).toEqual(validTo)
        })

        it('rejects update when registration status changes to suspended without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: STATUS.SUSPENDED,
            registrationNumber: 'REG12345',
            validFrom: undefined,
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
            'Invalid organisation data: registrations.0.validFrom: any.required'
          )
        })

        it('rejects update when registration status changes to suspended without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: STATUS.SUSPENDED,
            registrationNumber: 'REG12345',
            validFrom: new Date('2025-01-01'),
            validTo: undefined
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
            'Invalid organisation data: registrations.0.validTo: any.required'
          )
        })

        it('allows update when registration status changes to suspended with validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          const registrationToUpdate = {
            ...inserted.registrations[0],
            status: STATUS.SUSPENDED,
            registrationNumber: 'REG12345',
            validFrom,
            validTo
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

          expect(updatedReg.status).toBe(STATUS.SUSPENDED)
          expect(updatedReg.validFrom).toEqual(validFrom)
          expect(updatedReg.validTo).toEqual(validTo)
        })

        it('allows update when registration status is not approved or suspended without validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const registrationToUpdate = {
            ...inserted.registrations[0],
            material: 'plastic',
            glassRecyclingProcess: null,
            validFrom: undefined,
            validTo: undefined
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
          expect(
            updatedReg.validFrom === null || updatedReg.validFrom === undefined
          ).toBe(true)
          expect(
            updatedReg.validTo === null || updatedReg.validTo === undefined
          ).toBe(true)
        })
      })

      describe('validFrom and validTo for accreditations', () => {
        it('rejects update when accreditation status changes to approved without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: undefined,
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
            'Invalid organisation data: accreditations.0.validFrom: any.required'
          )
        })

        it('rejects update when accreditation status changes to approved without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: undefined
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
            'Invalid organisation data: accreditations.0.validTo: any.required'
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
            status: STATUS.APPROVED,
            accreditationNumber: 'ACC12345',
            validFrom,
            validTo
          }

          await repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              accreditations: [accreditationToUpdate],
              registrations: [
                {
                  ...inserted.registrations[0],
                  status: STATUS.APPROVED,
                  validFrom: new Date('2025-01-01'),
                  registrationNumber: 'REG12345',
                  validTo: new Date('2025-12-31'),
                  accreditationId: inserted.accreditations[0].id
                }
              ]
            })
          )

          const result = await repository.findById(organisation.id, 2)
          const updatedAcc = result.accreditations.find(
            (a) => a.id === accreditationToUpdate.id
          )

          expect(updatedAcc.status).toBe(STATUS.APPROVED)
          expect(updatedAcc.validFrom).toEqual(validFrom)
          expect(updatedAcc.validTo).toEqual(validTo)
        })

        it('rejects update when accreditation status changes to suspended without validFrom', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom: undefined,
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
            'Invalid organisation data: accreditations.0.validFrom: any.required'
          )
        })

        it('rejects update when accreditation status changes to suspended without validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom: new Date('2025-01-01'),
            validTo: undefined
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
            'Invalid organisation data: accreditations.0.validTo: any.required'
          )
        })

        it('allows update when accreditation status changes to suspended with validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const validFrom = new Date('2025-01-01')
          const validTo = new Date('2025-12-31')

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            status: STATUS.SUSPENDED,
            accreditationNumber: 'ACC12345',
            validFrom,
            validTo
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

          expect(updatedAcc.status).toBe(STATUS.SUSPENDED)
          expect(updatedAcc.validFrom).toEqual(validFrom)
          expect(updatedAcc.validTo).toEqual(validTo)
        })

        it('allows update when accreditation status is not approved or suspended without validFrom and validTo', async () => {
          const organisation = buildOrganisation()
          await repository.insert(organisation)
          const inserted = await repository.findById(organisation.id)

          const accreditationToUpdate = {
            ...inserted.accreditations[0],
            material: 'plastic',
            validFrom: undefined,
            validTo: undefined,
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
          expect(
            updatedAcc.validFrom === null || updatedAcc.validFrom === undefined
          ).toBe(true)
          expect(
            updatedAcc.validTo === null || updatedAcc.validTo === undefined
          ).toBe(true)
        })
      })
    })
  })
}
