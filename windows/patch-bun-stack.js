// Raises the main-thread stack reserve of a copy of bun.exe (the proof checker recurses deeply).
// usage: bun windows/patch-bun-stack.js <copy-of-bun.exe> <megabytes>   (the build used 1024)
const fs = require('fs');
const [f, mb] = [process.argv[2], Number(process.argv[3])];
const b = fs.readFileSync(f);
const opt = b.readUInt32LE(0x3c) + 24;
if (b.readUInt16LE(opt) !== 0x20b) throw new Error('not PE32+');
b.writeBigUInt64LE(BigInt(mb) * 1048576n, opt + 72);
fs.writeFileSync(f, b);
