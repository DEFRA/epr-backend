export function changeStreamsHandler(db) {
  const eprOrgs = db.collection('epr-organisations')

  const changeStream = eprOrgs.watch([], {
    fullDocument: 'updateLookup'
  })

  changeStream.on('change', (change) => {
    console.log(
      'Change detected:',
      change.operationType,
      change.documentKey?._id
    )
    // Add your business logic here
  })

  changeStream.on('error', (error) => {
    console.error('Change stream error:', error.message)
  })

  return changeStream
}
