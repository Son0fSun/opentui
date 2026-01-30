// OSC 52 clipboard support for terminal applications.
// Now delegates to native Zig implementation for ANSI sequence generation.

export enum ClipboardTarget {
  Clipboard = 0,
  Primary = 1,
  Secondary = 2,
  Query = 3,
}

type ClipboardCapabilities = { osc52?: boolean } | null | undefined

type NativeClipboardAdapter = {
  copyToClipboard: (target: number, payload: Uint8Array) => boolean
  isOsc52Supported: () => boolean
}

type LegacyClipboardAdapter = {
  isTTY: () => boolean
  write: (sequence: string) => boolean
  getCapabilities: () => ClipboardCapabilities
}

type ClipboardAdapter = NativeClipboardAdapter | LegacyClipboardAdapter

function isNativeAdapter(adapter: ClipboardAdapter): adapter is NativeClipboardAdapter {
  return "copyToClipboard" in adapter && "isOsc52Supported" in adapter
}

export class Clipboard {
  private adapter: ClipboardAdapter

  constructor(adapter: ClipboardAdapter) {
    this.adapter = adapter
  }

  public copyToClipboard(text: string, target: ClipboardTarget = ClipboardTarget.Clipboard): boolean {
    if (isNativeAdapter(this.adapter)) {
      if (!this.adapter.isOsc52Supported()) {
        return false
      }
      const base64 = Buffer.from(text).toString("base64")
      const payload = new TextEncoder().encode(base64)
      return this.adapter.copyToClipboard(target, payload)
    }

    // Legacy adapter fallback - should not be used in production
    return this.legacyCopyToClipboard(text, target)
  }

  public clearClipboard(target: ClipboardTarget = ClipboardTarget.Clipboard): boolean {
    if (isNativeAdapter(this.adapter)) {
      if (!this.adapter.isOsc52Supported()) {
        return false
      }
      const payload = new TextEncoder().encode("")
      return this.adapter.copyToClipboard(target, payload)
    }

    // Legacy adapter fallback
    return this.legacyClearClipboard(target)
  }

  public isOsc52Supported(): boolean {
    if (isNativeAdapter(this.adapter)) {
      return this.adapter.isOsc52Supported()
    }

    // Legacy adapter
    const legacyAdapter = this.adapter as LegacyClipboardAdapter
    return legacyAdapter.getCapabilities()?.osc52 ?? false
  }

  // Legacy methods for backward compatibility with tests
  private legacyCopyToClipboard(text: string, target: ClipboardTarget): boolean {
    const legacyAdapter = this.adapter as LegacyClipboardAdapter
    if (!legacyAdapter.isTTY()) {
      return false
    }

    const capabilities = legacyAdapter.getCapabilities()
    if (capabilities && !capabilities.osc52) {
      return false
    }

    const base64 = Buffer.from(text).toString("base64")
    this.legacyWriteOsc52(base64, target)
    return true
  }

  private legacyClearClipboard(target: ClipboardTarget): boolean {
    const legacyAdapter = this.adapter as LegacyClipboardAdapter
    if (!legacyAdapter.isTTY()) {
      return false
    }

    const capabilities = legacyAdapter.getCapabilities()
    if (capabilities && !capabilities.osc52) {
      return false
    }

    this.legacyWriteOsc52("", target)
    return true
  }

  private legacyWriteOsc52(payload: string, target: ClipboardTarget): void {
    const legacyAdapter = this.adapter as LegacyClipboardAdapter
    const targetChar = ["c", "p", "s", "q"][target]
    const osc52 = `\x1b]52;${targetChar};${payload}\x1b\\`

    let sequence: string

    if (process.env["TMUX"]) {
      // tmux requires DCS passthrough with tmux; prefix.
      // Double ESC for each tmux nesting level.
      const tmuxLevel = (process.env["TMUX"]?.match(/,/g) || []).length + 1
      let wrapped = osc52
      for (let i = 0; i < tmuxLevel; i++) {
        wrapped = wrapped.replace(/\x1b/g, "\x1b\x1b")
        wrapped = `\x1bPtmux;${wrapped}\x1b\\`
      }
      sequence = wrapped
    } else if (process.env["STY"]) {
      // GNU Screen requires DCS passthrough without the tmux; prefix.
      const wrapped = osc52.replace(/\x1b/g, "\x1b\x1b")
      sequence = `\x1bP${wrapped}\x1b\\`
    } else {
      sequence = osc52
    }

    legacyAdapter.write(sequence)
  }
}
