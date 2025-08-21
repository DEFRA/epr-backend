import { createAccreditationCollection } from './create-accreditation.js'
import { createOrganisationCollection } from './create-organisation.js'
import { createRegistrationCollection } from './create-registration.js'

import {
  organisationFactory,
  registrationFactory,
  accreditationFactory
} from './factories/index.js'

import {
  extractAnswers,
  extractEmail,
  extractNations,
  extractOrgName
} from '../apply/extract-answers.js'
import { ORG_ID_START_NUMBER } from '../../enums/index.js'

import organisationFixture from '../../../data/fixtures/organisation.json' with { type: 'json' }
import registrationFixture from '../../../data/fixtures/registration.json' with { type: 'json' }
import accreditationFixture from '../../../data/fixtures/accreditation.json' with { type: 'json' }

export async function createCollections(db) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray()

  if (!collections.find(({ name }) => name === 'organisation')) {
    await createOrganisationCollection(db)
  }

  if (!collections.find(({ name }) => name === 'registration')) {
    await createRegistrationCollection(db)
  }

  if (!collections.find(({ name }) => name === 'accreditation')) {
    await createAccreditationCollection(db)
  }
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
        nations: extractNations(organisationAnswers),
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
}
