import { createOrUpdateAccreditationCollection } from './create-update-accreditation.js'
import { createOrUpdateOrganisationCollection } from './create-update-organisation.js'
import { createOrUpdateRegistrationCollection } from './create-update-registration.js'

import {
  organisationFactory,
  registrationFactory,
  accreditationFactory
} from './factories/index.js'

import {
  extractAnswers,
  extractEmail,
  extractOrgName
} from '../apply/extract-answers.js'
import { ORG_ID_START_NUMBER } from '../../enums/index.js'

import organisationFixture from '#data/fixtures/organisation.json' with { type: 'json' }
import registrationFixture from '#data/fixtures/registration.json' with { type: 'json' }
import accreditationFixture from '#data/fixtures/accreditation.json' with { type: 'json' }

import eprOrganisation1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import eprOrganisation2 from '#data/fixtures/common/epr-organisations/sample-organisation-2.json' with { type: 'json' }
import eprOrganisation3 from '#data/fixtures/common/epr-organisations/sample-organisation-3.json' with { type: 'json' }
import eprOrganisation4 from '#data/fixtures/common/epr-organisations/sample-organisation-4.json' with { type: 'json' }

import { createOrUpdateEPROrganisationCollection } from '#common/helpers/collections/create-update-epr-organisation.js'
import { eprOrganisationFactory } from '#common/helpers/collections/factories/epr-organisation.js'

export async function createOrUpdateCollections(db) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray()

  await createOrUpdateOrganisationCollection(db, collections)
  await createOrUpdateRegistrationCollection(db, collections)
  await createOrUpdateAccreditationCollection(db, collections)

  await createOrUpdateEPROrganisationCollection(db, collections)
}

export async function createIndexes(db) {
  await db.collection('mongo-locks').createIndex({ id: 1 })

  await db.collection('organisation').createIndex({ orgId: 1 })
  await db.collection('registration').createIndex({ referenceNumber: 1 })
  await db.collection('accreditation').createIndex({ referenceNumber: 1 })
}

export async function createSeedData(db) {
  const organisationDocCount = await db.collection('organisation').count()

  if (organisationDocCount === 0) {
    const organisationAnswers = extractAnswers(organisationFixture)

    const { insertedIds } = await db.collection('organisation').insertMany([
      organisationFactory({
        orgId: ORG_ID_START_NUMBER,
        orgName: extractOrgName(organisationAnswers),
        email: extractEmail(organisationAnswers),
        nations: null,
        answers: organisationAnswers,
        rawSubmissionData: organisationFixture
      })
    ])

    await db.collection('registration').insertMany([
      registrationFactory({
        referenceNumber: insertedIds[0]?.toString(),
        orgId: ORG_ID_START_NUMBER,
        answers: extractAnswers(registrationFixture),
        rawSubmissionData: registrationFixture
      })
    ])

    await db.collection('accreditation').insertMany([
      accreditationFactory({
        referenceNumber: insertedIds[0]?.toString(),
        orgId: ORG_ID_START_NUMBER,
        answers: extractAnswers(accreditationFixture),
        rawSubmissionData: accreditationFixture
      })
    ])
  }

  const eprOrganisationDocCount = await db
    .collection('epr-organisations')
    .countDocuments()

  if (eprOrganisationDocCount === 0) {
    await db
      .collection('epr-organisations')
      .insertMany([
        eprOrganisationFactory(eprOrganisation1),
        eprOrganisationFactory(eprOrganisation2),
        eprOrganisationFactory(eprOrganisation3),
        eprOrganisationFactory(eprOrganisation4)
      ])
  }
}
