// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import type { CmdEntry } from './types';

/**
 * tooltip-builder.ts
 *
 * Generates structured runTooltip content for command catalog entries.
 * Follows the pattern: What / When / Where / How / Why
 *
 * For entries without a custom runTooltip, this builder creates sensible defaults
 * based on the command's metadata (description, scope, group, action, etc).
 */

interface TooltipContext {
    cmd: CmdEntry;
    group: string;
}

export function buildRunTooltip(ctx: TooltipContext): string {
    const { cmd, group } = ctx;

    // Priority 1: Use custom runTooltip if provided
    if (cmd.runTooltip) {
        return cmd.runTooltip;
    }

    // Priority 2: Build from command metadata
    return buildStructuredTooltip(cmd, group);
}

function buildStructuredTooltip(cmd: CmdEntry, group: string): string {
    const what = cmd.description;
    const when = buildWhenContext(cmd, group);
    const where = buildScopeDescription(cmd.scope);
    const how = buildInvocationMethod(cmd);
    const why = buildWhyContext(cmd, group);

    const parts = [
        `WHAT: ${what}`,
        '',
        `WHEN: ${when}`,
        '',
        `WHERE: ${where}`,
        '',
        `HOW: ${how}`,
        '',
        `WHY: ${why}`,
        '',
        `📍 Dewey: ${cmd.dewey} | Group: ${group}`
    ];

    return parts.join('\n');
}

function buildWhenContext(cmd: CmdEntry, group: string): string {
    const whenMap: Record<string, string> = {
        'Doc Catalog': 'Use when you need to browse, find, or manage documentation across projects.',
        'Docs Manager': 'Use when managing project documentation, creating new docs, or searching for content.',
        'Doc Audit': 'Use when you need to audit, find duplicates, scan for issues, or consolidate docs.',
        'Tests': 'Use when analyzing test coverage, auditing code quality, or reviewing test results.',
        'Consolidator': 'Use when you want to find and consolidate duplicate or similar content.',
        'README Tools': 'Use when checking README compliance or auto-fixing missing sections.',
        'Marketplace': 'Use when preparing projects for marketplace publication.',
        'Project Launcher': 'Use when you need to build, start, or manage external projects.',
        'Copilot Tools': 'Use when configuring Copilot, managing rules, or integrating with Copilot Chat.',
        'Terminal Tools': 'Use when working with terminal operations, managing folders, or copying output.',
        'Other Tools': 'Use for utility features like image viewing, file listing, and extension management.'
    };

    return whenMap[group] || 'Use when you need to run a utility command.';
}

function buildScopeDescription(scope: string): string {
    const scopeMap: Record<string, string> = {
        'global': 'Global - Works from any VS Code workspace; reads from the CieloVista registry.',
        'workspace': 'Workspace - Operates on the currently open VS Code workspace.',
        'diskcleanup': 'DiskCleanUp - Operates only on the DiskCleanUp project.',
        'tools': 'Tools - Operates only on the cielovista-tools project (internal self-audit).'
    };

    return scopeMap[scope] || 'Global workspace';
}

function buildInvocationMethod(cmd: CmdEntry): string {
    const actionText = cmd.action === 'read' ? 'Open' : 'Run';
    return `Press Ctrl+Shift+P and search for "${cmd.title}". Then click ${actionText} or press Enter.`;
}

function buildWhyContext(cmd: CmdEntry, group: string): string {
    const whyMap: Record<string, string> = {
        'Doc Catalog': 'Organize and discover all documentation in the CieloVista ecosystem.',
        'Docs Manager': 'Maintain consistency and discoverability across all project documentation.',
        'Doc Audit': 'Ensure documentation quality, remove duplicates, and identify orphaned content.',
        'Tests': 'Monitor code quality, maintain high test coverage, and identify untested features.',
        'Consolidator': 'Prevent duplication of effort and maintain the One-Time-One-Place principle.',
        'README Tools': 'Ensure all projects meet the CieloVista documentation standard.',
        'Marketplace': 'Prepare projects for release and public distribution.',
        'Project Launcher': 'Quickly access and manage external project workflows.',
        'Copilot Tools': 'Configure AI assistance and integrate with your coding workflow.',
        'Terminal Tools': 'Streamline terminal operations and clipboard management.',
        'Other Tools': 'Provide utility features for browsing, viewing, and extension management.'
    };

    return whyMap[group] || 'Provide a helpful utility feature.';
}
