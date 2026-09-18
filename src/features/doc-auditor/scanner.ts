// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: aud

import { collectDocs } from '../../shared/doc-collector';
import type { DocFile } from './types';

/**
 * The docs the Doc Auditor audits under one root: shared/doc-collector's set
 * (the same set Doc Intelligence sees, #802) plus the auditor's own fields.
 */
export function auditDocs(rootPath: string, projectName: string, projectStatus?: string): DocFile[] {
    return collectDocs(rootPath, projectName).map((doc) => ({
        filePath:    doc.filePath,
        fileName:    doc.fileName,
        projectName: doc.projectName,
        projectStatus,
        sizeBytes:   doc.sizeBytes,
        modifiedAt:  new Date(doc.mtimeMs).toISOString(),
        content:     doc.content,
        normalized:  doc.normalized,
    }));
}
