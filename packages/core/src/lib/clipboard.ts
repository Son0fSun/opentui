/**
 * OSC 52 clipboard support for terminal applications.
 *
 * OSC 52 is an escape sequence that allows applications to interact with the
 * system clipboard through the terminal emulator. This is particularly useful
 * for remote sessions (SSH) where the application doesn't have direct access
 * to the local clipboard.
 *
 * Supported terminals include:
 * - iTerm2
 * - Kitty
 * - Alacritty
 * - Windows Terminal
 * - Most modern terminal emulators
 *
 * Also supports passthrough for:
 * - tmux (including nested sessions)
 * - GNU Screen
 */

export interface ClipboardOptions {
  /**
   * The stream to write the escape sequence to.
   * Defaults to process.stdout.
   */
  stream?: NodeJS.WriteStream

  /**
   * Target selection:
   * - 'c' = clipboard (default)
   * - 'p' = primary selection (X11)
   * - 's' = secondary selection (X11)
   * - 'q' = query clipboard contents (not widely supported)
   */
  target?: "c" | "p" | "s" | "q"
}

/**
 * Copy text to clipboard using OSC 52 escape sequence.
 *
 * This works over SSH by having the terminal emulator handle the clipboard
 * operation locally, rather than trying to access the clipboard on the
 * remote machine.
 *
 * @param text The text to copy to clipboard
 * @param options Configuration options
 * @returns true if the sequence was written, false if stdout is not a TTY
 *
 * @example
 * ```typescript
 * import { copyToClipboard } from "@opentui/core"
 *
 * // Copy text to clipboard
 * copyToClipboard("Hello, world!")
 *
 * // Copy to primary selection (X11)
 * copyToClipboard("Hello, world!", { target: "p" })
 * ```
 */
export function copyToClipboard(text: string, options: ClipboardOptions = {}): boolean {
  const stream = options.stream ?? process.stdout
  const target = options.target ?? "c"

  if (!stream.isTTY) {
    return false
  }

  const base64 = Buffer.from(text).toString("base64")

  // Use ST (String Terminator \x1b\\) instead of BEL (\x07) for better compatibility
  // Some terminals don't handle BEL correctly inside DCS sequences
  const osc52 = `\x1b]52;${target};${base64}\x1b\\`

  let sequence: string

  if (process.env["TMUX"]) {
    // tmux requires DCS passthrough with tmux; prefix
    // The escape character must be doubled inside the passthrough
    // Format: DCS tmux; ESC <sequence> ST
    // For nested tmux sessions, we need to double escapes for each level
    const tmuxLevel = (process.env["TMUX"]?.match(/,/g) || []).length + 1
    let wrapped = osc52
    for (let i = 0; i < tmuxLevel; i++) {
      // Double all escape characters and wrap in DCS passthrough
      wrapped = wrapped.replace(/\x1b/g, "\x1b\x1b")
      wrapped = `\x1bPtmux;${wrapped}\x1b\\`
    }
    sequence = wrapped
  } else if (process.env["STY"]) {
    // GNU Screen requires DCS passthrough without the tmux; prefix
    // Format: DCS ESC <sequence> ST
    const wrapped = osc52.replace(/\x1b/g, "\x1b\x1b")
    sequence = `\x1bP${wrapped}\x1b\\`
  } else {
    // Direct output for terminals that support OSC52 natively
    sequence = osc52
  }

  stream.write(sequence)
  return true
}

/**
 * Clear clipboard contents using OSC 52.
 *
 * @param options Configuration options
 * @returns true if the sequence was written, false if stdout is not a TTY
 */
export function clearClipboard(options: ClipboardOptions = {}): boolean {
  const stream = options.stream ?? process.stdout
  const target = options.target ?? "c"

  if (!stream.isTTY) {
    return false
  }

  // Empty base64 string clears the clipboard
  const osc52 = `\x1b]52;${target};\x1b\\`

  let sequence: string

  if (process.env["TMUX"]) {
    const tmuxLevel = (process.env["TMUX"]?.match(/,/g) || []).length + 1
    let wrapped = osc52
    for (let i = 0; i < tmuxLevel; i++) {
      wrapped = wrapped.replace(/\x1b/g, "\x1b\x1b")
      wrapped = `\x1bPtmux;${wrapped}\x1b\\`
    }
    sequence = wrapped
  } else if (process.env["STY"]) {
    const wrapped = osc52.replace(/\x1b/g, "\x1b\x1b")
    sequence = `\x1bP${wrapped}\x1b\\`
  } else {
    sequence = osc52
  }

  stream.write(sequence)
  return true
}

/**
 * Check if the current environment likely supports OSC 52.
 *
 * This is a heuristic check based on environment variables and terminal type.
 * It cannot guarantee OSC 52 support, but can help determine if it's worth trying.
 *
 * @returns true if OSC 52 is likely supported
 */
export function isOsc52Supported(): boolean {
  // Not a TTY, definitely won't work
  if (!process.stdout.isTTY) {
    return false
  }

  const term = process.env["TERM"] || ""
  const termProgram = process.env["TERM_PROGRAM"] || ""

  // Known supporting terminals
  const supportingTerminals = [
    "iterm",
    "iterm2",
    "kitty",
    "alacritty",
    "wezterm",
    "contour",
    "foot",
    "rio",
    "ghostty",
  ]

  if (supportingTerminals.some((t) => termProgram.toLowerCase().includes(t))) {
    return true
  }

  // Windows Terminal
  if (process.env["WT_SESSION"]) {
    return true
  }

  // tmux and screen support passthrough
  if (process.env["TMUX"] || process.env["STY"]) {
    return true
  }

  // xterm-256color and similar often support OSC 52
  if (term.includes("256color") || term.includes("kitty") || term.includes("xterm")) {
    return true
  }

  // Default to trying it - many modern terminals support OSC 52
  return true
}
