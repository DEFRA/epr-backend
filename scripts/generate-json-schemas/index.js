import fs from 'fs'
import path from 'path'
import { getOrganisationJSONSchema } from './organisation.update.js'

const organisation = getOrganisationJSONSchema()

const outputDir = path.join(process.cwd(), '.schemas')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir)
}

const outputPath = path.join(outputDir, 'organisation.update.json')
fs.writeFileSync(outputPath, JSON.stringify(organisation, null, 2))

const adminFrontendPath = path.join(
  process.cwd(),
  '../epr-re-ex-admin-frontend/src/server/common/schemas/organisation.json'
)

if (fs.existsSync(path.dirname(adminFrontendPath))) {
  fs.writeFileSync(adminFrontendPath, JSON.stringify(organisation, null, 2))
  console.log(`Updated schema in admin frontend: ${adminFrontendPath}`)
}
