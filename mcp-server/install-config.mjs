/**
 * install-config.mjs — registers CVT MCP server in Claude Desktop config
 * Run once: node install-config.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

const CONFIG = 'C:/Users/jwpmi/AppData/Roaming/Claude/claude_desktop_config.json';

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));

config.mcpServers = config.mcpServers || {};

config.mcpServers['cielovista-tools'] = {
  command: 'node',
  args: ['C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\mcp-server\\dist\\index.js']
};

writeFileSync(CONFIG, JSON.stringify(config, null, 2), 'utf8');

console.log('Done — CVT registered in Claude Desktop config.');
console.log('\nAll registered MCP servers:');
Object.entries(config.mcpServers).forEach(([name, cfg]) => {
  console.log(`  ${name}: ${cfg.args?.[0] || cfg.command}`);
});
console.log('\nRestart Claude Desktop to activate.');
