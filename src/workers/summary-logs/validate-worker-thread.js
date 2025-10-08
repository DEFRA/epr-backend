import { validateWorker } from './validate-worker.js'

export default async function (workerData) {
  return await validateWorker({
    ...workerData
  })
}
