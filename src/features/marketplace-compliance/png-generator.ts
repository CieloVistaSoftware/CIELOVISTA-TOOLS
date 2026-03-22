// Copyright (c) 2025 CieloVista Software. All rights reserved.
import * as zlib from 'zlib';

function crc32(buf: Buffer): number {
    let crc = 0xFFFFFFFF;
    for (const byte of buf) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) { crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1; }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
    const typeBytes = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function isInStar(x: number, y: number, outerR: number, innerR: number): boolean {
    const dist = Math.sqrt(x * x + y * y);
    if (dist > outerR) { return false; }
    const sector = (2 * Math.PI) / 5;
    let angle = Math.atan2(y, x) + Math.PI / 2;
    angle = ((angle % sector) + sector) % sector;
    const half = sector / 2;
    const t = Math.abs(angle - half) / half;
    return dist <= innerR + (outerR - innerR) * t;
}

export function createBlueStarPng(): Buffer {
    const SIZE = 128;
    const cx = SIZE / 2, cy = SIZE / 2;
    const outerR = SIZE * 0.44, innerR = SIZE * 0.18;
    const rawRows: Buffer[] = [];

    for (let y = 0; y < SIZE; y++) {
        const row = Buffer.alloc(1 + SIZE * 4);
        row[0] = 0;
        for (let x = 0; x < SIZE; x++) {
            const off = 1 + x * 4;
            if (isInStar(x - cx, y - cy, outerR, innerR)) {
                row[off] = 30; row[off + 1] = 120; row[off + 2] = 255; row[off + 3] = 255;
            }
        }
        rawRows.push(row);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rawRows), { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}
