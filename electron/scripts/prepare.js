#!/usr/bin/env node
// Points this wrapper at a locally built hub package and copies its metadata.
//
// Usage: node scripts/prepare.js ../hub/vtally-0.6.0.tgz
//
// Upstream pulled "vtally" from npmjs.com; this fork builds the hub in the
// same workflow run and installs the resulting tarball instead, so a release
// never depends on an account outside this repository.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const tarball = process.argv[2]
if (!tarball || !fs.existsSync(tarball)) {
  console.error('usage: prepare.js <path to vtally-*.tgz built by hub/scripts/build.sh>')
  process.exit(1)
}

const here = path.dirname(__dirname)
execSync(`npm install --no-audit --no-fund --save "${path.resolve(tarball)}"`, { cwd: here, stdio: 'inherit' })

const hub = JSON.parse(fs.readFileSync(path.join(here, 'node_modules', 'vtally', 'package.json')))
const ours = JSON.parse(fs.readFileSync(path.join(here, 'package.json')))
ours.version = hub.version
if (hub.description) ours.description = hub.description
fs.writeFileSync(path.join(here, 'package.json'), JSON.stringify(ours, null, 2) + '\n')
console.log(`electron wrapper now packages vtally ${hub.version}`)
