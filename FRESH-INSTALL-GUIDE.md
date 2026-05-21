# Fresh Install Guide for CieloVista Tools

This guide is for setting up the `cielovista-tools` VS Code extension on a new machine or in a clean environment for the first time.

If you are an existing developer with other CieloVista projects on your machine, please use the standard [gettingstarted.md](gettingstarted.md) guide.

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) (which includes npm)
- [Visual Studio Code Insiders](https://code.visualstudio.com/insiders/)

## 1. Create a Project Folder

We recommend creating a dedicated folder for this project. For example:

```powershell
mkdir C:\projects\cielovista-tools
cd C:\projects\cielovista-tools
```

*(**Note:** This path is just a recommendation. You can use any new, empty folder you prefer. If the recommended folder already exists, simply choose a different name or `cd` into it if it's empty.)*

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

## 4. Build and Install (Fresh Install Mode)

This is the key step. Instead of the standard `rebuild` command, you will use the `fresh-install` command. This special script bypasses environmental checks that would fail on a new machine.

From the project's root directory, run the following command:

```powershell
npm run fresh-install
```

This will compile the code, package the extension, and install it into VS Code Insiders.

## 5. Reload VS Code

For the changes to take effect, you need to reload the VS Code Insiders window.

1.  Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac).
2.  Type `Developer: Reload Window` and press Enter.

After reloading, the **CieloVista Tools** extension will be installed and active.
