"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.licenseContent = licenseContent;
exports.changelogContent = changelogContent;
// Copyright (c) 2025 CieloVista Software. All rights reserved.
const CURRENT_YEAR = new Date().getFullYear();
function licenseContent(projectName) {
    return `PROPRIETARY SOFTWARE LICENSE\n\nCopyright (c) ${CURRENT_YEAR} CieloVista Software. All rights reserved.\n\nThis software and its source code are the exclusive property of CieloVista Software.\nNo part of this software may be copied, modified, distributed, sublicensed, sold,\nor otherwise transferred without the prior written permission of CieloVista Software.\n\nTHIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.\n\nFor licensing inquiries contact: licensing@cielovistasoftware.com\n\nProject: ${projectName}\n`;
}
function changelogContent(projectName, version) {
    const today = new Date().toISOString().slice(0, 10);
    return `# Changelog — ${projectName}\n\nAll notable changes to this project are documented here.\n\n## [${version}] — ${today}\n\n### Added\n- Initial release\n\n### Changed\n- N/A\n\n### Fixed\n- N/A\n\n---\n*Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)*\n`;
}
//# sourceMappingURL=file-generators.js.map