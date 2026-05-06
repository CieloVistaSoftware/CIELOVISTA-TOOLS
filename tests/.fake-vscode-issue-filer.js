module.exports = {
        authentication: { getSession: async () => undefined },
        window: { showInformationMessage: async () => undefined, showErrorMessage: async () => undefined },
        env: { openExternal: async () => true },
        Uri: { parse: s => ({ toString: () => s }) }
    };