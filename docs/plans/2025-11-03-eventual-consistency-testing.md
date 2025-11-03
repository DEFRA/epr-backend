# Eventual Consistency Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add eventual consistency simulation to the in-memory organisations repository to catch code that relies on read-after-write consistency guarantees that don't exist in production.

**Architecture:** Modify the in-memory repository to maintain two storage structures - an authoritative `storage` and a lagged `staleCache` used for reads. Writes update `storage` immediately and schedule async updates to `staleCache` via `setImmediate()`. Add optional `expectedVersion` parameter to `findById()` and `findRegistrationById()` that retries until the expected version is visible in the staleCache.

**Tech Stack:** Node.js, MongoDB driver (for signatures), Vitest (for testing), structuredClone (for deep copying)

---

## Task 1: Add Stale Cache Infrastructure to In-Memory Repository

**Files:**

- Modify: `src/repositories/organisations/inmemory.js:129-165`

**Step 1: Add staleCache and pendingSync to repository state**

In `createInMemoryOrganisationsRepository()` function, modify the initialization:

```javascript
export const createInMemoryOrganisationsRepository = (
  initialOrganisations = []
) => {
  const storage = structuredClone(initialOrganisations)
  const staleCache = structuredClone(initialOrganisations)
  let pendingSync = null

  return () => ({
    async insert(organisation) {
      return performInsert(storage, organisation)
    }
    // ... rest of methods
  })
}
```

**Step 2: Run tests to verify no breakage**

Run: `npm test src/repositories/organisations/inmemory.test.js`
Expected: All tests PASS (no behavior change yet)

**Step 3: Commit the state addition**

```bash
git add src/repositories/organisations/inmemory.js
git commit -m "feat(orgs): add staleCache infrastructure to inmemory repository"
```

---

## Task 2: Modify Insert to Update Both Caches

**Files:**

- Modify: `src/repositories/organisations/inmemory.js:39-63`

**Step 1: Modify performInsert to accept staleCache**

Change the function signature and add staleCache update:

```javascript
const performInsert = (storage, staleCache, organisation) => {
  const validated = validateOrganisationInsert(organisation)
  const { id, ...orgFields } = validated

  const existing = storage.find((o) => o.id === id)
  if (existing) {
    throw Boom.conflict(`Organisation with ${id} already exists`)
  }

  const registrations = initializeItems(orgFields.registrations)
  const accreditations = initializeItems(orgFields.accreditations)

  const newOrg = structuredClone({
    id,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    statusHistory: createInitialStatusHistory(),
    ...orgFields,
    formSubmissionTime: new Date(orgFields.formSubmissionTime),
    registrations,
    accreditations
  })

  storage.push(newOrg)
  // Insert is immediately visible (no lag simulation for inserts)
  staleCache.push(structuredClone(newOrg))
}
```

**Step 2: Update insert method to pass staleCache**

In the return object:

```javascript
async insert(organisation) {
  return performInsert(storage, staleCache, organisation)
},
```

**Step 3: Run tests to verify no breakage**

