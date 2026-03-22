"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBlueStarPng = createBlueStarPng;
// Copyright (c) 2025 CieloVista Software. All rights reserved.
const zlib = __importStar(require("zlib"));
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (const byte of buf) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) {
            crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}
function isInStar(x, y, outerR, innerR) {
    const dist = Math.sqrt(x * x + y * y);
    if (dist > outerR) {
        return false;
    }
    const sector = (2 * Math.PI) / 5;
    let angle = Math.atan2(y, x) + Math.PI / 2;
    angle = ((angle % sector) + sector) % sector;
    const half = sector / 2;
    const t = Math.abs(angle - half) / half;
    return dist <= innerR + (outerR - innerR) * t;
}
function createBlueStarPng() {
    const SIZE = 128;
    const cx = SIZE / 2, cy = SIZE / 2;
    const outerR = SIZE * 0.44, innerR = SIZE * 0.18;
    const rawRows = [];
    for (let y = 0; y < SIZE; y++) {
        const row = Buffer.alloc(1 + SIZE * 4);
        row[0] = 0;
        for (let x = 0; x < SIZE; x++) {
            const off = 1 + x * 4;
            if (isInStar(x - cx, y - cy, outerR, innerR)) {
                row[off] = 30;
                row[off + 1] = 120;
                row[off + 2] = 255;
                row[off + 3] = 255;
            }
        }
        rawRows.push(row);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rawRows), { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}
//# sourceMappingURL=png-generator.js.map