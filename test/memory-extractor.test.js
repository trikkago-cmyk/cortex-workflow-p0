import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAtomicClaims, proposeMemoryCandidates } from '../src/memory-extractor.js';

test('extracts stable preference from comment-like raw material', () => {
  const claims = extractAtomicClaims({
    sourceType: 'comment',
    sourceRef: 'comment-001',
    text: '如果下一步只有收益没有风险，直接执行，不要停下来问我。',
  });

  assert.equal(claims.length, 1);
  assert.equal(claims[0].layer, 'base_memory');
  assert.equal(claims[0].type, 'rule');
});

test('annotates compiler tier metadata on extracted candidates', () => {
  const candidates = proposeMemoryCandidates({
    sourceType: 'comment',
    sourceRef: 'comment-002',
    text: '低风险且明显有益的下一步，默认直接执行。',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].metadata.compiler_version, 'v2');
  assert.equal(candidates[0].metadata.compiled_tier, 'source');
  assert.equal(candidates[0].metadata.target_tier, 'topic');
  assert.equal(candidates[0].metadata.legacy_layer, 'base_memory');
});

test('extracts reusable knowledge from passed checkpoint', () => {
  const candidates = proposeMemoryCandidates({
    sourceType: 'checkpoint',
    sourceRef: 'CP-001',
    status: 'passed',
    summary: 'notion comment -> triage inbox 已跑通，可复用。',
    createdAt: '2026-04-14T10:00:00.000Z',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].layer, 'knowledge');
  assert.equal(candidates[0].type, 'pattern');
  assert.equal(candidates[0].sources[0].sourceRef, 'CP-001');
});

test('extracts cross-module approved decision into knowledge candidate', () => {
  const candidates = proposeMemoryCandidates({
    sourceType: 'decision',
    sourceRef: 'DR-001',
    status: 'approved',
    impactScope: 'cross_module',
    question: '展示标签和检索标签是否分离？',
    recommendation: '分离，避免污染多个下游模块。',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].layer, 'knowledge');
  assert.equal(candidates[0].type, 'rule');
});

test('extracts failed receipt into timeline incident candidate', () => {
  const candidates = proposeMemoryCandidates({
    sourceType: 'receipt',
    sourceRef: 'RCP-001',
    status: 'failed',
    signal: 'red',
    summary: '远端 tunnel 502，导致 poller 拉不到 outbox。',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].layer, 'timeline');
  assert.equal(candidates[0].type, 'incident');
});

test('extracts accepted suggestion into knowledge candidate', () => {
  const candidates = proposeMemoryCandidates({
    sourceType: 'suggestion',
    sourceRef: 'SUG-001',
    status: 'accepted',
    proposedText: '把 review 从长文档汇报改成 Inbox 队列处理',
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].layer, 'knowledge');
  assert.equal(candidates[0].type, 'pattern');
});
