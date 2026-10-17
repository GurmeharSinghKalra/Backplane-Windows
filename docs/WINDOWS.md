# Backplane on Windows (MSYS2 port)

Status as of 2026-10-17, on top of upstream `i2cjak/Backplane` at `851a915` (Merge PR #149).
This is a **working first pass, not a finished port.** Read "Not done" before relying on it.

## What works (tested)

| Area | Result |
| --- | --- |
| Hub (`src/server/main.bend`) built natively with MSYS2 clang | Builds, starts, serves `/hello` and the web client |
| Web client | Served from `dist/web`; renders in Edge/Chrome; threads, composer, Settings work |
| Claude agent | A real turn through the hub got a reply (`claude` 2.1.301, claude.ai login) |
| Codex agent | A real turn through the hub got a reply (`codex` 0.163.0, ChatGPT login) |
| Single-instance guard (`hub.lock` flock) | A second launch finds the first |
| KiCad / FreeCAD detection | Settings shows the `kicad-cli` and `freecadcmd` paths (KiCad 10.0.6, FreeCAD 1.1.4) |
| Bend checker (`bend PROOF.bend --check-only`) | Runs on Windows; only the expected "defs rely on unsafe or foreign code" list is reported |
| Upstream test suite (`scripts/test.sh`, interpreted by Bun) | 141 of 146 test files pass (see below) |
| Native window (`src/app/main.bend`, first build) | Opens, draws the first-run tour and the sidebar |

## Not done / not tested

- **Native window**: the first build crashed (segfault) after a few seconds: the pixel buffer was never
  resized when the window size changed. Fixed in `src/app/effects/win.c` (buffer follows the window), and that
  build links, but **the fix is not yet tested**. Keyboard, mouse, wheel, clipboard, drag and drop, resize, DPI
  were not exercised in the native window.
- **IME preedit** is not drawn (committed text arrives as `WM_CHAR`), pasted images and drag-hover are stubs.
- **Terminal tab / pty** is not ported (needs ConPTY). Not tested.
- **Phone pairing / Tailscale**: the hub detects Tailscale (`tailscale ip -4`) but this was only tested with
  Tailscale offline. The phone apps were not installed or tested.
- **Backplane KiCad fork** (`i2cjak/Backplane_KiCad`, IPC, sketch router): the release is Linux-only. With stock
  KiCad 10.0.6, Settings shows "KiCad IPC: needs Backplane KiCad". Not built for Windows.
- Grok, Muse and Antigravity agents, voice, the browser/step2glb helpers, file watchers, git worktrees, KiCad
  and FreeCAD flows on real designs: untested.
- No installer; the build needs MSYS2 installed (it links `msys-2.0.dll`). No CI job.
- Performance was not profiled; the hub used for testing was built at `-O0`/`-O1`.

## Tests (interpreted, `TEST_JOBS=2 scripts/test.sh` with a `bend` wrapper around Bun)

141 of 146 pass. The 5 that do not:

- `agy_test`, `cats_face_test`, `claude_cmds_test`: the JavaScript twins `host.js` / `locks.js` call
  `dlopen("libc.so.6")` (Linux only). The native hub uses the C effects instead.
- `mailstore_test`: fixed two real Windows problems (see below); one failure remains, caused by the same
  `libc.so.6` load in the lock twin.
- `diff_test`: git-diff path output differs on Windows (`/dev/null`, `a/` `b/` prefixes). **May be a real bug in
  the diff view; not investigated.**

## What changed

| File | Change |
| --- | --- |
| `src/app/effects/win.c` | New `#elif defined(__MSYS__) \|\| defined(_WIN32)` branch: a Win32 window thread, GDI blit, the five-word event protocol, clipboard, file drop, title, size, IME payload plumbing |
| `src/server/effects/host.c` | `Proc.wait` / `Proc.exited` without `waitid(WNOWAIT)` (exit codes are kept when reaped); **`Proc.spawn` gives the child real pipes and a relay thread to the hub's socket** |
| `src/server/effects/pty.c` | `sys/syscall.h` only on Linux |
| `src/server/effects/mailstore.js` | Windows branch without `openat`; POSIX errno names mapped from Windows numbers |
| `patches/bend-2.0.36-windows.patch` | Bend 2.0.36 compiler/runtime for MSYS2: import paths with `/`, `sysv_abi` calling convention, no `sigaltstack`, vectored exception handler that commits arena pages, BCrypt for random numbers, `Bun.gc` between emit passes |
| `windows/` | Launcher (hidden hub + Edge app window, stops when the window closes) and a helper to raise Bun's stack |

## Bugs found while porting (useful upstream)

1. **`-lws2_32` breaks `select()`**: linking Winsock makes `select` resolve to Winsock's, which rejects pipes and
   returns -1 with `errno == 0`. The hub died at startup with "the poller failed". Do not link `ws2_32`.
2. **Native Windows programs cannot read an MSYS `socketpair` as stdin** (`claude.exe`: "stdin is unreadable
   (EISDIR)"). Hence the pipe relay in `Proc.spawn`. The relay must keep forwarding the child's output after the
   hub half-closes its write side (Codex gets its prompt as an argument and the hub shuts down input).
3. Bend resolves imports with `path.posix.resolve`; on Windows `realpath` returns backslashes.
4. Bend's proof checker overflows the stack under Bun on Windows unless Bun's main-thread stack is raised and
   `BUN_JSC_maxPerThreadStackUsage=536870912` is set (same as `scripts/check.sh` does with `ulimit -s`).
5. The hub creates an empty directory named `C:` in its working directory at startup (some `mkdir -p`
   splits `C:/...` at the first `/`). Harmless, but it litters the working directory.
6. `host.js`, `locks.js`, `mailstore.js` need `libc.so.6` (Linux). `mailstore.js` is fixed here.

## Build (what was actually run)

Prerequisites: Windows 11, MSYS2 with the `clang` package (21.1.8), Bun >= 1.4, Python 3 (`py -3`), Git.
Peak memory measured: hub emit about 7.6 GB, app emit about 8.4 GB, one hub compile about 7 GB (the app compiles in 17 smaller units). Budget 15 GB or more of free disk.

```sh
# 1. Bend 2.0.36 from source, patched
git clone --branch v2.0.36 https://github.com/bendlang/bend.git C:/src/bend
git -C C:/src/bend apply "$PWD/patches/bend-2.0.36-windows.patch"
cp "$(which bun)" bun-big.exe && bun windows/patch-bun-stack.js bun-big.exe 1024   # 1 GB stack reserve
export BEND_NO_TELEMETRY=1 BUN_JSC_maxPerThreadStackUsage=536870912
bend() { ./bun-big.exe --smol C:/src/bend/bend2/main.ts "$@"; }

# 2. web client (as scripts/build.sh does)
bend src/web/index.html -o dist/web
py -3 scripts/js-unmarshal.py ../core/client.Ui dist/web/chunk-*.js
py -3 scripts/js-native.py dist/web/chunk-*.js
cp src/web/sw.js dist/web/sw.js

# 3. hub: emit C (3-5 min), compile (about 17 min at -O1 as one file; -O0 is about 3 min), link
bend src/server/main.bend -o build/server.c
/c/msys64/usr/bin/clang -std=gnu2x -O1 -w -D___wchar_t=__wchar_t build/server.c \
  -o build/backplane-serve.exe -lpthread -lm -lbcrypt        # no -lws2_32 !

# 4. desktop app: emit C (16-19 min), split into units, compile each, link
bend src/app/main.bend -o build/app/all.c
py -3 scripts/cc-split.py build/app/all.c build/app 16
for i in $(seq 0 16); do /c/msys64/usr/bin/clang -std=gnu2x -O1 -w -D___wchar_t=__wchar_t -c build/app/u$i.c -o build/app/u$i.o; done
/c/msys64/usr/bin/clang build/app/u*.o -o build/backplane.exe -lpthread -lm -lgdi32 -luser32 -lshell32 -lbcrypt
```

Run the hub with MSYS2's runtime on `PATH`:

```bat
set "PATH=C:\msys64\usr\bin;%APPDATA%\npm;%PATH%"
backplane-serve.exe -- --home C:/Users/you/.backplane --web dist/web --port 3787
```

`windows/start-backplane.vbs` is the launcher used here (hidden hub, Edge `--app` window, stops with the window).

## Suggestions for upstream

- A Windows (MSYS2) job next to `darwin-arm64` in `release.yml`: emit on Linux, compile on `windows-latest`
  (the same split `scripts/build.sh emit` already does for macOS avoids the Windows emit memory/time).
- A Windows build of `Backplane_KiCad` for IPC.
- Guard the `libc.so.6` twins for Windows, or make them optional.
