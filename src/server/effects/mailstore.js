// Twins of the low-level file operations; no journal parsing or policy here.
// the POSIX errno of an error (Windows reports its own numbers, e.g. -4058)
function mailerr(e) {
  const n = e.code ? require('os').constants.errno[e.code] : undefined;
  return n ?? Math.abs(e.errno ?? 5);
}
function mailfile_open(path, write) {
  const fs = require('fs'), C = fs.constants;
  let dir = -1, fd = -1, code = 0;
  try {
    if (path.includes('\0')) return io_fail(22);
    const at = path.lastIndexOf('/');
    if (at < 1 || at === path.length - 1) return io_fail(22);
    dir = fs.openSync(path.slice(0, at), C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
    if (process.platform === 'win32') {
      // Windows has no openat: the file is opened by its path (the
      // directory descriptor above only checked that the directory is real)
      fd = fs.openSync(path, write !== 0 ? C.O_RDWR | C.O_CREAT : C.O_RDONLY, 0o600);
    } else {
      // openat binds the final component to the checked directory descriptor.
      const ffi = require('bun:ffi');
      const lib = ffi.dlopen(process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6', {
        openat: { args: ['i32', 'ptr', 'i32', 'i32'], returns: 'i32' }
      });
      const name = Buffer.from(path.slice(at + 1) + '\0');
      fd = lib.symbols.openat(dir, ffi.ptr(name), (write !== 0 ? C.O_RDWR | C.O_CREAT : C.O_RDONLY) | C.O_NOFOLLOW | C.O_NONBLOCK, 0o600);
      if (fd < 0) code = io_sys().errno();
      lib.close();
    }
    if (!code) { const st = fs.fstatSync(fd); if (!st.isFile() || (write !== 0 && st.nlink !== 1)) code = 22; }
  } catch (e) { code = mailerr(e); }
  if (dir >= 0) { try { fs.closeSync(dir); } catch (e) { code ||= mailerr(e); } }
  if (code) { if (fd >= 0) try { fs.closeSync(fd); } catch {} return io_fail(code); }
  return io_done(fd);
}
function mailfile_finish(file, cut, line) {
  const fs = require('fs'); let code = 0;
  try {
    fs.ftruncateSync(file, cut);
    const data = Buffer.from(line, 'utf8');
    let at = 0;
    while (at < data.length) {
      let n;
      try { n = fs.writeSync(file, data, at, data.length - at, cut + at); }
      catch (e) { if (e.code === 'EINTR') continue; throw e; }
      if (!n) { code = 5; break; }
      at += n;
    }
  } catch (e) { code = mailerr(e); }
  try { fs.closeSync(file); } catch (e) { code ||= mailerr(e); }
  return code ? io_fail(code) : io_done({ $: CID(Unit) });
}
io_eff(CID(MailFile.open), mailfile_open);
io_eff(CID(MailFile.finish), mailfile_finish);
