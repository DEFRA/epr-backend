import { createOrUpdateAccreditationCollection } from './create-update-accreditation.js'
import { createOrUpdateOrganisationCollection } from './create-update-organisation.js'
import { createOrUpdateRegistrationCollection } from './create-update-registration.js'
import { createOrUpdatePackagingRecyclingNotesCollection } from './create-update-packaging-recycling-notes.js'

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

import { createEprOrganisationScenarios } from '#common/helpers/collections/seed-scenarios.js'

import { logger } from '#common/helpers/logging/logger.js'
import { toWasteRecordVersions } from '#repositories/waste-records/contract/test-data.js'
import { ObjectId } from 'mongodb'

/** @import {FeatureFlags} from '#feature-flags/feature-flags.port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {WasteRecordsRepository} from '#repositories/waste-records/port.js' */

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
 * Note: epr-organisations, system-logs, and packaging-recycling-notes collections
 * are created by their respective repository adapters during ensureCollection calls.
 *
 * @async
 * @param {Db} db
 * @param {FeatureFlags} featureFlags
 * @returns {Promise<void>}
 */
export async function createOrUpdateCollections(db, featureFlags) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray()

  await createOrUpdateOrganisationCollection(db, collections)
  await createOrUpdateRegistrationCollection(db, collections)
  await createOrUpdateAccreditationCollection(db, collections)

  if (featureFlags.isCreatePackagingRecyclingNotesEnabled()) {
    await createOrUpdatePackagingRecyclingNotesCollection(db, collections)
  }
}

/**
 * Create db indexes
 *
 * Note: Most indexes are now created by their respective repository adapters
 * during ensureCollection calls. This function only creates the mongo-locks
 * index which is used by the LockManager and isn't owned by any adapter.
 *
 * @async
 * @param {Db} db
 * @param {FeatureFlags} featureFlags
 * @returns {Promise<void>}
 */
export async function createIndexes(db, _featureFlags) {
  await db.collection('mongo-locks').createIndex({ id: 1 })
}

/**
 * Create seed data
 *
 * @async
 * @param {Db} db
 * @param {() => boolean} isProduction
 * @param {OrganisationsRepository} organisationsRepository
 * @param {WasteRecordsRepository} wasteRecordsRepository
 * @returns {Promise<void>}
 */
export async function createSeedData(
  db,
  isProduction,
  organisationsRepository,
  wasteRecordsRepository
) {
  if (!isProduction()) {
    logger.info({ message: 'Create seed data: start' })

    await createOrgRegAccFixtures(db)
    await createEprOrganisationFixtures(db, organisationsRepository)
    await createEprOrganisationScenarios(db, organisationsRepository)
    await createWasteRecordsFixtures(db, wasteRecordsRepository)
  }
}

async function createOrgRegAccFixtures(db) {
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
}

async function createEprOrganisationFixtures(db, organisationsRepository) {
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
}

async function createWasteRecordsFixtures(db, wasteRecordsRepository) {
  const wasteRecordCount = await db
    .collection(COLLECTION_WASTE_RECORDS)
    .countDocuments()

  if (wasteRecordCount === 0) {
    logger.info({
      message: 'Create seed data: inserting waste-records fixtures'
    })

    const recordsByOrgReg = new Map()

    for (const record of exporterRecords) {
      const key = `${record.organisationId}:${record.registrationId}`
      if (!recordsByOrgReg.has(key)) {
        recordsByOrgReg.set(key, {
          organisationId: record.organisationId,
          registrationId: record.registrationId,
          versionsObj: {}
        })
      }

      const group = recordsByOrgReg.get(key)

      if (!group.versionsObj[record.type]) {
        group.versionsObj[record.type] = {}
      }

      group.versionsObj[record.type][record.rowId] = {
        data: record.data,
        version: record.versions[0]
      }
    }

    for (const {
      organisationId,
      registrationId,
      versionsObj
    } of recordsByOrgReg.values()) {
      await wasteRecordsRepository.appendVersions(
        organisationId,
        registrationId,
        toWasteRecordVersions(versionsObj)
      )
    }
  }
}
