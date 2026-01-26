import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { Clipboard, ClipboardTarget } from "./clipboard"

describe("clipboard", () => {
  const originalEnv = { ...process.env }

  const createClipboard = (options: { isTTY?: boolean; capabilities?: { osc52?: boolean } } = {}) => {
    let written = ""
    const clipboard = new Clipboard({
      isTTY: () => options.isTTY ?? true,
      write: (sequence) => {
        written = sequence
        return true
      },
      getCapabilities: () => options.capabilities,
    })

    return { clipboard, getWritten: () => written }
  }

  beforeEach(() => {
    // Reset environment
    delete process.env["TMUX"]
    delete process.env["STY"]
  })

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv }
  })

  describe("copyToClipboard", () => {
    it("should return false when stream is not a TTY", () => {
      const { clipboard } = createClipboard({ isTTY: false })
      const result = clipboard.copyToClipboard("test")
      expect(result).toBe(false)
    })

    it("should return false when OSC 52 capability is disabled", () => {
      const { clipboard } = createClipboard({ isTTY: true, capabilities: { osc52: false } })
      const result = clipboard.copyToClipboard("test")
      expect(result).toBe(false)
    })

    it("should write OSC52 sequence to TTY stream", () => {
      const { clipboard, getWritten } = createClipboard({ isTTY: true })
      const result = clipboard.copyToClipboard("hello")
      const written = getWritten()

      expect(result).toBe(true)
      expect(written.startsWith("\x1b]52;c;")).toBe(true)
      expect(written).toContain(Buffer.from("hello").toString("base64"))
      expect(written.endsWith("\x1b\\")).toBe(true)
    })

    it("should support different selection targets", () => {
      const { clipboard, getWritten } = createClipboard({ isTTY: true })
      clipboard.copyToClipboard("test", ClipboardTarget.Primary)
      const written = getWritten()
      expect(written.startsWith("\x1b]52;p;")).toBe(true)
    })

    it("should wrap in DCS passthrough for tmux", () => {
      process.env["TMUX"] = "/tmp/tmux-1000/default,12345,0"
      const { clipboard, getWritten } = createClipboard({ isTTY: true })
      clipboard.copyToClipboard("test")
      const written = getWritten()

      expect(written.startsWith("\x1bPtmux;")).toBe(true)
      expect(written.endsWith("\x1b\\")).toBe(true)
      expect(written).toContain("\x1b\x1b")
    })

    it("should wrap in DCS passthrough for GNU Screen", () => {
      process.env["STY"] = "12345.pts-0.hostname"
      const { clipboard, getWritten } = createClipboard({ isTTY: true })
      clipboard.copyToClipboard("test")
      const written = getWritten()

      expect(written.startsWith("\x1bP")).toBe(true)
      expect(written.startsWith("\x1bPtmux;")).toBe(false)
      expect(written.endsWith("\x1b\\")).toBe(true)
    })

    it("should handle nested tmux sessions", () => {
      // Nested tmux has multiple commas in TMUX env var
      process.env["TMUX"] = "/tmp/tmux-1000/default,12345,0,/tmp/tmux-1000/inner,67890,1"
      const { clipboard, getWritten } = createClipboard({ isTTY: true })
      clipboard.copyToClipboard("test")
      const written = getWritten()

      const passthroughCount = (written.match(/\x1bPtmux;/g) || []).length
      expect(passthroughCount).toBeGreaterThan(1)
    })
  })

  describe("clearClipboard", () => {
    it("should write empty OSC52 sequence", () => {
      const { clipboard, getWritten } = createClipboard({ isTTY: true })
      const result = clipboard.clearClipboard()
      const written = getWritten()

      expect(result).toBe(true)
      expect(written).toBe("\x1b]52;c;\x1b\\")
    })
  })

  describe("isOsc52Supported", () => {
    it("should return false when capabilities are missing", () => {
      const { clipboard } = createClipboard()
      const result = clipboard.isOsc52Supported()
      expect(result).toBe(false)
    })

    it("should return true when osc52 capability is set", () => {
      const { clipboard } = createClipboard({ capabilities: { osc52: true } })
      const result = clipboard.isOsc52Supported()
      expect(result).toBe(true)
    })

    it("should return false when osc52 capability is false", () => {
      const { clipboard } = createClipboard({ capabilities: { osc52: false } })
      const result = clipboard.isOsc52Supported()
      expect(result).toBe(false)
    })
  })
})
