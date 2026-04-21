import { parseNotionSourceUrl, replyToDiscussion } from '../src/notion-agent-sync.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd());

const [commandId, ...textParts] = process.argv.slice(2);
const text = textParts.join(' ').trim();
const apiKey = process.env.NOTION_API_KEY;
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;
const shouldMarkDone = process.env.MARK_DONE !== '0';

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

if (!commandId || !text) {
  console.error('Usage: node scripts/notion-reply.js <command_id> <reply text>');
  process.exit(1);
}

const commandResponse = await fetch(
  `${cortexBaseUrl}/commands?command_id=${encodeURIComponent(commandId)}&limit=1`,
);
const commandPayload = await commandResponse.json();

if (!commandResponse.ok || commandPayload.ok === false) {
  console.error(JSON.stringify(commandPayload, null, 2));
  process.exit(1);
}

const command = commandPayload.commands?.[0];
if (!command) {
  console.error(`Command not found: ${commandId}`);
  process.exit(1);
}

if (command.source !== 'notion_comment') {
  console.error(`Command ${commandId} is not a notion_comment command`);
  process.exit(1);
}

const source = parseNotionSourceUrl(command.source_url);
if (!source) {
  console.error(`Command ${commandId} has no parseable Notion source URL`);
  process.exit(1);
}

const reply = await replyToDiscussion({
  apiKey,
  discussionId: source.discussionId,
  text,
  baseUrl: notionBaseUrl,
  notionVersion,
});

if (shouldMarkDone) {
  const updateResponse = await fetch(`${cortexBaseUrl}/commands/update-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command_id: commandId,
      status: 'done',
      result_summary: text,
    }),
  });

  const updatePayload = await updateResponse.json();
  if (!updateResponse.ok || updatePayload.ok === false) {
    console.error(JSON.stringify(updatePayload, null, 2));
    process.exit(1);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      commandId,
      discussionId: source.discussionId,
      replyId: reply.id,
      markedDone: shouldMarkDone,
    },
    null,
    2,
  ),
);
