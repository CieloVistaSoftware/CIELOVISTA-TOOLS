# CieloVista MCP Server

This document outlines the usage of the CieloVista Model Context Protocol (MCP) server for AI agents.

## Purpose

The MCP server acts as a bridge between the AI agent and the local file system. It provides a controlled environment for the AI to access and manipulate files within registered project directories.

## Multi-Project Access

The server is configured to recognize and work with multiple distinct projects. The list of currently registered projects can be retrieved by querying the server's project endpoint.

**Key Point:** When interacting with files, AI agents **must** use absolute file paths. This ensures that file operations are directed to the correct project and location, as the server manages several disparate project roots. Relative paths will not resolve correctly and should be avoided.

## Available Tools

The server exposes a set of tools for file system interaction, including but not limited to:

*   `list_files`
*   `read_file`
*   `write_file`
*   `create_directory`
*   `delete_file`

Always refer to the tool's specific documentation for correct usage and parameters.
