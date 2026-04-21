import { resolve } from 'node:path';
import { defaultAgentRegistryFile } from '../src/agent-registry.js';
import { onboardExternalAgent } from '../src/agent-onboarding.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd());

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || String(next).startsWith('--')) {
      parsed[key] = '1';
      continue;
    }

    parsed[key] = String(next);
    index += 1;
  }

  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const agentName = String(args.agent || args.name || '').trim();
const aliasCsv = String(args.alias || args.aliases || '').trim();
const aliases = aliasCsv
  ? aliasCsv
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  : [];
const webhookUrl = String(args.webhook || args.url || '').trim();
const webhookToken = String(args.token || '').trim();

if (!agentName) {
  console.error('Missing required --agent');
  process.exit(1);
}

if (!webhookUrl) {
  console.error('Missing required --webhook');
  process.exit(1);
}

const result = onboardExternalAgent({
  agentRegistryFile: process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(cwd),
  notionRoutingFile: process.env.NOTION_ROUTING_RULES_PATH || resolve(cwd, 'docs', 'notion-routing.json'),
  executorRoutingFile: process.env.EXECUTOR_ROUTING_FILE || resolve(cwd, 'docs', 'executor-routing.json'),
  agentName,
  aliases,
  webhookUrl,
  webhookToken,
  projectId: String(args.project || process.env.PROJECT_ID || 'PRJ-cortex').trim(),
  ownerAgent: String(args.owner || '').trim() || null,
  source: String(args.source || 'notion_comment').trim(),
  mode: String(args.mode || 'webhook').trim(),
  pollIntervalMs: Number(args['poll-ms'] || args.poll_ms || 1000),
});

console.log(JSON.stringify({ ok: true, ...result }, null, 2));
