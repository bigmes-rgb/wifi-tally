// What a board prints arrives in chunks that end anywhere. This joins them back into lines, so each one lands in
// the hub log whole and on its own, and never half on one log line and half on the next.
export function lineLogger(log: (line: string) => void) {
  let rest = ""
  const emit = (line: string) => {
    const trimmed = line.replace(/\s+$/, "")
    if (trimmed !== "") log(trimmed)
  }
  return {
    add(chunk: string) {
      rest += chunk
      const lines = rest.split(/\r?\n/)
      rest = lines.pop() || ""
      lines.forEach(emit)
    },
    // the last line, which may have no line break
    end() {
      emit(rest)
      rest = ""
    },
  }
}
