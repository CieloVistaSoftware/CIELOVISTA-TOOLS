"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProjectDeweyMap = buildProjectDeweyMap;
exports.lookupDewey = lookupDewey;
/**
 * Build a stable map of projectName → Dewey base number.
 * Global docs always get 000.
 * Projects get 100, 200, 300 ... in registry order.
 */
function buildProjectDeweyMap(projectNames) {
    const map = new Map();
    map.set('global', { num: 0, label: 'Global Standards' });
    projectNames.forEach((name, i) => {
        map.set(name, { num: (i + 1) * 100, label: name });
    });
    return map;
}
/**
 * Look up a project's Dewey entry, falling back to 999 if unknown.
 */
function lookupDewey(map, projectName) {
    return map.get(projectName) ?? { num: 999, label: projectName };
}
//# sourceMappingURL=categories.js.map