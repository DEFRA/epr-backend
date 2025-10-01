#!/usr/bin/env node

import { generateOrganisation } from './data-generators.js'
import { MongoClient } from 'mongodb'
import { createOrganisationCollection } from './create_collection.js'

const TOTAL_ORGANISATIONS = 20000
const REGISTRATION_ACCREDITATION_COUNT = 3
const COLLECTION_NAME = 'organisation_epr'
const DB_NAME = 'epr'
const MONGO_URL = 'mongodb://localhost:27017'

async function logCollectionSize(collection, name) {
  const sizeStats = await collection
    .aggregate([
      {
        $project: {
          size: { $bsonSize: '$$ROOT' }
        }
      },
      {
        $group: {
          _id: null,
          avgSize: { $avg: '$size' },
          minSize: { $min: '$size' },
          maxSize: { $max: '$size' },
          totalSize: { $sum: '$size' } // Added total size
        }
      }
    ])
    .toArray()

  const count = await collection.countDocuments()
  console.log(`\n--- ${name} Collection Stats ---`)
  console.log(`Total documents: ${count}`)
  if (sizeStats.length > 0) {
    const { avgSize, minSize, maxSize, totalSize } = sizeStats[0]
    console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`Average size: ${(avgSize / 1024).toFixed(2)} KB`)
    console.log(`Min size: ${(minSize / 1024).toFixed(2)} KB`)
    console.log(`Max size: ${(maxSize / 1024).toFixed(2)} KB`)
  }
}

async function insertDocumentsWithTiming(
  uri,
  dbName,
  collectionName,
  documents,
  parallelism = 5
) {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const collection = client.db(dbName).collection(collectionName)
    const chunks = Array.from(
      { length: Math.ceil(documents.length / parallelism) },
      (_, i) => documents.slice(i * parallelism, (i + 1) * parallelism)
    )

    const timings = await chunks.reduce(async (accPromise, chunk) => {
      const acc = await accPromise

      const chunkTimings = await Promise.all(
        chunk.map(async (doc) => {
          const startTime = performance.now()
          await collection.insertOne(doc)
          const endTime = performance.now()

          const duration = endTime - startTime
          return duration
        })
      )

      return [...acc, ...chunkTimings]
    }, Promise.resolve([]))

    await logCollectionSize(collection)

    console.log('\n--- Insert Statistics ---')
    console.log(
      `Wrote: ${TOTAL_ORGANISATIONS} , registration/accreditation for each org: ${REGISTRATION_ACCREDITATION_COUNT}, collection name: ${COLLECTION_NAME}`
    )
    const sortedTimings = [...timings].sort((a, b) => a - b)
    const median = sortedTimings[Math.floor(sortedTimings.length / 2)]
    const p95 = sortedTimings[Math.floor(sortedTimings.length * 0.95)]
    const p99 = sortedTimings[Math.floor(sortedTimings.length * 0.99)]

    console.log(`Median time: ${median.toFixed(2)} ms`)
    console.log(`95th percentile: ${p95.toFixed(2)} ms`)
    console.log(`99th percentile: ${p99.toFixed(2)} ms`)
  } finally {
    await client.close()
  }
}

async function updateRegistrationStatusWithTiming(
  uri,
  dbName,
  collectionName,
  organisations,
  newStatus = 'approved',
  parallelism = 5
) {
  const registrationIds = getRandomSample(organisations, 100).flatMap((org) =>
    org.registrations.map((reg) => reg.id)
  )

  const client = new MongoClient(uri)
  try {
    await client.connect()
    const collection = client.db(dbName).collection(collectionName)

    const chunks = Array.from(
      { length: Math.ceil(registrationIds.length / parallelism) },
      (_, i) => registrationIds.slice(i * parallelism, (i + 1) * parallelism)
    )

    const timings = await chunks.reduce(async (accPromise, chunk) => {
      const acc = await accPromise

      const chunkTimings = await Promise.all(
        chunk.map(async (registrationId) => {
          const startTime = performance.now()

          // Update status for the specific registration
          // eslint-disable-next-line no-unused-vars
          const result = await collection.updateOne(
            { 'registrations.id': registrationId },
            { $set: { 'registrations.$.status': newStatus } }
          )

          const endTime = performance.now()
          const duration = endTime - startTime
          return duration
        })
      )

      return [...acc, ...chunkTimings]
    }, Promise.resolve([]))

    console.log('\n--- Update Registration Status Statistics ---')
    console.log(
      `Total updates: ${registrationIds.length}, collection name: ${collectionName}`
    )
    console.log(`New status: ${newStatus}`)

    const sortedTimings = [...timings].sort((a, b) => a - b)
    const median = sortedTimings[Math.floor(sortedTimings.length / 2)]
    const p95 = sortedTimings[Math.floor(sortedTimings.length * 0.95)]
    const p99 = sortedTimings[Math.floor(sortedTimings.length * 0.99)]
    const avgTime =
      timings.reduce((sum, time) => sum + time, 0) / timings.length
    const minTime = Math.min(...timings)
    const maxTime = Math.max(...timings)

    console.log(`Average time: ${avgTime.toFixed(2)} ms`)
    console.log(`Median time: ${median.toFixed(2)} ms`)
    console.log(`Min time: ${minTime.toFixed(2)} ms`)
    console.log(`Max time: ${maxTime.toFixed(2)} ms`)
    console.log(`95th percentile: ${p95.toFixed(2)} ms`)
    console.log(`99th percentile: ${p99.toFixed(2)} ms`)
    console.log(`Parallelism: ${parallelism}`)

    return { avgTime, median, minTime, maxTime, p95, p99, timings }
  } finally {
    await client.close()
  }
}

