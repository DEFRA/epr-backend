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

  const task = bench.tasks[0]
  const result = task.result

  if (result) {
    console.log('📊 Benchmark Results')
    console.log('━'.repeat(50))
    console.log(`Operations/sec: ${result.hz?.toFixed(2) ?? 'N/A'}`)
    console.log(
      `Average:        ${result.latency.mean?.toFixed(3) ?? 'N/A'} ms`
    )
    console.log(`Median:         ${result.latency.p50?.toFixed(3) ?? 'N/A'} ms`)
    console.log(`Min:            ${result.latency.min?.toFixed(3) ?? 'N/A'} ms`)
    console.log(`Max:            ${result.latency.max?.toFixed(3) ?? 'N/A'} ms`)
    console.log(`p95:            ${result.latency.p75?.toFixed(3) ?? 'N/A'} ms`)
    console.log(`p99:            ${result.latency.p99?.toFixed(3) ?? 'N/A'} ms`)
    console.log(`Samples:        ${result.latency.samples?.length ?? 'N/A'}`)
    console.log('━'.repeat(50))
  }

  console.log('\n✅ Benchmark completed!')
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}