Run: `npm test src/repositories/organisations/inmemory.test.js`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/repositories/organisations/inmemory.js
git commit -m "feat(orgs): update insert to maintain staleCache immediately"
```

---

## Task 3: Modify Update to Schedule Async StaleCache Sync

**Files:**

- Modify: `src/repositories/organisations/inmemory.js:65-103`
- Modify: `src/repositories/organisations/inmemory.js:139-141`

**Step 1: Create sync scheduler helper**

Add this helper function before `performInsert`:

```javascript
const scheduleStaleCacheSync = (storage, staleCache, pendingSyncRef) => {
  // Cancel any pending sync
  if (pendingSyncRef.current !== null) {
    clearImmediate(pendingSyncRef.current)
  }

  // Schedule sync for next tick
  pendingSyncRef.current = setImmediate(() => {
    staleCache.length = 0
    staleCache.push(...structuredClone(storage))
    pendingSyncRef.current = null
  })
}
```

**Step 2: Modify performUpdate to accept sync parameters**

```javascript
const performUpdate = (
  storage,
  staleCache,
  pendingSyncRef,
  id,
  version,
  updates
) => {
  const validatedId = validateId(id)
  const validatedUpdates = validateOrganisationUpdate(updates)

  const existingIndex = storage.findIndex((o) => o.id === validatedId)
  if (existingIndex === -1) {
    throw Boom.notFound(`Organisation with id ${validatedId} not found`)
  }

  const existing = storage[existingIndex]

  if (existing.version !== version) {
    throw Boom.conflict(
      `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
    )
  }

  const merged = {
    ...existing,
    ...validatedUpdates
  }

  const registrations = mergeSubcollection(
    existing.registrations,
    validatedUpdates.registrations
  )
  const accreditations = mergeSubcollection(
    existing.accreditations,
    validatedUpdates.accreditations
  )

  storage[existingIndex] = {
    ...merged,
    statusHistory: statusHistoryWithChanges(validatedUpdates, existing),
    registrations,
    accreditations,
    version: existing.version + 1
  }

  // Schedule async staleCache update
  scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)
}
```

**Step 3: Update update method to pass new parameters**

Need to wrap pendingSync in an object so it can be mutated:

In `createInMemoryOrganisationsRepository`:

```javascript
const pendingSyncRef = { current: null }

return () => ({
  // ...
  async update(id, version, updates) {
    return performUpdate(
      storage,
      staleCache,
      pendingSyncRef,
      id,
      version,
      updates
    )
  }
  // ...
})
```

**Step 4: Run tests to verify they FAIL**

Run: `npm test src/repositories/organisations/contract/update.contract.js`
Expected: Multiple tests FAIL with stale data assertions

Document which tests fail (should be most update tests that immediately read back).

**Step 5: Commit**

```bash
git add src/repositories/organisations/inmemory.js
git commit -m "feat(orgs): add async staleCache sync after updates"
```

---

## Task 4: Modify Read Operations to Use StaleCache

**Files:**

- Modify: `src/repositories/organisations/inmemory.js:105-120`
- Modify: `src/repositories/organisations/inmemory.js:143-163`

**Step 1: Modify performFindById to read from staleCache**

```javascript
const performFindById = (staleCache, id) => {
  try {
    validateId(id)
  } catch (validationError) {
    throw Boom.notFound(`Organisation with id ${id} not found`, {
      cause: validationError
    })
  }

  const found = staleCache.find((o) => o.id === id)
  if (!found) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  return enrichWithCurrentStatus(structuredClone(found))
}
```

**Step 2: Update all read methods to use staleCache**

```javascript
async findAll() {
  return structuredClone(staleCache).map((org) =>
    enrichWithCurrentStatus({ ...org })
  )
},

async findById(id) {
  return performFindById(staleCache, id)
},

async findRegistrationById(organisationId, registrationId) {
  const org = staleCache.find((o) => o.id === organisationId)
  if (!org) {
    return null
  }

  const registration = org.registrations?.find(
    (r) => r.id === registrationId
  )
  return registration ? structuredClone(registration) : null
}
```

**Step 3: Run tests to verify failures persist**

Run: `npm test src/repositories/organisations/inmemory.test.js`
Expected: Contract tests FAIL with stale reads

**Step 4: Commit**

```bash
git add src/repositories/organisations/inmemory.js
git commit -m "feat(orgs): modify reads to use staleCache"
```

---

## Task 5: Add Version-Aware Retry to findById

**Files:**

- Modify: `src/repositories/organisations/inmemory.js:149-151`
- Modify: `src/repositories/organisations/port.js:6`

**Step 1: Add retry constants at top of file**

After the imports in `inmemory.js`:

```javascript
const MAX_CONSISTENCY_RETRIES = 10
const CONSISTENCY_RETRY_DELAY_MS = 10
```

**Step 2: Implement version-aware findById**

Replace the findById method:

```javascript
async findById(id, expectedVersion) {
  for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
    try {
      const result = performFindById(staleCache, id)

      // No version expectation - return immediately (may be stale)
      if (expectedVersion === undefined) {
        return result
      }

      // Version matches - consistency achieved
      if (result.version >= expectedVersion) {
        return result
      }
    } catch (error) {
      // Document not found - retry in case it's propagating
      if (i === MAX_CONSISTENCY_RETRIES - 1) {
        throw error
      }
    }

    // Wait before retry
    if (i < MAX_CONSISTENCY_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, CONSISTENCY_RETRY_DELAY_MS))
    }
  }

  // Timeout - log details but throw simple error
  const lastResult = staleCache.find((o) => o.id === id)
  console.error(`Consistency timeout: expected version ${expectedVersion}, got ${lastResult?.version}`)
  throw Boom.internal('Consistency timeout waiting for expected version')
},
```

**Step 3: Update port.js typedef**

```javascript
/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {(id: string, version: number, updates: Object) => Promise<void>} update
 * @property {() => Promise<Object[]>} findAll
 * @property {(id: string, expectedVersion?: number) => Promise<Object|null>} findById
 * @property {(organisationId: string, registrationId: string, expectedOrgVersion?: number) => Promise<Object|null>} findRegistrationById
 */
```

**Step 4: Run tests to verify behavior**

Run: `npm test src/repositories/organisations/inmemory.test.js`
Expected: Tests still FAIL (we haven't updated them to use expectedVersion yet)

**Step 5: Commit**

```bash
git add src/repositories/organisations/inmemory.js src/repositories/organisations/port.js
git commit -m "feat(orgs): add version-aware retry to findById"
```

---

## Task 6: Add Version-Aware Retry to findRegistrationById

**Files:**

- Modify: `src/repositories/organisations/inmemory.js:153-163`

**Step 1: Implement version-aware findRegistrationById**

Replace the findRegistrationById method:

```javascript
async findRegistrationById(organisationId, registrationId, expectedOrgVersion) {
  for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
    const org = staleCache.find((o) => o.id === organisationId)

    if (!org) {
      // No org found - retry in case it's propagating
      if (expectedOrgVersion === undefined || i === MAX_CONSISTENCY_RETRIES - 1) {
        return null
      }
    } else {
      // No version expectation - return immediately
      if (expectedOrgVersion === undefined) {
        const registration = org.registrations?.find(
          (r) => r.id === registrationId
        )
        return registration ? structuredClone(registration) : null
      }

      // Version matches - consistency achieved
      if (org.version >= expectedOrgVersion) {
        const registration = org.registrations?.find(
          (r) => r.id === registrationId
        )
        return registration ? structuredClone(registration) : null
      }
    }

    // Wait before retry
    if (i < MAX_CONSISTENCY_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, CONSISTENCY_RETRY_DELAY_MS))
    }
  }

  // Timeout
  console.error(`Consistency timeout: expected org version ${expectedOrgVersion}`)
  throw Boom.internal('Consistency timeout waiting for expected version')
}
```

**Step 2: Run tests to verify**

Run: `npm test src/repositories/organisations/inmemory.test.js`
Expected: Tests still FAIL (expected)

**Step 3: Commit**

```bash
git add src/repositories/organisations/inmemory.js
git commit -m "feat(orgs): add version-aware retry to findRegistrationById"
```

---

## Task 7: Update MongoDB Implementation Signatures

**Files:**

- Modify: `src/repositories/organisations/mongodb.js:114-132`
- Modify: `src/repositories/organisations/mongodb.js:160-179`

**Step 1: Add retry constants**

After imports in `mongodb.js`:

```javascript
const MAX_CONSISTENCY_RETRIES = 10
const CONSISTENCY_RETRY_DELAY_MS = 10
```

**Step 2: Update performFindById signature and add retry**

```javascript
const performFindById = async (db, id, expectedVersion) => {
  // validate the ID and throw early
  let validatedId
  try {
    validatedId = validateId(id)
  } catch (error) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
    const doc = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: ObjectId.createFromHexString(validatedId) })

    if (!doc) {
      // No version expectation or last retry - throw not found
      if (expectedVersion === undefined || i === MAX_CONSISTENCY_RETRIES - 1) {
        throw Boom.notFound(`Organisation with id ${id} not found`)
      }
    } else {
      const mapped = mapDocumentWithCurrentStatuses(doc)

      // No version expectation - return immediately
      if (expectedVersion === undefined) {
        return mapped
      }

      // Version matches
      if (mapped.version >= expectedVersion) {
        return mapped
      }
    }

    // Wait before retry
    if (i < MAX_CONSISTENCY_RETRIES - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONSISTENCY_RETRY_DELAY_MS)
      )
    }
  }

  // Timeout
  console.error(`Consistency timeout: expected version ${expectedVersion}`)
  throw Boom.internal('Consistency timeout waiting for expected version')
}
```

**Step 3: Update findById method call**

```javascript
async findById(id, expectedVersion) {
  return performFindById(db, id, expectedVersion)
},
```

**Step 4: Update findRegistrationById with version support**

```javascript
async findRegistrationById(organisationId, registrationId, expectedOrgVersion) {
  let validatedOrgId
  try {
    validatedOrgId = validateId(organisationId)
  } catch {
    // Invalid organisation ID format - treat as not found per contract test
    return null
  }

  for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
    const doc = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: ObjectId.createFromHexString(validatedOrgId) })

    if (!doc) {
      // No version expectation or last retry - return null
      if (expectedOrgVersion === undefined || i === MAX_CONSISTENCY_RETRIES - 1) {
        return null
      }
    } else {
      const mapped = mapDocumentWithCurrentStatuses(doc)

      // No version expectation - return immediately
      if (expectedOrgVersion === undefined) {
        const registration = mapped.registrations?.find((r) => r.id === registrationId)
        return registration || null
      }

      // Version matches
      if (mapped.version >= expectedOrgVersion) {
        const registration = mapped.registrations?.find((r) => r.id === registrationId)
        return registration || null
      }
    }

    // Wait before retry
    if (i < MAX_CONSISTENCY_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, CONSISTENCY_RETRY_DELAY_MS))
    }
  }

  // Timeout
  console.error(`Consistency timeout: expected org version ${expectedOrgVersion}`)
  throw Boom.internal('Consistency timeout waiting for expected version')
}
```

**Step 5: Run tests to verify**

Run: `npm test src/repositories/organisations/mongodb.test.js`
Expected: Tests FAIL (same as inmemory - expected)

**Step 6: Commit**

```bash
git add src/repositories/organisations/mongodb.js
git commit -m "feat(orgs): add version-aware retry to MongoDB repository"
```

---

## Task 8: Document Failing Contract Tests

**Files:**

- Create: `docs/plans/2025-11-03-failing-tests-inventory.md`

**Step 1: Run contract tests and capture failures**

Run: `npm test src/repositories/organisations/contract/update.contract.js 2>&1 | tee test-failures.txt`

**Step 2: Create inventory document**

Document each failing test with:

- Test name
- File location
- Line number
- Reason for failure (stale read after update)
- Fix needed (add expectedVersion parameter)

**Step 3: Commit the inventory**

```bash
git add docs/plans/2025-11-03-failing-tests-inventory.md
git commit -m "docs: inventory of failing contract tests"
```

---

## Task 9: Fix First Contract Test - Basic Update

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:14-33`

**Step 1: Update test to use expectedVersion**

```javascript
it('updates an organisation successfully', async () => {
  const orgData = buildOrganisation()
  await repository.insert(orgData)

  await repository.update(orgData.id, 1, {
    wasteProcessingTypes: ['reprocessor']
  })

  const result = await repository.findById(orgData.id, 2) // Wait for version 2
  expect(result).toMatchObject({
    id: orgData.id,
    orgId: orgData.orgId,
    wasteProcessingTypes: ['reprocessor'],
    reprocessingNations: orgData.reprocessingNations,
    businessType: orgData.businessType,
    submittedToRegulator: orgData.submittedToRegulator,
    submitterContactDetails: orgData.submitterContactDetails,
    companyDetails: orgData.companyDetails
  })
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- update.contract.js -t "updates an organisation successfully"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix basic update test with expectedVersion"
```

---

## Task 10: Fix Registration Update Tests

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:48-85`

**Step 1: Update registration fields test**

```javascript
it('updates registration fields', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)
  const organisationAfterInsert = await repository.findById(organisation.id)

  const originalReg = organisationAfterInsert.registrations[0]
  const registrationToUpdate = {
    ...originalReg,
    material: 'plastic'
  }
  const beforeUpdateOrg = await repository.findById(organisation.id)

  await repository.update(organisation.id, 1, {
    registrations: [registrationToUpdate]
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2
  const updatedReg = result.registrations.find(
    (r) => r.id === registrationToUpdate.id
  )

  const expectedReg = {
    ...originalReg,
    material: 'plastic'
  }
  expect(updatedReg).toMatchObject(expectedReg)
  expect(result.registrations).toHaveLength(organisation.registrations.length)
  beforeUpdateOrg.registrations.slice(1).forEach((origReg) => {
    const afterUpdateReg = result.registrations.find((r) => r.id === origReg.id)
    expect(afterUpdateReg).toMatchObject(origReg)
  })
})
```

**Step 2: Run test to verify**

Run: `npm test -- update.contract.js -t "updates registration fields"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix registration update test with expectedVersion"
```

---

## Task 11: Fix Accreditation Update Tests

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:87-123`

**Step 1: Update accreditation fields test**

```javascript
it('updates accreditation fields', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)
  const organisationAfterInsert = await repository.findById(organisation.id)

  const originalAcc = organisationAfterInsert.accreditations[0]
  const accreditationToUpdate = {
    ...originalAcc,
    material: 'plastic'
  }
  await repository.update(organisation.id, 1, {
    accreditations: [accreditationToUpdate]
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2
  const updatedAcc = result.accreditations.find(
    (a) => a.id === accreditationToUpdate.id
  )

  const expectedAcc = {
    ...originalAcc,
    material: 'plastic'
  }
  expect(updatedAcc).toMatchObject(expectedAcc)

  expect(result.accreditations).toHaveLength(organisation.accreditations.length)
  organisationAfterInsert.accreditations.slice(1).forEach((origAcc) => {
    const afterUpdateAcc = result.accreditations.find(
      (r) => r.id === origAcc.id
    )
    expect(afterUpdateAcc).toMatchObject(origAcc)
  })
})
```

**Step 2: Run test to verify**

Run: `npm test -- update.contract.js -t "updates accreditation fields"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix accreditation update test with expectedVersion"
```

---

## Task 12: Fix Add New Registration Test

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:125-164`

**Step 1: Update test**

```javascript
it('adds new registration via update', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  const { ObjectId } = await import('mongodb')
  const newRegistration = {
    ...organisation.registrations[0],
    id: new ObjectId().toString(),
    material: 'steel'
  }
  delete newRegistration.statusHistory

  await repository.update(organisation.id, 1, {
    registrations: [newRegistration]
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2

  expect(result.registrations).toHaveLength(
    organisation.registrations.length + 1
  )
  expect(result.accreditations.length).toBe(organisation.accreditations.length)

  const addedReg = result.registrations.find((r) => r.id === newRegistration.id)
  expect(addedReg).toBeDefined()

  const { statusHistory, ...expectedReg } = {
    ...newRegistration,
    formSubmissionTime: new Date(newRegistration.formSubmissionTime)
  }
  const { statusHistory: actualStatusHistory, ...actualReg } = addedReg

  expect(actualReg).toMatchObject(expectedReg)
  expect(actualStatusHistory).toHaveLength(1)
  expect(actualStatusHistory[0].status).toBe(STATUS.CREATED)
})
```

**Step 2: Run test**

Run: `npm test -- update.contract.js -t "adds new registration via update"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix add registration test with expectedVersion"
```

---

## Task 13: Fix Add New Accreditation Test

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:166-200`

**Step 1: Update test**

```javascript
it('adds new accreditation via update', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  const { ObjectId } = await import('mongodb')
  const newAccreditation = {
    ...organisation.accreditations[0],
    id: new ObjectId().toString(),
    material: 'aluminium'
  }
  delete newAccreditation.statusHistory

  await repository.update(organisation.id, 1, {
    accreditations: [newAccreditation]
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2

  expect(result.accreditations).toHaveLength(
    organisation.accreditations.length + 1
  )
  const addedAcc = result.accreditations.find(
    (a) => a.id === newAccreditation.id
  )
  expect(addedAcc).toBeDefined()

  const { statusHistory, ...expectedAcc } = {
    ...newAccreditation,
    formSubmissionTime: new Date(newAccreditation.formSubmissionTime)
  }
  const { statusHistory: actualStatusHistory, ...actualAcc } = addedAcc
  expect(actualAcc).toMatchObject(expectedAcc)
  expect(actualStatusHistory).toHaveLength(1)
  expect(actualStatusHistory[0].status).toBe(STATUS.CREATED)
})
```

**Step 2: Run test**

Run: `npm test -- update.contract.js -t "adds new accreditation via update"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix add accreditation test with expectedVersion"
```

---

## Task 14: Fix Status History Tests (Single Update)

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:246-273`

**Step 1: Fix first status history test**

```javascript
it('adds new statusHistory entry when organisation status changes', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  await repository.update(organisation.id, 1, {
    status: STATUS.APPROVED
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2
  expect(result.status).toBe(STATUS.APPROVED)
  expect(result.statusHistory).toHaveLength(2)
  expect(result.statusHistory[0].status).toBe(STATUS.CREATED)
  expect(result.statusHistory[1].status).toBe(STATUS.APPROVED)
  expect(result.statusHistory[1].updatedAt).toBeInstanceOf(Date)
})
```

**Step 2: Fix no-change status history test**

```javascript
it('does not modify statusHistory when organisation status is not changed', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  await repository.update(organisation.id, 1, {
    wasteProcessingTypes: ['exporter']
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2
  expect(result.status).toBe(STATUS.CREATED)
  expect(result.statusHistory).toHaveLength(1)
  expect(result.statusHistory[0].status).toBe(STATUS.CREATED)
})
```

**Step 3: Run tests**

Run: `npm test -- update.contract.js -t "statusHistory"`
Expected: Both tests PASS

**Step 4: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix status history tests with expectedVersion"
```

---

## Task 15: Fix Multiple Status Change Tests

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:275-292`

**Step 1: Update test with multiple updates**

```javascript
it('preserves all existing statusHistory entries when organisation status changes', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  await repository.update(organisation.id, 1, { status: STATUS.APPROVED })
  await repository.update(organisation.id, 2, { status: STATUS.REJECTED })
  await repository.update(organisation.id, 3, {
    status: STATUS.SUSPENDED
  })

  const result = await repository.findById(organisation.id, 4) // Wait for version 4
  expect(result.status).toBe(STATUS.SUSPENDED)
  expect(result.statusHistory).toHaveLength(4)
  expect(result.statusHistory[0].status).toBe(STATUS.CREATED)
  expect(result.statusHistory[1].status).toBe(STATUS.APPROVED)
  expect(result.statusHistory[2].status).toBe(STATUS.REJECTED)
  expect(result.statusHistory[3].status).toBe(STATUS.SUSPENDED)
})
```

**Step 2: Run test**

Run: `npm test -- update.contract.js -t "preserves all existing statusHistory"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix multiple status change test with expectedVersion"
```

---

## Task 16: Fix Registration Status History Tests

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:294-341`

**Step 1: Fix registration status change test**

```javascript
it('adds new statusHistory entry to registration when status changes', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  const registrationToUpdate = {
    ...organisation.registrations[0],
    status: STATUS.APPROVED
  }
  await repository.update(organisation.id, 1, {
    registrations: [registrationToUpdate]
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2
  const updatedReg = result.registrations.find(
    (r) => r.id === registrationToUpdate.id
  )
  expect(updatedReg.status).toBe(STATUS.APPROVED)
  expect(updatedReg.statusHistory).toHaveLength(2)
  expect(updatedReg.statusHistory[0].status).toBe(STATUS.CREATED)
  expect(updatedReg.statusHistory[1].status).toBe(STATUS.APPROVED)
  expect(updatedReg.statusHistory[1].updatedAt).toBeInstanceOf(Date)
})
```

**Step 2: Fix multiple registration status changes test**

```javascript
it('preserves all existing statusHistory entries for registration', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  const regId = organisation.registrations[0].id

  await repository.update(organisation.id, 1, {
    registrations: [
      { ...organisation.registrations[0], status: STATUS.APPROVED }
    ]
  })
  await repository.update(organisation.id, 2, {
    registrations: [
      { ...organisation.registrations[0], status: STATUS.REJECTED }
    ]
  })

  const result = await repository.findById(organisation.id, 3) // Wait for version 3
  const updatedReg = result.registrations.find((r) => r.id === regId)
  expect(updatedReg.status).toBe(STATUS.REJECTED)
  expect(updatedReg.statusHistory).toHaveLength(3)
  expect(updatedReg.statusHistory[0].status).toBe(STATUS.CREATED)
  expect(updatedReg.statusHistory[1].status).toBe(STATUS.APPROVED)
  expect(updatedReg.statusHistory[2].status).toBe(STATUS.REJECTED)
})
```

**Step 3: Run tests**

Run: `npm test -- update.contract.js -t "registration.*statusHistory"`
Expected: Both PASS

**Step 4: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix registration status history tests"
```

---

## Task 17: Fix Accreditation Status History Tests

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:343-390`

**Step 1: Fix accreditation status change test**

```javascript
it('adds new statusHistory entry to accreditation when status changes', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  const accreditationToUpdate = {
    ...organisation.accreditations[0],
    status: STATUS.APPROVED
  }
  await repository.update(organisation.id, 1, {
    accreditations: [accreditationToUpdate]
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2
  const updatedAcc = result.accreditations.find(
    (a) => a.id === accreditationToUpdate.id
  )
  expect(updatedAcc.status).toBe(STATUS.APPROVED)
  expect(updatedAcc.statusHistory).toHaveLength(2)
  expect(updatedAcc.statusHistory[0].status).toBe(STATUS.CREATED)
  expect(updatedAcc.statusHistory[1].status).toBe(STATUS.APPROVED)
  expect(updatedAcc.statusHistory[1].updatedAt).toBeInstanceOf(Date)
})
```

**Step 2: Fix multiple accreditation status changes**

```javascript
it('preserves all existing statusHistory entries for accreditation', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  const accId = organisation.accreditations[0].id

  await repository.update(organisation.id, 1, {
    accreditations: [
      { ...organisation.accreditations[0], status: STATUS.APPROVED }
    ]
  })
  await repository.update(organisation.id, 2, {
    accreditations: [
      { ...organisation.accreditations[0], status: STATUS.SUSPENDED }
    ]
  })

  const result = await repository.findById(organisation.id, 3) // Wait for version 3
  const updatedAcc = result.accreditations.find((a) => a.id === accId)
  expect(updatedAcc.status).toBe(STATUS.SUSPENDED)
  expect(updatedAcc.statusHistory).toHaveLength(3)
  expect(updatedAcc.statusHistory[0].status).toBe(STATUS.CREATED)
  expect(updatedAcc.statusHistory[1].status).toBe(STATUS.APPROVED)
  expect(updatedAcc.statusHistory[2].status).toBe(STATUS.SUSPENDED)
})
```

**Step 3: Run tests**

Run: `npm test -- update.contract.js -t "accreditation.*statusHistory"`
Expected: Both PASS

**Step 4: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix accreditation status history tests"
```

---

## Task 18: Fix Concurrent Update Test

**Files:**

- Modify: `src/repositories/organisations/contract/update.contract.js:218-241`

**Step 1: Update concurrent scenario test**

```javascript
it('prevents lost updates in concurrent scenarios', async () => {
  const organisation = buildOrganisation()
  await repository.insert(organisation)

  await repository.update(organisation.id, 1, {
    wasteProcessingTypes: ['exporter']
  })

  await expect(
    repository.update(organisation.id, 1, {
      reprocessingNations: ['wales']
    })
  ).rejects.toMatchObject({
    isBoom: true,
    output: { statusCode: 409 }
  })

  const result = await repository.findById(organisation.id, 2) // Wait for version 2
  expect(result.version).toBe(2)
  expect(result.wasteProcessingTypes).toEqual(['exporter'])
  expect(result.reprocessingNations).toEqual(organisation.reprocessingNations)
})
```

**Step 2: Run test**

Run: `npm test -- update.contract.js -t "prevents lost updates"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/repositories/organisations/contract/update.contract.js
git commit -m "test(orgs): fix concurrent update test with expectedVersion"
```

---

## Task 19: Verify All Contract Tests Pass

**Files:**

- N/A (verification only)

**Step 1: Run full contract test suite**

Run: `npm test src/repositories/organisations/contract/`
Expected: All tests PASS

**Step 2: Run full organisations repository tests**

Run: `npm test src/repositories/organisations/`
Expected: All tests PASS

**Step 3: Check for any other findById usage without version**

Run: `grep -r "findById(" src/repositories/organisations/ | grep -v "expectedVersion" | grep -v "// "`

Review any matches - they should be intentional (reads that accept staleness).

---

## Task 20: Run Full Test Suite and Verify

**Files:**

- N/A (verification only)

**Step 1: Run complete test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Verify coverage remains at 100%**

Check coverage report - should still be 100%.

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 4: Final commit**

```bash
git add .
git commit -m "test: verify all tests pass with eventual consistency simulation"
```

---

## Completion Checklist

- [ ] Stale cache infrastructure added to inmemory repository
- [ ] Insert updates both caches immediately
- [ ] Update schedules async staleCache sync
- [ ] All reads use staleCache
- [ ] findById supports optional expectedVersion with retry
- [ ] findRegistrationById supports optional expectedOrgVersion with retry
- [ ] MongoDB implementation has matching signatures
- [ ] All contract tests updated to use expectedVersion after updates
- [ ] Full test suite passes
- [ ] 100% test coverage maintained
- [ ] No type errors
- [ ] All changes committed with clear messages

## Notes for Implementation

- Follow TDD: Tests should fail before fixes, pass after
- Commit frequently after each small change
- If tests don't fail as expected, investigate before proceeding
- The goal is to catch reliance on read-after-write consistency
- Any code doing update-then-read must explicitly request version to wait for
