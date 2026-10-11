import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import LightsWifi from './LightsWifi'

test("the card explains the handover and offers no send while no light is on the network", () => {
  render(<LightsWifi />)
  const card = screen.getByTestId("lights-wifi")
  expect(card.textContent).toContain("Send the new one to the lights first")
  expect(card.textContent).toContain("goes back to the old one")
  expect(screen.getByTestId("lights-wifi-send")).toBeDisabled()
})
