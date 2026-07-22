# Fresh Install Guide for CieloVista Tools

This guide is for setting up the `cielovista-tools` VS Code extension on a new machine or in a clean environment for the first time.

If you are an existing developer with other CieloVista projects on your machine, please use the standard [gettingstarted.md](gettingstarted.md) guide.

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) (which includes npm)
- [Visual Studio Code Insiders](https://code.visualstudio.com/insiders/)
- A `project-registry.json` file at `C:\Users\<you>\Downloads\CieloVistaStandards\project-registry.json` (see step 1a below) — several features (Docs Manager, Daily Audit, Doc Header, Marketplace Compliance, the Home Dashboard's "+ CVT" button) read/write it and will report errors without it. This is a file you create yourself, listing your own projects — not something you clone.

## 1. Create a Project Folder

We recommend creating a dedicated folder for this project. For example:

```powershell
mkdir C:\projects\cielovista-tools
cd C:\projects\cielovista-tools
```

*(**Note:** This path is just a recommendation. You can use any new, empty folder you prefer. If the recommended folder already exists, simply choose a different name or `cd` into it if it's empty.)*

## 1a. Create your own project registry

Several features (Docs Manager, Daily Audit, Doc Header, Marketplace Compliance, the Home Dashboard's "+ CVT" button) read/write a `project-registry.json` file and will show errors if it's missing. This file is **personal to your own machine** — it lists the projects YOU have locally, so don't copy someone else's; create your own.

> ⚠️ **Known limitation, read before continuing:** the extension currently looks for this file at the literal, hardcoded path `C:\Users\jwpmi\Downloads\CieloVistaStandards\project-registry.json` (see `src/shared/registry.ts`'s `REGISTRY_PATH`) — it is **not** computed from your actual Windows username via `os.homedir()`. The path below is therefore written exactly as the code expects it, `jwpmi` and all — it is NOT a placeholder for "your username," it's literally required as-is today. If your Windows username isn't `jwpmi`, you likely can't even create a folder under `C:\Users\jwpmi\` (that account isn't yours), so registry-dependent features simply won't work until this is fixed in code to use `os.homedir()` instead.

```powershell
mkdir C:\Users\jwpmi\Downloads\CieloVistaStandards
```

Create `project-registry.json` inside that folder with at least one entry (your `cielovista-tools` checkout):

```json
{
  "globalDocsPath": "C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards",
  "projects": [
    {
      "name": "cielovista-tools",
      "path": "C:\\projects\\cielovista-tools",
      "type": "extension",
      "description": "This VS Code extension",
      "status": "product"
    }
  ]
}
```

Add more entries as you add more projects (or use the extension's own "Register a folder as a CieloVista product" command once it's installed, in step 4 below).

## 2. Get the Code

Download the source code from the GitHub repository into your new folder. The `.` at the end of the command tells Git to use the current directory.

```bash
git clone https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS.git .
```

## 3. Install Dependencies

The project uses several Node.js packages for development. You need to install these dependencies using npm.

In the root directory of the project, run:

```bash
npm install
```

This command reads the `package.json` file and downloads all the necessary packages into the `node_modules` folder.

## 4. Build and Install

From the project's root directory, run the following command:

```powershell
npm run rebuild
```

This compiles the code, runs the full test/verification suite, packages the extension, and installs it into VS Code Insiders — verified end-to-end on a genuinely fresh clone (no pre-existing `node_modules`, no prior build output).

## 5. Reload VS Code

For the changes to take effect, you need to reload the VS Code Insiders window.

1.  Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac).
2.  Type `Developer: Reload Window` and press Enter.

After reloading, the **CieloVista Tools** extension will be installed and active.
