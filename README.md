# Backplane for Windows

A native **Windows port** of [Backplane](https://github.com/i2cjak/Backplane), the agentic hardware
development app where Claude Code, Codex and other agents work on your KiCad boards and FreeCAD parts while
every change is drawn live beside the conversation.

> **Status: a working first pass, not a finished port.** The hub, the web client and the Claude and Codex
> agents run natively on Windows. The native desktop window, the terminal tab, phone pairing and several
> other features are untested or missing. The full, honest list is in [docs/WINDOWS.md](docs/WINDOWS.md).

Based on upstream `i2cjak/Backplane` at commit `851a915` (2026-10-16). Upstream's own README is kept in
[docs/UPSTREAM_README.md](docs/UPSTREAM_README.md).

## What works today

- **The hub** (`backplane-serve.exe`) built natively with MSYS2 clang: starts, serves the web client, keeps your
  threads and settings.
- **The web client**, in any browser or as an app window (Edge `--app`).
- **Claude and Codex agents:** real turns through the hub got replies (`claude` 2.1.301, `codex` 0.163.0).
- **KiCad 10 and FreeCAD 1.1** are detected from the `PATH` (Settings shows both).
- **One-click launcher** (`windows/`): starts the hub hidden, opens the app window, and stops the hub when the
  window closes.
- **Bend 2.0.36 on Windows:** the Bend compiler and proof checker run under Bun on Windows with a small patch
  ([patches/bend-2.0.36-windows.patch](patches/bend-2.0.36-windows.patch)).
- **Tests:** 141 of the 146 upstream test programs pass (interpreted mode).

## What does not work yet

- **Native window:** opens and draws, but an earlier build crashed after a few seconds (a buffer-size bug, since
  fixed and not yet re-tested). Keyboard, mouse, clipboard, drag and drop and resizing are untested there.
- **Terminal tab** (needs ConPTY), **IME preedit**, pasted images, drag-hover.
- **Phone access over Tailscale:** the hub detects Tailscale, but pairing a phone was not tested.
- **Backplane's KiCad fork** (IPC, sketch router) has no Windows build; stock KiCad 10.0.6 is used instead.
- No installer or prebuilt release: you build it (below). It needs MSYS2 installed.

## Quick start

You need Windows 11, [MSYS2](https://www.msys2.org/) with the `clang` package, [Bun](https://bun.sh/),
Python 3, Git and, for the agents, the `claude` and `codex` CLIs (`npm i -g @anthropic-ai/claude-code @openai/codex`,
then sign in to each). KiCad 10 and FreeCAD are optional.

1. Build the hub and the web client: follow [docs/WINDOWS.md](docs/WINDOWS.md#build-what-was-actually-run).
2. Put `backplane-serve.exe`, the `web` folder and the files in [`windows/`](windows/) in one folder.
3. Run `windows/start-backplane.vbs`. Closing the app window stops Backplane.

Your data goes to `%USERPROFILE%\.backplane`, the hub log to `hub.log` there. An empty `local-only.flag` next to
the scripts turns Tailscale off.

## What this port changes

| Where | Change |
| --- | --- |
| `src/app/effects/win.c` | A Win32 window backend (window thread, GDI blit, input events, clipboard, file drop) |
| `src/server/effects/host.c` | `Proc.wait` / `Proc.exited` without `waitid`; **agents get real pipes through a relay thread** (native Windows programs cannot use an MSYS socketpair as stdin) |
| `src/server/effects/pty.c`, `mailstore.js` | Windows guards and fixes |
| `patches/bend-2.0.36-windows.patch` | Bend for MSYS2: paths, calling convention, arena fault handler, BCrypt randomness |
| `windows/` | Launcher scripts and a helper to raise Bun's stack |

## Bugs found while porting

Useful for anyone building on MSYS2, and for upstream (details in [docs/WINDOWS.md](docs/WINDOWS.md)):

1. Linking `-lws2_32` makes `select()` use Winsock's version, which fails on pipes. The hub died with "the poller failed".
2. Native Windows programs cannot read an MSYS `socketpair` as stdin (`claude.exe`: "stdin is unreadable (EISDIR)").
3. Bend resolves imports with POSIX paths, but `realpath` gives backslashes on Windows.
4. Bend's proof checker needs a larger stack under Bun on Windows.
5. The hub creates an empty folder named `C:` in its working directory at startup.
6. JavaScript twins (`host.js`, `locks.js`, `mailstore.js`) load `libc.so.6`, which only exists on Linux.

## Credits and license

Backplane is by [i2cjak](https://github.com/i2cjak/Backplane) (MIT). The language and compiler,
[Bend](https://github.com/bendlang/bend) (Apache-2.0), is patched here for Windows. This port keeps the MIT license
(see [LICENSE](LICENSE)). It is unofficial and not affiliated with the upstream author; the plan is to offer the
changes upstream.
