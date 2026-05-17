// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
import * as fs from 'fs';
import * as path from 'path';

export interface DiskCleanupAnswerSection {
    section: string;
    fileName: string;
    filePath: string;
    count: number;
}

export interface DiskCleanupAnswerManifest {
    status: 'ok' | 'error' | 'not-ready';
    generatedAt: string;
    sourceUpdatedAt?: string;
    totalSections: number;
    totalItems: number;
    manifestPath: string;
    sections: DiskCleanupAnswerSection[];
    error?: string;
}

interface NormalizedSection {
    section: string;
    items: unknown[];
}

let _scanCacheProvider: (() => unknown) | undefined;
let _serviceTimer: NodeJS.Timeout | undefined;
let _serviceRunning = false;

function resolveProgramDataRoot(): string {
    const envValue = process.env.DISKCLEANUP_PROGRAMDATA || process.env.PROGRAMDATA || process.env.ProgramData;
    if (envValue && envValue.trim()) { return envValue.trim(); }
    return process.platform === 'win32' ? 'C:\\ProgramData' : '/ProgramData';
}

function answersDir(): string {
    return path.join(resolveProgramDataRoot(), 'DiskCleanUp', 'answers');
}

function manifestPath(): string {
    return path.join(answersDir(), 'manifest.json');
}

function scanCachePath(): string {
    return path.join(resolveProgramDataRoot(), 'DiskCleanUp', 'scan-cache.json');
}

function ensureDirExists(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function atomicWriteJson(filePath: string, body: unknown): void {
    ensureDirExists(path.dirname(filePath));
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(body, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
}

function toSectionSlug(section: string): string {
    const slug = section
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'unknown';
}

function normalizeScanCache(raw: unknown): { sourceUpdatedAt?: string; sections: NormalizedSection[] } {
    const source = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
    const updatedAt = typeof source.updatedAt === 'string'
        ? source.updatedAt
        : typeof source.lastRun === 'string'
            ? source.lastRun
            : undefined;

    const sectionArray = source.sections;
    if (Array.isArray(sectionArray)) {
        const sections = sectionArray
            .map((entry): NormalizedSection | null => {
                if (!entry || typeof entry !== 'object') { return null; }
                const row = entry as Record<string, unknown>;
                const section = typeof row.section === 'string'
                    ? row.section
                    : typeof row.name === 'string'
                        ? row.name
                        : '';
                if (!section.trim()) { return null; }
                const items = Array.isArray(row.items) ? row.items : [];
                return { section, items };
            })
            .filter((v): v is NormalizedSection => v !== null);
        return { sourceUpdatedAt: updatedAt, sections };
    }

    const items = Array.isArray(source.items) ? source.items : [];
    if (items.length > 0) {
        const grouped = new Map<string, unknown[]>();
        for (const item of items) {
            if (!item || typeof item !== 'object') { continue; }
            const row = item as Record<string, unknown>;
            const section = typeof row.section === 'string' ? row.section : typeof row.category === 'string' ? row.category : '';
            if (!section.trim()) { continue; }
            const bucket = grouped.get(section) || [];
            bucket.push(item);
            grouped.set(section, bucket);
        }
        const sections = Array.from(grouped.entries()).map(([section, sectionItems]) => ({ section, items: sectionItems }));
        return { sourceUpdatedAt: updatedAt, sections };
    }

    return { sourceUpdatedAt: updatedAt, sections: [] };
}

function loadScanCache(): unknown {
    if (_scanCacheProvider) {
        return _scanCacheProvider();
    }
    const cacheFile = scanCachePath();
    if (!fs.existsSync(cacheFile)) {
        return { sections: [], updatedAt: new Date().toISOString() };
    }
    const text = fs.readFileSync(cacheFile, 'utf8');
    return JSON.parse(text);
}

export function setDiskCleanupScanCacheProvider(provider: (() => unknown) | undefined): void {
    _scanCacheProvider = provider;
}

export function buildNotReadyManifest(): DiskCleanupAnswerManifest {
    return {
        status: 'not-ready',
        generatedAt: new Date().toISOString(),
        totalSections: 0,
        totalItems: 0,
        manifestPath: manifestPath(),
        sections: [],
    };
}

export function readDiskCleanupAnswerManifest(): DiskCleanupAnswerManifest {
    const file = manifestPath();
    if (!fs.existsSync(file)) {
        return buildNotReadyManifest();
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as DiskCleanupAnswerManifest;
        return {
            ...parsed,
            manifestPath: file,
        };
    } catch (error: unknown) {
        return {
            status: 'error',
            generatedAt: new Date().toISOString(),
            totalSections: 0,
            totalItems: 0,
            manifestPath: file,
            sections: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export function refreshDiskCleanupAnswerArtifacts(scanCache?: unknown): DiskCleanupAnswerManifest {
    const source = scanCache ?? loadScanCache();
    const normalized = normalizeScanCache(source);
    const dir = answersDir();
    ensureDirExists(dir);

    const sections: DiskCleanupAnswerSection[] = [];
    let totalItems = 0;
    for (const section of normalized.sections) {
        const slug = toSectionSlug(section.section);
        const fileName = `${slug}.answer.json`;
        const filePath = path.join(dir, fileName);
        const payload = {
            section: section.section,
            count: section.items.length,
            generatedAt: new Date().toISOString(),
            items: section.items,
        };
        atomicWriteJson(filePath, payload);
        sections.push({
            section: section.section,
            fileName,
            filePath,
            count: section.items.length,
        });
        totalItems += section.items.length;
    }

    const manifest: DiskCleanupAnswerManifest = {
        status: 'ok',
        generatedAt: new Date().toISOString(),
        sourceUpdatedAt: normalized.sourceUpdatedAt,
        totalSections: sections.length,
        totalItems,
        manifestPath: manifestPath(),
        sections: sections.sort((a, b) => a.section.localeCompare(b.section)),
    };
    atomicWriteJson(manifest.manifestPath, manifest);
    return manifest;
}

export function startDiskCleanupAnswerArtifactService(intervalMs = 15000): void {
    if (_serviceRunning) { return; }
    _serviceRunning = true;
    const tick = (): void => {
        if (!_serviceRunning) { return; }
        try { refreshDiskCleanupAnswerArtifacts(); } catch { /* keep service alive */ }
        _serviceTimer = setTimeout(tick, Math.max(1000, intervalMs));
    };
    tick();
}

export function stopDiskCleanupAnswerArtifactService(): void {
    _serviceRunning = false;
    if (_serviceTimer) {
        clearTimeout(_serviceTimer);
        _serviceTimer = undefined;
    }
}

export const _test = {
    answersDir,
    manifestPath,
    scanCachePath,
    normalizeScanCache,
    toSectionSlug,
    atomicWriteJson,
};
