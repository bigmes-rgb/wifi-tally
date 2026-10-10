import { defaultHardwareProfile, HardwareProfile } from './HardwareProfile'
import { applyFixes, checksFor, diagnose, wiringPassed, WiringAnswer } from './WiringDiagnosis'

const answer = (pairs: Record<string, string>): WiringAnswer[] => Object.entries(pairs).map(([checkId, a]) => ({ checkId, answer: a }))

describe("checksFor()", () => {
  test("one RGB operator light: dark check plus the three colours", () => {
    const ids = checksFor(defaultHardwareProfile()).map(c => c.id)
    expect(ids).toEqual(["operator-dark", "operator-R", "operator-G", "operator-B"])
  })
  test("a stage strip adds its own checks including the pixel count", () => {
    const profile = defaultHardwareProfile()
    profile.stage = { kind: "ws2812", polarity: "anode", pixels: 4, order: "grb" }
    const ids = checksFor(profile).map(c => c.id)
    expect(ids).toEqual(["operator-dark", "operator-R", "operator-G", "operator-B", "stage-dark", "stage-R", "stage-G", "stage-B", "stage-pixels"])
    const red = checksFor(profile).find(c => c.id === "stage-R")
    expect(red.operator).toEqual([0, 0, 0])
    expect(red.stage).toEqual([255, 0, 0])
  })
})

describe("diagnose() for an RGB light", () => {
  const profile = defaultHardwareProfile()
  const checks = checksFor(profile)

  test("all as expected: wired correctly, test passed", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "R", "operator-G": "G", "operator-B": "B" }))
    expect(findings).toEqual([{ severity: "ok", role: "operator", text: "The operator light is wired correctly." }])
    expect(wiringPassed(findings, profile)).toBe(true)
  })
  test("unanswered checks give no verdict yet", () => {
    expect(diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "R" }))).toEqual([])
  })
  test("red and green swapped names the pins to swap", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "G", "operator-G": "R", "operator-B": "B" }))
    expect(findings.map(f => f.severity)).toEqual(["fix"])
    expect(findings[0].text).toContain("green and red legs of the operator light are swapped")
    expect(findings[0].text).toContain("Swap the wires on D1 and D2")
    expect(wiringPassed(findings, profile)).toBe(false)
  })
  test("three legs rotated are reported leg by leg", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "G", "operator-G": "B", "operator-B": "R" }))
    expect(findings.map(f => f.severity)).toEqual(["fix", "fix", "fix"])
    expect(findings[0].text).toContain("D2 should drive red but lights the green leg. Move that wire to D1.")
  })
  test("a dead channel points at its wire", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "R", "operator-G": "G", "operator-B": "nothing" }))
    expect(findings).toHaveLength(1)
    expect(findings[0].text).toContain("blue of the operator light never lit")
    expect(findings[0].text).toContain("D3")
  })
  test("nothing ever lights: power or common pin", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "nothing", "operator-G": "nothing", "operator-B": "nothing" }))
    expect(findings).toHaveLength(1)
    expect(findings[0].text).toContain("never lit")
    expect(findings[0].text).toContain("3V3")
  })
  test("lit when off and off when lit: common pin the other way round, fixed by the hub", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "lit", "operator-R": "nothing", "operator-G": "white", "operator-B": "nothing" }))
    expect(findings).toHaveLength(1)
    expect(findings[0].fixPolarity).toEqual("cathode")
    const fixed = applyFixes(profile, findings)
    expect(fixed.operator.polarity).toEqual("cathode")
    expect(profile.operator.polarity).toEqual("anode") // untouched
  })
  test("lit when everything should be off but colours work: a stuck channel", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "lit", "operator-R": "R", "operator-G": "G", "operator-B": "B" }))
    expect(findings.some(f => f.text.includes("stuck on"))).toBe(true)
    expect(wiringPassed(findings, profile)).toBe(false)
  })
})

describe("diagnose() for a WS2812 strip", () => {
  const profile: HardwareProfile = {
    operator: { kind: "ws2812", polarity: "anode", pixels: 5, order: "grb" },
    stage: { kind: "none", polarity: "anode", pixels: 0, order: "grb" },
  }
  const checks = checksFor(profile)

  test("right colours and count: passed", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "R", "operator-G": "G", "operator-B": "B", "operator-pixels": "5" }))
    expect(findings).toEqual([{ severity: "ok", role: "operator", text: "The operator light strip is wired correctly." }])
    expect(wiringPassed(findings, profile)).toBe(true)
  })
  test("red and green swapped: the other pixel order, fixed by the hub", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "G", "operator-G": "R", "operator-B": "B", "operator-pixels": "5" }))
    expect(findings[0].fixOrder).toEqual("rgb")
    expect(applyFixes(profile, findings).operator.order).toEqual("rgb")
  })
  test("fewer pixels than expected: the count is corrected", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "R", "operator-G": "G", "operator-B": "B", "operator-pixels": "3" }))
    expect(findings[0].fixPixels).toEqual(3)
    expect(applyFixes(profile, findings).operator.pixels).toEqual(3)
  })
  test("no pixel at all: data wire or power", () => {
    const findings = diagnose(profile, checks, answer({ "operator-dark": "dark", "operator-R": "nothing", "operator-G": "nothing", "operator-B": "nothing", "operator-pixels": "0" }))
    expect(findings[0].text).toContain("D4")
  })
})

describe("findings name the pins to check, for the diagram", () => {
  test("swapped legs name both pins", () => {
    const profile: HardwareProfile = { operator: { kind: "rgb", polarity: "anode", pixels: 5, order: "grb" }, stage: { kind: "none", polarity: "anode", pixels: 4, order: "grb" } }
    const checks = checksFor(profile)
    const answers = checks.map(c => ({ checkId: c.id, answer: c.id === "operator-R" ? "G" : c.id === "operator-G" ? "R" : c.id === "operator-B" ? "B" : "nothing" }))
    const swapped = diagnose(profile, checks, answers).find(f => /swapped/.test(f.text))
    expect(swapped?.pins?.sort()).toEqual(["D1", "D2"])
  })
})
