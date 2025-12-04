import {
  generateOrganisation,
  generateRegistrationAccreditationPairs
} from './data-generators.js'
import { MongoClient } from 'mongodb'
import {
  createAccreditationCollection,
  createOrganisationCollection,
  createRegistrationCollection
} from './create-collections.js'

const TOTAL_ORGANISATIONS = 20000
const REGISTRATION_ACCREDITATION_COUNT = 3
const ORG_COLLECTION_NAME = 'organisations'
const REG_COLLECTION_NAME = 'registrations'
const ACC_COLLECTION_NAME = 'accreditations'
const DB_NAME = 'epr_separate'
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
          totalSize: { $sum: '$size' }
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
  documentType,
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

    await logCollectionSize(collection, documentType)

    console.log(`\n--- ${documentType} Insert Statistics ---`)
    console.log(`Wrote: ${documents.length} documents`)
    const sortedTimings = [...timings].sort((a, b) => a - b)
    const median = sortedTimings[Math.floor(sortedTimings.length / 2)]
    const p95 = sortedTimings[Math.floor(sortedTimings.length * 0.95)]
    const p99 = sortedTimings[Math.floor(sortedTimings.length * 0.99)]

    console.log(`Median time: ${median.toFixed(2)} ms`)
    console.log(`95th percentile: ${p95.toFixed(2)} ms`)
    console.log(`99th percentile: ${p99.toFixed(2)} ms`)

    return timings
  } finally {
    await client.close()
  }
}

async function updateRegistrationStatusWithTiming(
  uri,
  dbName,
  collectionName,
  registrationIds,
  newStatus = 'approved',
  parallelism = 5
) {
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

          // eslint-disable-next-line no-unused-vars
          const result = await collection.updateOne(
            { _id: registrationId },
            { $set: { status: newStatus } }
          )

          const endTime = performance.now()
          const duration = endTime - startTime
          return duration
        })
      )

      return [...acc, ...chunkTimings]
    }, Promise.resolve([]))

    console.log('\n--- Update Registration Status Statistics ---')
    console.log(`Total updates: ${registrationIds.length}`)
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

    console.log(`\n--- Query Statistics ${queryName} ---`)
    console.log(
      `Total queries: ${queries.length}, collection: ${collectionName}`
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

async function joinQueryWithTiming(uri, dbName, orgIds, parallelism = 5) {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(dbName)

    const chunks = Array.from(
      { length: Math.ceil(orgIds.length / parallelism) },
      (_, i) => orgIds.slice(i * parallelism, (i + 1) * parallelism)
    )

    const timings = await chunks.reduce(async (accPromise, chunk) => {
      const acc = await accPromise

      const chunkTimings = await Promise.all(
        chunk.map(async (orgId) => {
          const startTime = performance.now()

          // Use aggregation pipeline with $lookup to join collections
          // eslint-disable-next-line no-unused-vars
          const result = await db
            .collection(ORG_COLLECTION_NAME)
            .aggregate([
              { $match: { orgId } },
              {
                $lookup: {
                  from: REG_COLLECTION_NAME,
                  localField: 'orgId',
                  foreignField: 'orgId',
                  as: 'registrations'
                }
              },
              {
                $lookup: {
                  from: ACC_COLLECTION_NAME,
                  localField: 'orgId',
                  foreignField: 'orgId',
                  as: 'accreditations'
                }
              }
            ])
            .toArray()

          const endTime = performance.now()
          const duration = endTime - startTime
          return duration
        })
      )

      return [...acc, ...chunkTimings]
    }, Promise.resolve([]))

    console.log('\n--- $lookup Join Query Statistics (Org + Regs + Accs) ---')
    console.log(`Total aggregation join queries: ${orgIds.length}`)

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
  organisations,
  registrations,
  accreditations
) {
  const orgIdQueries = getRandomSample(organisations, 100).map((org) => ({
    orgId: org.orgId
  }))

  const registrationIdQueries = getRandomSample(registrations, 100).map(
    (reg) => ({
      _id: reg._id
    })
  )

  const accreditationIdQueries = getRandomSample(accreditations, 100).map(
    (acc) => ({
      _id: acc._id
    })
  )

  await queryDocumentsWithTiming(
    mongoUrl,
    dbName,
    ORG_COLLECTION_NAME,
    'Organisation by orgId',
    orgIdQueries,
    5
  )

  await queryDocumentsWithTiming(
    mongoUrl,
    dbName,
    REG_COLLECTION_NAME,
    'Registration by ID',
    registrationIdQueries,
    5
  )

  await queryDocumentsWithTiming(
    mongoUrl,
    dbName,
    ACC_COLLECTION_NAME,
    'Accreditation by ID',
    accreditationIdQueries,
    5
  )

  const joinOrgIds = getRandomSample(organisations, 50).map((org) => org.orgId)
  await joinQueryWithTiming(mongoUrl, dbName, joinOrgIds, 5)
}

console.log('Generating test data...')
const organisations = Array.from({ length: TOTAL_ORGANISATIONS }, (_, i) =>
  generateOrganisation(500000 + i)
)

const allRegistrations = []
const allAccreditations = []

organisations.forEach((org) => {
  const pairs = generateRegistrationAccreditationPairs(
    org.orgId,
    REGISTRATION_ACCREDITATION_COUNT
  )
  pairs.forEach((pair) => {
    allRegistrations.push(pair.registration)
    allAccreditations.push(pair.accreditation)
  })
})

console.log(
  `Generated ${organisations.length} organisations, ${allRegistrations.length} registrations, ${allAccreditations.length} accreditations`
)

// Create collections
await createOrganisationCollection(MONGO_URL, DB_NAME, ORG_COLLECTION_NAME)
await createRegistrationCollection(MONGO_URL, DB_NAME, REG_COLLECTION_NAME)
await createAccreditationCollection(MONGO_URL, DB_NAME, ACC_COLLECTION_NAME)

await insertDocumentsWithTiming(
  MONGO_URL,
  DB_NAME,
  ORG_COLLECTION_NAME,
  organisations,
  'Organisation'
)

await insertDocumentsWithTiming(
  MONGO_URL,
  DB_NAME,
  REG_COLLECTION_NAME,
  allRegistrations,
  'Registration'
)

await insertDocumentsWithTiming(
  MONGO_URL,
  DB_NAME,
  ACC_COLLECTION_NAME,
  allAccreditations,
  'Accreditation'
)

await runReadQueriesWithTiming(
  MONGO_URL,
  DB_NAME,
  organisations,
  allRegistrations,
  allAccreditations
)

const registrationIds = getRandomSample(allRegistrations, 300).map(
  (reg) => reg._id
)
await updateRegistrationStatusWithTiming(
  MONGO_URL,
  DB_NAME,
  REG_COLLECTION_NAME,
  registrationIds
)

console.log('\n🎉 Separate collections benchmark completed!')
