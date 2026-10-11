import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import useSessionState from './useSessionState'

const Counter = ({ valid }: { valid?: (v: unknown) => boolean }) => {
  const [count, setCount] = useSessionState<number>("test.count", () => 1, valid as any)
  return <button data-testid="count" onClick={() => setCount(c => c + 1)}>{count}</button>
}
afterEach(() => { window.sessionStorage.clear(); jest.restoreAllMocks() })

test("a value outlives a page reload in the same tab", () => {
  const first = render(<Counter />)
  fireEvent.click(screen.getByTestId("count"))
  expect(screen.getByTestId("count").textContent).toBe("2")
  first.unmount()
  render(<Counter />)
  expect(screen.getByTestId("count").textContent).toBe("2")
})

test("a stored value that does not fit is not used", () => {
  window.sessionStorage.setItem("test.count", JSON.stringify("two"))
  render(<Counter valid={v => typeof v === "number"} />)
  expect(screen.getByTestId("count").textContent).toBe("1")
})

test("without storage (blocked, a private window) the page still works; the value is only not kept", () => {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError") })
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("SecurityError") })
  render(<Counter />)
  fireEvent.click(screen.getByTestId("count"))
  expect(screen.getByTestId("count").textContent).toBe("2")
})
