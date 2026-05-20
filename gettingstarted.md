# Getting Started with CieloVista Tools

This guide will walk you through the process of setting up and running the `cielovista-tools` VS Code extension for the first time.

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) (which includes npm)
- [Visual Studio Code Insiders](https://code.visualstudio.com/insiders/)

## 1. Get the Code

First, you need to download the source code from the GitHub repository.

Open your terminal and run the following command to clone the repository:

```bash
git clone https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS.git
```

After the download is complete, navigate into the project directory:

```bash
cd CIELOVISTA-TOOLS
```

## 2. Install Dependencies

The project uses several Node.js packages for development. You need to install these dependencies using npm.

In the root directory of the project, run:

```bash
npm install
```

This command reads the `package.json` file and downloads all the necessary packages into the `node_modules` folder.

## 3. Build and Install the Extension

This project includes a script that compiles the TypeScript code, packages the extension, and installs it into VS Code Insiders all in one step.

From the project's root directory, run the following command:

```powershell
npm run rebuild
```

This will create a `.vsix` package and install it.

## 4. Reload VS Code

For the changes to take effect, you need to reload the VS Code Insiders window.

1.  Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac).
2.  Type `Developer: Reload Window` and press Enter.

After reloading, the **CieloVista Tools** extension will be installed and active.
