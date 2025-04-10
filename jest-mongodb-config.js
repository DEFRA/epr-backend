export default {
  mongodbMemoryServerOptions: {
    binary: {
      skipMD5: true
    },
    autoStart: false,
    instance: {
      dbName: 'epr-backend'
    }
  },
  mongoURLEnvName: 'MONGO_URI',
  useSharedDBForAllJestWorkers: false
}
