import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { copyToClipboard, clearClipboard, isOsc52Supported } from "./clipboard"
import { Writable } from "stream"

describe("clipboard", () => {
  const originalEnv = { ...process.env }

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
      const mockStream = new Writable({
        write: () => true,
      }) as NodeJS.WriteStream
      mockStream.isTTY = false

      const result = copyToClipboard("test", { stream: mockStream })
      expect(result).toBe(false)
    })

    it("should return false when OSC 52 capability is disabled", () => {
      const mockStream = new Writable({
        write: () => true,
      }) as NodeJS.WriteStream
      mockStream.isTTY = true

      const result = copyToClipboard("test", { stream: mockStream, capabilities: { osc52: false } })
      expect(result).toBe(false)
    })

    it("should write OSC52 sequence to TTY stream", () => {
      let written = ""
      const mockStream = new Writable({
        write: (chunk) => {
          written = chunk.toString()
          return true
        },
      }) as NodeJS.WriteStream
      mockStream.isTTY = true

      const result = copyToClipboard("hello", { stream: mockStream })

      expect(result).toBe(true)
      // Check that it starts with OSC52 sequence
      expect(written.startsWith("\x1b]52;c;")).toBe(true)
      // Check that it contains base64-encoded "hello"
      expect(written).toContain(Buffer.from("hello").toString("base64"))
      // Check that it ends with ST
      expect(written.endsWith("\x1b\\")).toBe(true)
    })

    it("should support different selection targets", () => {
      let written = ""
      const mockStream = new Writable({
        write: (chunk) => {
          written = chunk.toString()
          return true
        },
      }) as NodeJS.WriteStream
      mockStream.isTTY = true

      copyToClipboard("test", { stream: mockStream, target: "p" })
      expect(written.startsWith("\x1b]52;p;")).toBe(true)
    })

    it("should wrap in DCS passthrough for tmux", () => {
      process.env["TMUX"] = "/tmp/tmux-1000/default,12345,0"

      let written = ""
      const mockStream = new Writable({
        write: (chunk) => {
          written = chunk.toString()
          return true
        },
      }) as NodeJS.WriteStream
      mockStream.isTTY = true

      copyToClipboard("test", { stream: mockStream })

      // Should start with DCS passthrough
      expect(written.startsWith("\x1bPtmux;")).toBe(true)
      // Should end with ST
      expect(written.endsWith("\x1b\\")).toBe(true)
      // Should contain doubled escapes
      expect(written).toContain("\x1b\x1b")
    })

    it("should wrap in DCS passthrough for GNU Screen", () => {
      process.env["STY"] = "12345.pts-0.hostname"

      let written = ""
      const mockStream = new Writable({
        write: (chunk) => {
          written = chunk.toString()
          return true
        },
      }) as NodeJS.WriteStream
      mockStream.isTTY = true

      copyToClipboard("test", { stream: mockStream })

      // Should start with DCS passthrough (no tmux; prefix)
      expect(written.startsWith("\x1bP")).toBe(true)
      expect(written.startsWith("\x1bPtmux;")).toBe(false)
      // Should end with ST
      expect(written.endsWith("\x1b\\")).toBe(true)
    })

    it("should handle nested tmux sessions", () => {
      // Nested tmux has multiple commas in TMUX env var
      process.env["TMUX"] = "/tmp/tmux-1000/default,12345,0,/tmp/tmux-1000/inner,67890,1"

      let written = ""
      const mockStream = new Writable({
        write: (chunk) => {
          written = chunk.toString()
          return true
        },
      }) as NodeJS.WriteStream
      mockStream.isTTY = true

      copyToClipboard("test", { stream: mockStream })

      // Count DCS passthrough wrappers
      const passthroughCount = (written.match(/\x1bPtmux;/g) || []).length
      expect(passthroughCount).toBeGreaterThan(1)
    })
  })

  describe("clearClipboard", () => {
    it("should write empty OSC52 sequence", () => {
      let written = ""
      const mockStream = new Writable({
        write: (chunk) => {
          written = chunk.toString()
          return true
        },
      }) as NodeJS.WriteStream
      mockStream.isTTY = true

      const result = clearClipboard({ stream: mockStream })

      expect(result).toBe(true)
      // Empty clipboard has no base64 content
      expect(written).toBe("\x1b]52;c;\x1b\\")
    })
  })

  describe("isOsc52Supported", () => {
    it("should return false when capabilities are missing", () => {
      const result = isOsc52Supported()
      expect(result).toBe(false)
    })

    it("should return true when osc52 capability is set", () => {
      const result = isOsc52Supported({ osc52: true })
      expect(result).toBe(true)
    })

    it("should return false when osc52 capability is false", () => {
      const result = isOsc52Supported({ osc52: false })
      expect(result).toBe(false)
    })
  })
})
