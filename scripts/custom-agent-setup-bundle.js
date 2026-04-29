import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildCustomAgentSetupBundle,
  normalizePublicMcpUrl,
} from '../src/custom-agent-setup-bundle.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2).replaceAll('-', '_');
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

function compact(value) {
  return String(value ?? '').trim();
}

function parseList(value) {
  return compact(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readJson(response) {
  const body = await response.text();
  return body ? JSON.parse(body) : {};
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await readJson(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status} ${url}`);
  }
  return payload;
}

function renderMarkdown(bundle) {
  const lines = [];

  lines.push('# Custom Agent 接入包');
  lines.push('');
  lines.push(`- 项目：\`${bundle.project_id}\``);
  lines.push(`- 状态：\`${bundle.status}\``);
  lines.push(`- 公网 MCP URL：${bundle.public_mcp_url ? `\`${bundle.public_mcp_url}\`` : '`未配置`'}`);
  lines.push(`- 本地 MCP 健康：\`${bundle.local_mcp.ok ? 'ok' : 'fail'}\``);
  lines.push(`- Cortex 上下文：\`${bundle.cortex_context.ok ? 'ok' : 'fail'}\``);
  lines.push(`- 鉴权：\`${bundle.auth.required ? 'Bearer required' : 'none'}\``);
  if (bundle.auth.token_preview) {
    lines.push(`- Token 预览：\`${bundle.auth.token_preview}\``);
  }
  lines.push('');
  lines.push('## Notion 里要填的内容');
  lines.push('');
  lines.push(`- Agent 名称：\`${bundle.notion_agent.agent_name}\``);
  lines.push(`- MCP 连接显示名：\`${bundle.notion_agent.display_name}\``);
  lines.push(`- MCP URL：${bundle.public_mcp_url ? `\`${bundle.public_mcp_url}\`` : '`未配置，当前不能接入`'}`);
  if (bundle.auth.required) {
    lines.push(`- Header：\`${bundle.auth.header_name}: ${bundle.auth.header_value_template}\``);
  }
  lines.push(`- Triggers：${bundle.notion_agent.triggers.map((item) => `\`${item}\``).join('、')}`);
  lines.push(`- Tools：${bundle.notion_agent.tools.map((item) => `\`${item}\``).join('、')}`);
  lines.push('');
  lines.push('## Admin 前置条件');
  lines.push('');
  for (const item of bundle.admin_prereqs) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## 下一步');
  lines.push('');
  for (const item of bundle.next_actions) {
    lines.push(`1. ${item}`);
  }

  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = compact(args.base_url || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100');
const mcpBaseUrl = compact(args.mcp_base_url || process.env.CORTEX_MCP_BASE_URL || 'http://127.0.0.1:19101');
const projectId = compact(args.project || process.env.PROJECT_ID || 'PRJ-cortex');
const publicMcpUrl = normalizePublicMcpUrl(
  args.public_mcp_url || process.env.CORTEX_MCP_PUBLIC_URL || '',
);
const bearerToken = compact(process.env.CORTEX_MCP_BEARER_TOKEN || '');
const allowedHosts = parseList(process.env.CORTEX_MCP_ALLOWED_HOSTS || '');

const localMcpHealth = await requestJson(`${mcpBaseUrl}/health`, {
  headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
});
const cortexContext = await requestJson(
  `${baseUrl}/notion/custom-agent/context?project_id=${encodeURIComponent(projectId)}`,
);

const bundle = buildCustomAgentSetupBundle({
  projectId,
  project: cortexContext.project || {},
  localMcpHealth,
  cortexContext,
  publicMcpUrl,
  bearerToken,
  allowedHosts,
});

const markdown = renderMarkdown(bundle);
const outputPath = resolve(
  process.cwd(),
  'tmp',
  'custom-agent-setup-bundle.md',
);
writeFileSync(outputPath, `${markdown}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      ...bundle,
      markdown_path: outputPath,
    },
    null,
    2,
  ),
);
