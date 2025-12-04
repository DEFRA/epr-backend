import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bench } from 'tinybench'
import ExcelJS from 'exceljs'
import { parse } from '../src/adapters/parsers/summary-logs/exceljs-parser.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const populateWorksheet = (worksheet, rows) => {
  rows.forEach((rowData, index) => {
    worksheet.getRow(index + 1).values = rowData
  })
}

const createWorkbook = async (worksheets) => {
  const workbook = new ExcelJS.Workbook()

  for (const [sheetName, rows] of Object.entries(worksheets)) {
    const worksheet = workbook.addWorksheet(sheetName)
    populateWorksheet(worksheet, rows)
  }

  return workbook.xlsx.writeBuffer()
}

const createLargeDataset = (rowCount) => {
  const headers = [
    '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
    'ROW_ID',
    'DATE_RECEIVED',
    'TONNAGE',
    'MATERIAL',
    'PROCESSING_TYPE'
  ]

  const rows = [headers]

  for (let i = 0; i < rowCount; i++) {
    rows.push([
      undefined,
      `REF-${i.toString().padStart(6, '0')}`,
      `2024-01-${(1 + (i % 28)).toString().padStart(2, '0')}`,
      Math.floor(Math.random() * 1000) / 10,
      ['Paper and board', 'Plastic', 'Glass', 'Metal'][i % 4],
      ['REPROCESSOR', 'EXPORTER', 'DOMESTIC'][i % 3]
    ])
  }

  rows.push([])

  return rows
}

console.log('Preparing benchmark datasets...')

const realFileBuffer = await readFile(
  path.join(dirname, '../src/data/fixtures/uploads/reprocessor.xlsx')
)

const smallDatasetBuffer = await createWorkbook({
  Sheet1: [
    ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
    ['__EPR_META_MATERIAL', 'Paper and board'],
    ...createLargeDataset(10)
  ]
})

const mediumDatasetBuffer = await createWorkbook({
  Sheet1: [
    ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
    ['__EPR_META_MATERIAL', 'Paper and board'],
    ...createLargeDataset(100)
  ]
})

const largeDatasetBuffer = await createWorkbook({
  Sheet1: [
    ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
    ['__EPR_META_MATERIAL', 'Paper and board'],
    ...createLargeDataset(1000)
  ]
})

const multiSheetBuffer = await createWorkbook({
  Sheet1: [
    ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
    ...createLargeDataset(50)
  ],
  Sheet2: [
    ['__EPR_META_MATERIAL', 'Paper and board'],
    ...createLargeDataset(50)
  ],
  Sheet3: [
    ['__EPR_META_FACILITY_NAME', 'Test Facility'],
    ...createLargeDataset(50)
  ]
})

console.log('Running benchmarks...\n')

const bench = new Bench({
  time: 1000,
  warmupTime: 500,
  warmupIterations: 5
})

bench
  .add('parse real fixture file (reprocessor.xlsx)', async () => {
    await parse(realFileBuffer)
  })
  .add('parse small dataset (10 rows)', async () => {
    await parse(smallDatasetBuffer)
  })
  .add('parse medium dataset (100 rows)', async () => {
    await parse(mediumDatasetBuffer)
  })
  .add('parse large dataset (1000 rows)', async () => {
    await parse(largeDatasetBuffer)
  })
  .add('parse multi-sheet (3 sheets, 50 rows each)', async () => {
    await parse(multiSheetBuffer)
  })

await bench.run()

console.table(
  bench.tasks.map(({ name, result }) => ({
    'Task Name': name,
    'Ops/sec': result?.throughput.mean.toFixed(2) ?? 'N/A',
    'Average (ms)': result?.latency.mean.toFixed(3) ?? 'N/A',
    'Min (ms)': result?.latency.min.toFixed(3) ?? 'N/A',
    'Max (ms)': result?.latency.max.toFixed(3) ?? 'N/A',
    'p95 (ms)': result?.latency.p75?.toFixed(3) ?? 'N/A',
    'p99 (ms)': result?.latency.p99?.toFixed(3) ?? 'N/A',
    Samples: result?.latency.samples.length ?? 'N/A'
  }))
)

console.log('\n✅ Benchmark completed!')
