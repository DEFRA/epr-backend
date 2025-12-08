import { createOrUpdateAccreditationCollection } from './create-update-accreditation.js'
import { createOrUpdateOrganisationCollection } from './create-update-organisation.js'
import { createOrUpdateRegistrationCollection } from './create-update-registration.js'
import { createOrUpdateWasteBalancesCollection } from './create-update-waste-balances.js'

import { ORG_ID_START_NUMBER } from '../../enums/index.js'
import {
  extractAnswers,
  extractEmail,
  extractOrgName
} from '../apply/extract-answers.js'
import {
  accreditationFactory,
  organisationFactory,
  registrationFactory
} from './factories/index.js'

import accreditationFixture from '#data/fixtures/accreditation.json' with { type: 'json' }
import organisationFixture from '#data/fixtures/organisation.json' with { type: 'json' }
import registrationFixture from '#data/fixtures/registration.json' with { type: 'json' }

import eprOrganisation1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import eprOrganisation2 from '#data/fixtures/common/epr-organisations/sample-organisation-2.json' with { type: 'json' }
import eprOrganisation3 from '#data/fixtures/common/epr-organisations/sample-organisation-3.json' with { type: 'json' }
import eprOrganisation4 from '#data/fixtures/common/epr-organisations/sample-organisation-4.json' with { type: 'json' }
import exporterRecords from '#data/fixtures/common/waste-records/exporter-records.json' with { type: 'json' }

import { createOrUpdateEPROrganisationCollection } from '#common/helpers/collections/create-update-epr-organisation.js'

import { logger } from '#common/helpers/logging/logger.js'
import { ObjectId } from 'mongodb'

/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

const COLLECTION_ORGANISATION = 'organisation'
const COLLECTION_REGISTRATION = 'registration'
const COLLECTION_ACCREDITATION = 'accreditation'
const COLLECTION_EPR_ORGANISATIONS = 'epr-organisations'
const COLLECTION_WASTE_RECORDS = 'waste-records'

/**
 * @import {Db} from 'mongodb'
 */

/**
 * Create or update collections
 *
 * @async
 * @param {Db} db
 * @returns {Promise<void>}
 */
export async function createOrUpdateCollections(db) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray()

  await createOrUpdateOrganisationCollection(db, collections)
  await createOrUpdateRegistrationCollection(db, collections)
  await createOrUpdateAccreditationCollection(db, collections)

  await createOrUpdateEPROrganisationCollection(db, collections)
  await createOrUpdateWasteBalancesCollection(db, collections)
}

/**
 * Create db indexes
 *
 * @async
 * @param {Db} db
 * @returns {Promise<void>}
 */
export async function createIndexes(db) {
  await db.collection('mongo-locks').createIndex({ id: 1 })

  await db.collection(COLLECTION_ORGANISATION).createIndex({ orgId: 1 })
  await db
    .collection(COLLECTION_REGISTRATION)
    .createIndex({ referenceNumber: 1 })
  await db
    .collection(COLLECTION_ACCREDITATION)
    .createIndex({ referenceNumber: 1 })

  await db
    .collection('waste-records')
    .createIndex(
      { organisationId: 1, registrationId: 1, type: 1, rowId: 1 },
      { unique: true }
    )
}

/**
 * Create seed data
 *
 * @async
 * @param {Db} db
 * @param {() => boolean} isProduction
 * @param {OrganisationsRepository} organisationsRepository
 * @returns {Promise<void>}
 */
