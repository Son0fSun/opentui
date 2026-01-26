// OSC 52 clipboard support for terminal applications.
// Supports tmux/screen passthrough, including nested tmux sessions.

export enum ClipboardTarget {
  Clipboard = "c",
  Primary = "p",
  Secondary = "s",
  Query = "q",
}

type ClipboardCapabilities = { osc52?: boolean } | null | undefined

type ClipboardAdapter = {
  isTTY: () => boolean
  write: (sequence: string) => boolean
  getCapabilities: () => ClipboardCapabilities
}

export class Clipboard {
  private adapter: ClipboardAdapter

  constructor(adapter: ClipboardAdapter) {
    this.adapter = adapter
  }

  public copyToClipboard(text: string, target: ClipboardTarget = ClipboardTarget.Clipboard): boolean {
    if (!this.canWrite()) {
      return false
    }

    const base64 = Buffer.from(text).toString("base64")
    this.writeOsc52(base64, target)
    return true
  }

  public clearClipboard(target: ClipboardTarget = ClipboardTarget.Clipboard): boolean {
    if (!this.canWrite()) {
      return false
    }

    this.writeOsc52("", target)
    return true
  }

  public isOsc52Supported(): boolean {
    return this.adapter.getCapabilities()?.osc52 ?? false
  }

  private canWrite(): boolean {
    if (!this.adapter.isTTY()) {
      return false
    }

    const capabilities = this.adapter.getCapabilities()
    if (capabilities && !capabilities.osc52) {
      return false
    }

    return true
  }

  private writeOsc52(payload: string, target: ClipboardTarget): void {
    const osc52 = `\x1b]52;${target};${payload}\x1b\\`

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

    this.adapter.write(sequence)
  }
}
