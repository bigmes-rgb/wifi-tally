import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'
import Help from './Help'
import TallyDevice from '../../flasher/TallyDevice'

describe('<Help> when no board was found', () => {
  test('it says Windows sees nothing when there is no serial port at all', () => {
    const device = TallyDevice.fromJson({ serialPorts: [] } as any)
    render(<Help tallyDevice={device} onReload={() => {}} />)
    expect(screen.getByText(/reports no serial port at all/)).toBeInTheDocument()
    expect(screen.queryByTestId('serial-ports')).toBeNull()
  })
  test('it lists the ports it did see so the operator can tell driver trouble from cable trouble', () => {
    const device = TallyDevice.fromJson({ serialPorts: [
      { path: 'COM1', manufacturer: 'Microsoft' },
      { path: 'COM5', manufacturer: 'FTDI', vendorId: '0403', productId: '6001' },
    ] } as any)
    render(<Help tallyDevice={device} onReload={() => {}} />)
    expect(screen.getByText(/None of the serial ports/)).toBeInTheDocument()
    expect(screen.getByTestId('serial-ports').textContent).toContain('COM1 (Microsoft, not USB)')
    expect(screen.getByTestId('serial-ports').textContent).toContain('COM5 (FTDI, USB 0403:6001)')
    expect(screen.getByText(/CH340 driver/)).toHaveAttribute('href', expect.stringContaining('wch-ic.com'))
  })
  test('it shows the error when listing the ports itself failed, instead of pretending there are none', () => {
    const device = TallyDevice.fromJson({ serialPorts: [], errorMessage: 'The serial driver did not load' } as any)
    render(<Help tallyDevice={device} onReload={() => {}} />)
    expect(screen.getByTestId('device-error').textContent).toContain('The serial driver did not load')
  })
})
