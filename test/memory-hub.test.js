import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemoryHubDocuments } from '../src/memory-hub.js';

test('buildMemoryHubDocuments renders global layered memory hub with pending candidates', () => {
  const documents = buildMemoryHubDocuments({
    durableBaseMemories: [
      {
        memoryId: 'MEM-001',
        projectId: 'PRJ-cortex',
        layer: 'base_memory',
        type: 'rule',
        title: '低风险直接推进',
        summary: '低风险且明显有益的下一步，默认直接执行。',
        status: 'durable',
        reviewState: 'accepted',
        confidence: 'high',
        freshness: '2026-04-16',
        nextStep: '',
        relatedMemory: [],
        updatedAt: '2026-04-16T10:00:00.000Z',
      },
    ],
    durableKnowledgeMemories: [
      {
        memoryId: 'MEM-002',
        projectId: 'PRJ-cortex',
        layer: 'knowledge',
        type: 'pattern',
        title: '评论扫描闭环',
        summary: 'notion comment -> inbox -> executor 已跑通，可复用。',
        status: 'durable',
        reviewState: 'accepted',
        confidence: 'high',
        freshness: '2026-04-16',
        nextStep: '',
        relatedMemory: [],
        updatedAt: '2026-04-16T11:00:00.000Z',
      },
    ],
    durableTimelineMemories: [
      {
        memoryId: 'MEM-003',
        projectId: 'PRJ-dark-luxury-itinerary',
        layer: 'timeline',
        type: 'incident',
        title: 'Dark Luxury 接入完成',
        summary: 'dark luxury itinerary agent 已进入 Cortex 项目空间。',
        status: 'durable',
        reviewState: 'accepted',
        confidence: 'medium',
        freshness: '2026-04-16',
        nextStep: '',
        relatedMemory: [],
        updatedAt: '2026-04-16T12:00:00.000Z',
      },
    ],
    candidateMemories: [
      {
        memoryId: 'MEM-004',
        projectId: 'PRJ-cortex',
        layer: 'knowledge',
        type: 'pattern',
        title: 'Memory hub 总领页',
        summary: 'memory 需要总领页 + 子文档，而不是按项目各写一份。',
        status: 'candidate',
        reviewState: 'pending_accept',
        confidence: 'medium',
        freshness: '2026-04-16',
        nextStep: '等待 accept 后进入 durable knowledge',
        relatedMemory: [],
        updatedAt: '2026-04-16T13:00:00.000Z',
      },
    ],
    sourcesByMemory: {
      'MEM-001': [
        {
          sourceType: 'comment',
          sourceRef: 'comment-001',
          summary: '如果下一步只有收益没有风险，直接执行。',
          quoteText: '如果下一步只有收益没有风险，直接执行。',
          evidence: {},
        },
      ],
      'MEM-004': [
        {
          sourceType: 'comment',
          sourceRef: 'comment-002',
          summary: 'memory 应该是总领文档 + 分子文档。',
          quoteText: 'memory 应该是总领文档 + 分子文档。',
          evidence: {},
        },
      ],
    },
    collaborationBaselineMarkdown: '# 协作方式与工程审美\n\n- 少确认。低风险事项直接推进。',
    generatedAt: new Date('2026-04-16T14:00:00.000Z'),
  });

  assert.match(documents.index, /Raw materials/);
  assert.match(documents.index, /待裁定 Candidate：1/);
  assert.match(documents.index, /docs\/memory\/knowledge\.md/);
  assert.match(documents.baseMemory, /当前基线/);
  assert.match(documents.baseMemory, /少确认。低风险事项直接推进/);
  assert.match(documents.knowledge, /评论扫描闭环/);
  assert.match(documents.timeline, /PRJ-dark-luxury-itinerary/);
  assert.match(documents.candidates, /Memory hub 总领页/);
  assert.match(documents.candidates, /source：comment \/ comment-002/);
});
