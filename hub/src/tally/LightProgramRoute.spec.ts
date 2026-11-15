/**
 * @jest-environment node
 */
import express from 'express'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { AddressInfo } from 'net'
import { serveLightProgram } from './LightProgramRoute'

type Answer = { status: number, headers: http.IncomingHttpHeaders, body: Buffer }

// asks the way a light does: HTTP/1.0, one request, the connection closed after
const ask = (port: number): Promise<Answer> => new Promise((resolve, reject) => {
  const req = http.request({ port, path: "/tally/lfs.img", method: "GET", headers: { Connection: "close" } }, res => {
    const chunks: Buffer[] = []
    res.on('data', c => chunks.push(c))
    res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }))
  })
  req.on('error', reject)
  req.end()
})

const serve = (findFile: () => Promise<string | null>) => new Promise<http.Server>(resolve => {
  const app = express()
  app.get('/tally/lfs.img', serveLightProgram(findFile))
  const server = app.listen(0, () => resolve(server))
})

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lfs-")) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

test("the program comes whole, with its length, from the release package's path with '..' in it", async () => {
  const image = Buffer.alloc(3000, 7)
  fs.mkdirSync(path.join(dir, "esp8266"))
  fs.mkdirSync(path.join(dir, "src", "tally"), { recursive: true })
  fs.writeFileSync(path.join(dir, "esp8266", "lfs.img"), image)
  // what NodeMcuConnector.localFileDirs produces in a release: __dirname + "/../../esp8266"
  const releasePath = path.join(dir, "src", "tally") + "/../../esp8266/lfs.img"
  expect(releasePath).toContain("..")
  const server = await serve(async () => releasePath)
  try {
    const answer = await ask((server.address() as AddressInfo).port)
    expect(answer.status).toBe(200)
    expect(answer.headers["content-length"]).toBe("3000")
    expect(answer.headers["content-type"]).toBe("application/octet-stream")
    expect(answer.body.equals(image)).toBe(true)
  } finally {
    server.close()
  }
})

test("a hub without the program answers 404, so the light keeps what it has", async () => {
  const server = await serve(async () => null)
  try {
    const answer = await ask((server.address() as AddressInfo).port)
    expect(answer.status).toBe(404)
  } finally {
    server.close()
  }
})
