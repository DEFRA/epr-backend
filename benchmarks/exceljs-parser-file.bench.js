import { readFile, stat } from 'node:fs/promises'
import { Bench } from 'tinybench'
import { parse } from '../src/adapters/parsers/summary-logs/exceljs-parser.js'

const filePath = process.argv[2]

if (!filePath) {
  console.error('Usage: npm run benchmark:file <path-to-xlsx-file>')
  process.exit(1)
}

try {
  const fileStats = await stat(filePath)
  const fileSizeKB = (fileStats.size / 1024).toFixed(2)

  console.log(`File: ${filePath}`)
  console.log(`Size: ${fileSizeKB} KB`)
  console.log('Loading file...')

  const fileBuffer = await readFile(filePath)

  console.log('Running benchmark...\n')

  const bench = new Bench({
    time: 10000,
    iterations: 5,
    warmupTime: 0,
    warmupIterations: 1
  })

  bench.add(`parse ${filePath}`, async () => {
    await parse(fileBuffer)
  })

  await bench.run()

  console.table(
    bench.table((task) => ({
      Task: task.name,
      'ops/sec': task.result?.hz.toFixed(2),
      'Average (ms)': task.result?.latency.mean.toFixed(2),
      'Min (ms)': task.result?.latency.min.toFixed(2),
      'Max (ms)': task.result?.latency.max.toFixed(2),
      'p99 (ms)': task.result?.latency.p99?.toFixed(2) ?? 'N/A',
      Samples: task.result?.latency.samples.length
    }))
  )

  console.log('\n✅ Benchmark completed!')
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}
