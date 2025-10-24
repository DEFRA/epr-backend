import { createServer } from 'node:http'

let server
const buckets = new Map()

function handleRequest(req, res) {
  const { pathname } = new URL(req.url, 'http://dummy')
  const pathParts = pathname.split('/').filter(Boolean)

  // Set CORS headers for S3 compatibility
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, HEAD')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // ListBuckets
  if (req.method === 'GET' && pathParts.length === 0) {
    const bucketsXml = Array.from(buckets.keys())
      .map((name) => `<Bucket><Name>${name}</Name></Bucket>`)
      .join('')
    res.writeHead(200, { 'Content-Type': 'application/xml' })
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult>
  <Buckets>${bucketsXml}</Buckets>
</ListAllMyBucketsResult>`)
    return
  }

  const bucketName = pathParts[0]
  const objectKey = pathParts.slice(1).join('/')

  // CreateBucket
  if (req.method === 'PUT' && pathParts.length === 1) {
    if (buckets.has(bucketName)) {
      res.writeHead(409, { 'Content-Type': 'application/xml' })
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>BucketAlreadyOwnedByYou</Code>
  <Message>Your previous request to create the named bucket succeeded and you already own it.</Message>
</Error>`)
      return
    }
    buckets.set(bucketName, new Map())
    res.writeHead(200)
    res.end()
    return
  }

  // PutObject
  if (req.method === 'PUT' && pathParts.length > 1) {
    if (!buckets.has(bucketName)) {
      res.writeHead(404, { 'Content-Type': 'application/xml' })
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchBucket</Code>
  <Message>The specified bucket does not exist</Message>
</Error>`)
      return
    }

    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      buckets.get(bucketName).set(objectKey, buffer)
      res.writeHead(200, { ETag: '"mock-etag"' })
      res.end()
    })
    return
  }

  // GetObject
  if (req.method === 'GET' && pathParts.length > 1) {
    if (!buckets.has(bucketName)) {
      res.writeHead(404, { 'Content-Type': 'application/xml' })
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchBucket</Code>
  <Message>The specified bucket does not exist</Message>
</Error>`)
      return
    }

    const bucket = buckets.get(bucketName)
    if (!bucket.has(objectKey)) {
      res.writeHead(404, { 'Content-Type': 'application/xml' })
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
</Error>`)
      return
    }

    const data = bucket.get(objectKey)
    res.writeHead(200, { 'Content-Length': data.length })
    res.end(data)
    return
  }

  // Not implemented
  res.writeHead(501)
  res.end()
}

export async function startS3Server() {
  // If server is already running, don't start another one
  if (server && server.listening) {
    return
  }

  return new Promise((resolve, reject) => {
    server = createServer(handleRequest)
    server.on('error', (err) => {
      // If port is already in use, assume another test file started the server
      if (err.code === 'EADDRINUSE') {
        globalThis.__S3_ENDPOINT__ = 'http://127.0.0.1:4566'
        resolve()
      } else {
        reject(err)
      }
    })
    server.listen(4566, '127.0.0.1', () => {
      globalThis.__S3_ENDPOINT__ = 'http://127.0.0.1:4566'
      resolve()
    })
  })
}

export async function stopS3Server() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        buckets.clear()
        resolve()
      })
    } else {
      resolve()
    }
  })
}