async function queryDocumentsWithTiming(
  uri,
  dbName,
  collectionName,
  queryName,
  queries,
  parallelism = 5
) {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const collection = client.db(dbName).collection(collectionName)

    const chunks = Array.from(
      { length: Math.ceil(queries.length / parallelism) },
      (_, i) => queries.slice(i * parallelism, (i + 1) * parallelism)
    )

    const timings = await chunks.reduce(async (accPromise, chunk) => {
      const acc = await accPromise

      const chunkTimings = await Promise.all(
        chunk.map(async (query) => {
          const startTime = performance.now()
          // eslint-disable-next-line no-unused-vars
          const document = await collection.findOne(query)
          const endTime = performance.now()

          const duration = endTime - startTime
          return duration
        })
      )

      return [...acc, ...chunkTimings]
    }, Promise.resolve([]))

    console.log(`--- Query Statistics ${queryName}---`)
    console.log(
      `Total queries: ${queries.length}, collection name: ${COLLECTION_NAME}`
    )

    const sortedTimings = [...timings].sort((a, b) => a - b)
    const median = sortedTimings[Math.floor(sortedTimings.length / 2)]
    const p95 = sortedTimings[Math.floor(sortedTimings.length * 0.95)]
    const p99 = sortedTimings[Math.floor(sortedTimings.length * 0.99)]
    const avgTime =
      timings.reduce((sum, time) => sum + time, 0) / timings.length
    const minTime = Math.min(...timings)
    const maxTime = Math.max(...timings)

    console.log(`Average time: ${avgTime.toFixed(2)} ms`)
    console.log(`Median time: ${median.toFixed(2)} ms`)
    console.log(`Min time: ${minTime.toFixed(2)} ms`)
    console.log(`Max time: ${maxTime.toFixed(2)} ms`)
    console.log(`95th percentile: ${p95.toFixed(2)} ms`)
    console.log(`99th percentile: ${p99.toFixed(2)} ms`)
    console.log(`Parallelism: ${parallelism}`)

    return { avgTime, median, minTime, maxTime, p95, p99, timings }
  } finally {
    await client.close()
  }
}

const getRandomSample = (arr, size) =>
  Array.from(
    { length: size },
    () => arr[Math.floor(Math.random() * arr.length)]
  )

async function runReadQueriesWithTiming(
  mongoUrl,
  dbName,
  collectionName,
  organisations
) {
  const orgIdQueries = getRandomSample(organisations, 100).map((org) => ({
    orgId: org.orgId
  }))
  const registrationIdQueries = getRandomSample(organisations, 100).flatMap(
    (org) => org.registrations.map((reg) => ({ 'registrations.id': reg.id }))
  )
  const accreditationIdQueries = getRandomSample(organisations, 100).flatMap(
    (org) => org.accreditations.map((acc) => ({ 'accreditations.id': acc.id }))
  )

  await queryDocumentsWithTiming(
    mongoUrl,
    dbName,
    collectionName,
    'orgId',
    orgIdQueries,
    5
  )

  await queryDocumentsWithTiming(
    mongoUrl,
    dbName,
    collectionName,
    'registrationId',
    registrationIdQueries,
    5
  )

  await queryDocumentsWithTiming(
    mongoUrl,
    dbName,
    collectionName,
    'accreditationId',
    accreditationIdQueries,
    5
  )
}

const organisations = Array.from({ length: TOTAL_ORGANISATIONS }, (_, i) =>
  generateOrganisation(500000 + i, REGISTRATION_ACCREDITATION_COUNT)
)

await createOrganisationCollection(MONGO_URL, DB_NAME, COLLECTION_NAME)

await insertDocumentsWithTiming(
  MONGO_URL,
  DB_NAME,
  COLLECTION_NAME,
  organisations
)

await runReadQueriesWithTiming(
  MONGO_URL,
  DB_NAME,
  COLLECTION_NAME,
  organisations
)
await updateRegistrationStatusWithTiming(
  MONGO_URL,
  DB_NAME,
  COLLECTION_NAME,
  organisations
)
