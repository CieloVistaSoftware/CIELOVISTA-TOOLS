// Copyright (c) Cielo Vista Software. All rights reserved.
// Script to clean up help folders and leave only one canonical folder: HelpForCommands

const fs = require('fs');
const path = require('path');

const featuresDir = path.join(__dirname, '../src/features');
const canonical = 'HelpForCommands';
const tempNames = [
  'HelpForCommands_FINAL',
  'HelpForCommands_NEW',
  'HelpForCommands_TEMP',
  'HelpForCommands_TMPDELETE',
];

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

function moveOrRenameCanonical() {
  // Find which temp folder has the canonical files
  let canonicalSource = null;
  for (const name of tempNames) {
    const folder = path.join(featuresDir, name);
    if (fs.existsSync(folder) && fs.readdirSync(folder).length > 0) {
      canonicalSource = folder;
      break;
    }
  }
  if (!canonicalSource) {
    console.error('No canonical help folder found.');
    process.exit(1);
  }
  const canonicalTarget = path.join(featuresDir, canonical);
  if (fs.existsSync(canonicalTarget)) {
    deleteFolderRecursive(canonicalTarget);
  }
  fs.renameSync(canonicalSource, canonicalTarget);
}

function main() {
  // Remove all temp/legacy help folders except the canonical one
  moveOrRenameCanonical();
  for (const name of tempNames) {
    const folder = path.join(featuresDir, name);
    if (fs.existsSync(folder)) {
      deleteFolderRecursive(folder);
    }
  }
}

main();
