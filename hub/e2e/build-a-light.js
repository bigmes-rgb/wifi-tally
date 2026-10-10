// Walks "Build a light" from a bare board to a light on the Wi-Fi, in a real browser, against
// a hub started with --with-test. Its pretend board behaves like a real one where it matters:
// factory firmware that answers no Lua, a first start that formats storage, a Wi-Fi report that
// follows the saved settings. Run before every release (CI does):
//
//   HUB_URL=http://localhost:3100 node e2e/build-a-light.js
//
// Needs the "playwright" package and a Chromium it can launch.
const { chromium } = require('playwright')

const HUB = process.env.HUB_URL || 'http://localhost:3100'
const SHOTS = process.env.SHOTS_DIR // optional: where to save screenshots
const log = (step, message) => console.log(`[step ${step}] ${message}`)

async function run() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } })
  const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) }
  try {
    await page.goto(`${HUB}/setup/light`)

    // 1 What is on the board: a 5-pixel NeoPixel strip, drawn as such
    await page.selectOption('[data-testid=profile-operator-kind] select', 'ws2812')
    await page.fill('[data-testid=profile-operator-pixels] input', '5')
    const pixels = await page.$$eval('[data-testid=pixel-operator]', e => e.length)
    if (pixels !== 5) throw new Error(`diagram shows ${pixels} pixels, expected 5`)
    if (await page.$('[data-testid=strip-stage]')) throw new Error('diagram shows a stage strip although none is selected')
    await page.click('[data-testid=wiring-checked]')
    log(1, 'diagram matches the selection')
    await page.click('[data-testid=build-next]')

    // 2 Plug it in: factory firmware -> install -> first start -> tally software
    await page.waitForSelector('[data-testid=device-state-otherFirmware]', { timeout: 30000 })
    log(2, 'a board from the box is recognised as needing the firmware')
    await page.click('[data-testid=device-firmware]')
    await page.waitForSelector('[data-testid=device-first-start]', { timeout: 30000 })
    log(2, 'after the install the page waits for the first start')
    await page.waitForSelector('[data-testid=device-install]', { timeout: 60000 })
    log(2, 'the board answers; the tally software is offered')
    await page.click('[data-testid=device-install]')
    await page.waitForFunction(() => document.querySelector('[data-testid=device-panel]')?.textContent?.includes('is current'), null, { timeout: 60000 })
    log(2, 'tally software installed')
    await shot('2-installed')
    await page.click('[data-testid=build-next]')

    // 3 Wiring test: everything lights as it should
    await page.click('[data-testid=wiring-start]')
    for (const answer of ['dark', 'R', 'G', 'B', '5']) {
      await page.waitForSelector(`[data-testid=wiring-answer-${answer}]`, { timeout: 20000 })
      await page.click(`[data-testid=wiring-answer-${answer}]`)
    }
    await page.waitForSelector('[data-testid=wiring-passed]', { timeout: 20000 })
    log(3, 'wiring test passed')
    await page.click('[data-testid=build-next]')

    // 4 + 5 with a wrong password: the light's own report names the problem
    await page.fill('[data-testid=setup-light-name] input', 'Cam 9')
    await page.fill('[data-testid=setup-light-ssid] input', 'wrong-password')
    await page.fill('[data-testid=setup-light-password] input', 'secret')
    await page.click('[data-testid=setup-light-save]')
    await page.waitForSelector('[data-testid=network-problem-wrongPassword]', { timeout: 60000 })
    log(5, 'a refused password is reported as such')
    await shot('5-wrong-password')

    // back a step: the form still has the name; fix the Wi-Fi and save again
    await page.click('button:has-text("Back")')
    await page.waitForSelector('[data-testid=setup-light-ssid] input', { timeout: 20000 })
    const name = await page.$eval('[data-testid=setup-light-name] input', e => e.value)
    if (name !== 'Cam 9') throw new Error(`going back lost the name (got "${name}")`)
    await page.fill('[data-testid=setup-light-ssid] input', 'Church')
    await page.click('[data-testid=setup-light-save]')
    await page.waitForSelector('[data-testid=network-found]', { timeout: 60000 })
    log(5, 'the light joins the Wi-Fi and finds the hub')
    await shot('5-found')
    console.log('Build a light: every step passed.')
  } catch (e) {
    await shot('failure').catch(() => {})
    throw e
  } finally {
    await browser.close()
  }
}

run().catch(e => { console.error(`Build a light walkthrough FAILED: ${e.message}`); process.exit(1) })
