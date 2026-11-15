import path from 'path'
import { Request, Response } from 'express'

// Gives a light the program for its flash (see tally/src/my-update.lua). Content-Length tells the light when
// it has everything; a hub without the file answers 404 and the light keeps what it has.
// The file's path is resolved to a plain absolute one first: Express refuses any path with a ".." segment
// (403 Forbidden), and the release package finds the file at "src/tally/../../esp8266/lfs.img".
export const serveLightProgram = (findFile: () => Promise<string | null>) => async (req: Request, res: Response) => {
  const file = await findFile()
  if (!file) {
    console.warn(`A light at ${req.ip} asked for the light program, but this hub has none`)
    res.status(404).type("text/plain").send("Not Found")
    return
  }
  res.type("application/octet-stream")
  res.sendFile(path.resolve(file), { cacheControl: false, acceptRanges: false }, err => {
    if (err) console.warn(`Could not give the light program to a light at ${req.ip}: ${err.message}`)
  })
}
