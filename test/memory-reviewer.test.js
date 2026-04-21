import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewMemoryCandidate } from '../src/memory-reviewer.js';

test('reviewer-agent recommends accept for well-supported stable collaboration memory', () => {
  const assessment = reviewMemoryCandidate({
    memory: {
      memoryId: 'MEM-001',
      layer: 'base_memory',
      type: 'rule',
      title: '低风险事项默认直接推进',
      summary: '低风险且明显有益的下一步，默认直接执行，不等许可。',
      status: 'candidate',
      reviewState: 'pending_accept',
      confidence: 'high',
      metadata: {
        extractor_reason: 'comment_like_stable_preference',
      },
    },
    sources: [
      {
        sourceType: 'comment',
        sourceRef: 'comment-001',
        quoteText: '低风险且明显有益的下一步，默认直接执行，不等许可。',
        summary: '显式协作规则',
        evidence: {
          discussion_id: 'discussion-001',
        },
      },
    ],
    reviewerAgent: 'reviewer-agent',
    reviewedAt: '2026-04-16T12:00:00.000Z',
  });

  assert.equal(assessment.recommendation, 'recommend_accept');
  assert.equal(assessment.suggested_final_review_state, 'accepted');
  assert.equal(assessment.suggested_status, 'durable');
  assert.equal(assessment.checks.extractor_reason, 'comment_like_stable_preference');
});

test('reviewer-agent recommends followup when evidence is missing', () => {
  const assessment = reviewMemoryCandidate({
    memory: {
      memoryId: 'MEM-002',
      layer: 'knowledge',
      type: 'pattern',
      title: '某个模式',
      summary: '这里像是一个模式，但证据还不够。',
      status: 'candidate',
      reviewState: 'pending_accept',
      confidence: 'medium',
      metadata: {},
    },
    sources: [
      {
        sourceType: 'comment',
        sourceRef: 'comment-002',
      },
    ],
  });

  assert.equal(assessment.recommendation, 'needs_followup');
  assert.match(assessment.human_prompt, /补证据/);
  assert.ok(assessment.missing_signals.includes('缺少可引用 evidence'));
});
