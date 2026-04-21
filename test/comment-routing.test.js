import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCommentRouting, extractMentionRouting, resolveCommentOwnerAgent } from '../src/comment-routing.js';

test('extractCommentRouting strips routing prefix from comment body', () => {
  const routing = extractCommentRouting('[agent: agent-pm] [continue] 继续推进');
  assert.equal(routing.ownerAgent, 'agent-pm');
  assert.equal(routing.strippedBody, '[continue] 继续推进');
});

test('resolveCommentOwnerAgent uses prefix over block and page rules', () => {
  const routing = resolveCommentOwnerAgent({
    body: '[to: agent-architect] 请继续',
    pageId: 'page-001',
    anchorBlockId: 'block-001',
    rules: {
      pages: { 'page-001': 'agent-writer' },
      blocks: { 'block-001': 'agent-dev' },
      defaults: { notion_comment: 'agent-router' },
    },
  });

  assert.equal(routing.ownerAgent, 'agent-architect');
  assert.equal(routing.source, 'comment_prefix');
  assert.equal(routing.strippedBody, '请继续');
});

test('resolveCommentOwnerAgent falls back from block to page to default', () => {
  const byBlock = resolveCommentOwnerAgent({
    body: '继续',
    pageId: 'page-001',
    anchorBlockId: 'block-001',
    rules: {
      pages: { 'page-001': 'agent-writer' },
      blocks: { 'block-001': 'agent-dev' },
      defaults: { notion_comment: 'agent-router' },
    },
  });
  assert.equal(byBlock.ownerAgent, 'agent-dev');
  assert.equal(byBlock.source, 'block_rule');

  const byPage = resolveCommentOwnerAgent({
    body: '继续',
    pageId: 'page-001',
    anchorBlockId: 'missing-block',
    rules: {
      pages: { 'page-001': 'agent-writer' },
      blocks: {},
      defaults: { notion_comment: 'agent-router' },
    },
  });
  assert.equal(byPage.ownerAgent, 'agent-writer');
  assert.equal(byPage.source, 'page_rule');

  const byDefault = resolveCommentOwnerAgent({
    body: '继续',
    pageId: 'unknown-page',
    anchorBlockId: 'unknown-block',
    rules: {
      pages: {},
      blocks: {},
      defaults: { notion_comment: 'agent-router' },
    },
  });
  assert.equal(byDefault.ownerAgent, 'agent-router');
  assert.equal(byDefault.source, 'default_rule');
});

test('extractMentionRouting resolves aliases and strips @mention', () => {
  const routing = extractMentionRouting('@codex [continue] 继续推进', {
    aliases: {
      codex: 'agent-router',
    },
  });

  assert.equal(routing.ownerAgent, 'agent-router');
  assert.equal(routing.mention, 'codex');
  assert.equal(routing.strippedBody, '[continue] 继续推进');
});

test('extractMentionRouting tolerates whitespace after @ and resolves cortex alias', () => {
  const routing = extractMentionRouting('@ cortex 是否能正常回流执行？', {
    aliases: {
      cortex: 'agent-router',
    },
  });

  assert.equal(routing.ownerAgent, 'agent-router');
  assert.equal(routing.mention, 'cortex');
  assert.equal(routing.strippedBody, '是否能正常回流执行？');
});

test('extractMentionRouting resolves evaluator alias', () => {
  const routing = extractMentionRouting('@evaluator 请记录验收 checkpoint', {
    aliases: {
      evaluator: 'agent-evaluator',
    },
  });

  assert.equal(routing.ownerAgent, 'agent-evaluator');
  assert.equal(routing.mention, 'evaluator');
  assert.equal(routing.strippedBody, '请记录验收 checkpoint');
});

test('extractMentionRouting resolves Chinese alias and strips @mention', () => {
  const routing = extractMentionRouting('@胖虎 帮我继续推进这个任务', {
    aliases: {
      胖虎: 'agent-panghu',
    },
  });

  assert.equal(routing.ownerAgent, 'agent-panghu');
  assert.equal(routing.mention, '胖虎');
  assert.equal(routing.strippedBody, '帮我继续推进这个任务');
});

test('resolveCommentOwnerAgent prefers @mention over page routing', () => {
  const routing = resolveCommentOwnerAgent({
    body: '继续执行吧 @codex',
    pageId: 'page-001',
    anchorBlockId: 'missing-block',
    rules: {
      aliases: {
        codex: 'agent-router',
      },
      pages: { 'page-001': 'agent-writer' },
      blocks: {},
      defaults: { notion_comment: 'agent-router' },
    },
  });

  assert.equal(routing.ownerAgent, 'agent-router');
  assert.equal(routing.source, 'comment_mention');
  assert.equal(routing.strippedBody, '继续执行吧');
});

test('extractCommentRouting keeps explicit prefix higher than mention alias', () => {
  const routing = extractCommentRouting('[agent: agent-pm] @codex 请继续', {
    aliases: {
      codex: 'agent-notion-worker',
    },
  });

  assert.equal(routing.ownerAgent, 'agent-pm');
  assert.equal(routing.source, 'comment_prefix');
  assert.equal(routing.strippedBody, '@codex 请继续');
});