export async function createSeedData(
  db,
  isProduction,
  organisationsRepository
) {
  if (!isProduction()) {
    logger.info({ message: 'Create seed data: start' })

    const organisationDocCount = await db
      .collection(COLLECTION_ORGANISATION)
      .countDocuments()

    if (organisationDocCount === 0) {
      logger.info({
        message: 'Create seed data: inserting org/reg/acc fixtures'
      })
      const organisationAnswers = extractAnswers(organisationFixture)

      const { insertedIds } = await db
        .collection(COLLECTION_ORGANISATION)
        .insertMany([
          organisationFactory({
            orgId: ORG_ID_START_NUMBER,
            orgName: extractOrgName(organisationAnswers),
            email: extractEmail(organisationAnswers),
            nations: null,
            answers: organisationAnswers,
            rawSubmissionData: organisationFixture
          })
        ])

      await db.collection(COLLECTION_REGISTRATION).insertMany([
        registrationFactory({
          referenceNumber: insertedIds[0]?.toString(),
          orgId: ORG_ID_START_NUMBER,
          answers: extractAnswers(registrationFixture),
          rawSubmissionData: registrationFixture
        })
      ])

      await db.collection(COLLECTION_ACCREDITATION).insertMany([
        accreditationFactory({
          referenceNumber: insertedIds[0]?.toString(),
          orgId: ORG_ID_START_NUMBER,
          answers: extractAnswers(accreditationFixture),
          rawSubmissionData: accreditationFixture
        })
      ])
    }

    const eprOrganisationFixturesIds = [
      eprOrganisation1,
      eprOrganisation2,
      eprOrganisation3,
      eprOrganisation4
    ]
      .map((record) => record.id)
      .map(ObjectId.createFromHexString)

    const eprOrganisationFixturesDocs = await db
      .collection(COLLECTION_EPR_ORGANISATIONS)
      .find({ _id: { $in: eprOrganisationFixturesIds } })
      .toArray()

    if (eprOrganisationFixturesDocs.length === 0) {
      logger.info({
        message: 'Create seed data: inserting epr-organisation fixtures'
      })

      await Promise.all([
        organisationsRepository.insert(eprOrganisation1),
        organisationsRepository.insert(eprOrganisation2),
        organisationsRepository.insert(eprOrganisation3),
        organisationsRepository.insert(eprOrganisation4)
      ])
    }

    const wasteRecordCount = await db
      .collection(COLLECTION_WASTE_RECORDS)
      .countDocuments()

    if (wasteRecordCount === 0) {
      logger.info({
        message: 'Create seed data: inserting waste-records fixtures'
      })
      await db.collection(COLLECTION_WASTE_RECORDS).insertMany(exporterRecords)
    }
  }
}

export async function cleanupSeedData(db, { isProduction, isDryRun }) {
  logger.info({
    message: `Seed data clean up: requested, isProduction-${isProduction()}, dry run-${isDryRun()}`
  })
  if (isProduction()) {
    logger.info({ message: 'Seed data clean up: start' })

    const deleteDocuments = async (collectionName, ids) => {
      if (!ids.length) {
        logger.info({
          message: `Seed data clean up: no documents found to delete from ${collectionName} collection`
        })
        return
      }

      if (isDryRun()) {
        const idStrings = ids.map((id) => id.toString()).join(', ')

        logger.info({
          message: `Seed data clean up: dry run delete documents ${idStrings} from ${collectionName} collection`
        })
      } else {
        const result = await db
          .collection(collectionName)
          .deleteMany({ _id: { $in: ids } })
        logger.info({
          message: `Seed data clean up: deleted ${result.deletedCount} documents from ${collectionName} collection`
        })
      }
    }

    const findAndDelete = async (collectionName, query) => {
      const foundDocs = await db
        .collection(collectionName)
        .find(query)
        .toArray()
      const foundDocumentIds = foundDocs.map((doc) => doc._id)
      await deleteDocuments(collectionName, foundDocumentIds)
      return foundDocumentIds
    }

    const testSubmissionSystemReferences = [
      '123ab456789cd01e23fabc45',
      '68b047003ef5214486dbaa53'
    ]

    await findAndDelete(COLLECTION_REGISTRATION, {
      referenceNumber: { $in: testSubmissionSystemReferences }
    })

    await findAndDelete(COLLECTION_ACCREDITATION, {
      referenceNumber: { $in: testSubmissionSystemReferences }
    })

    return true
  }
  return false
}
