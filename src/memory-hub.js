import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatDisplayTime } from './notion-review-sync.js';
import { CortexStore } from './store.js';

function toIsoDate(value) {
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function byUpdatedAtDesc(left, right) {
  return toIsoDate(right.updatedAt || right.createdAt) - toIsoDate(left.updatedAt || left.createdAt);
}

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTopHeading(markdown = '') {
  const lines = String(markdown || '').split('\n');
  let skipped = false;
  return lines
    .filter((line) => {
      if (!skipped && line.trim().startsWith('# ')) {
        skipped = true;
        return false;
      }
      return true;
    })
    .join('\n')
    .trim();
}

function formatStatus(memory) {
  if (memory.status === 'durable') {
    return 'durable';
  }
  if (memory.reviewState === 'needs_followup') {
    return 'needs_followup';
  }
  return memory.reviewState || memory.status;
}

function formatSource(source) {
  const header = [source.sourceType, source.sourceRef].filter(Boolean).join(' / ');
  const summary = compact(source.summary || source.quoteText);
  return [header || 'unknown source', summary].filter(Boolean).join(' · ');
}

function formatEvidence(source) {
  const evidence = source.evidence && Object.keys(source.evidence).length > 0 ? JSON.stringify(source.evidence) : '';
  return compact(source.quoteText || source.summary || evidence);
}

function renderMemoryEntry(memory, sources = [], { showProject = true } = {}) {
  const lines = [`### ${memory.title}`];
  const meta = [
    `ID：${memory.memoryId}`,
    showProject ? `项目：${memory.projectId}` : null,
    `层级：${memory.layer}`,
    `类型：${memory.type}`,
    `状态：${formatStatus(memory)}`,
    `置信度：${memory.confidence}`,
    memory.freshness ? `freshness：${memory.freshness}` : null,
    memory.nextStep ? `next step：${memory.nextStep}` : null,
    Array.isArray(memory.relatedMemory) && memory.relatedMemory.length > 0
      ? `related：${memory.relatedMemory.join('，')}`
      : null,
  ];

  lines.push(...meta.filter(Boolean).map((item) => `- ${item}`));
  lines.push(`- 摘要：${compact(memory.summary) || '暂无'}`);

  if (sources.length > 0) {
    lines.push(`- source：${formatSource(sources[0])}`);
    const evidence = formatEvidence(sources[0]);
    if (evidence) {
      lines.push(`- evidence：${evidence}`);
    }
    if (sources.length > 1) {
      lines.push(`- 其余来源：${sources.length - 1} 条`);
    }
  } else {
    lines.push('- source：暂无');
  }

  lines.push('');
  return lines.join('\n');
}

function renderGroupedMemories(title, groupedMemories, sourcesByMemory, { showProject = true } = {}) {
  const parts = [`# ${title}`, ''];
  const groups = Object.entries(groupedMemories).filter(([, memories]) => Array.isArray(memories) && memories.length > 0);

  if (groups.length === 0) {
    parts.push('- 暂无。', '');
    return parts.join('\n');
  }

  for (const [groupTitle, memories] of groups) {
    parts.push(`## ${groupTitle}`, '');
    for (const memory of memories) {
      parts.push(renderMemoryEntry(memory, sourcesByMemory[memory.memoryId] || [], { showProject }));
    }
  }

  return parts.join('\n').trim();
}

export function resolveMemoryHubPaths({ cwd = process.cwd() } = {}) {
  const dir = resolve(cwd, 'docs', 'memory');
  return {
    dir,
    indexPath: resolve(dir, 'index.md'),
    candidatesPath: resolve(dir, 'candidates.md'),
    baseMemoryPath: resolve(dir, 'base-memory.md'),
    knowledgePath: resolve(dir, 'knowledge.md'),
    timelinePath: resolve(dir, 'timeline.md'),
    collaborationBaselinePath: resolve(cwd, 'docs', 'collaboration-memory.md'),
  };
}

export function buildMemoryHubDocuments({
  durableBaseMemories = [],
  durableKnowledgeMemories = [],
  durableTimelineMemories = [],
  candidateMemories = [],
  sourcesByMemory = {},
  collaborationBaselineMarkdown = '',
  generatedAt = new Date(),
} = {}) {
  const baseMemories = [...durableBaseMemories].sort(byUpdatedAtDesc);
  const knowledgeMemories = [...durableKnowledgeMemories].sort(byUpdatedAtDesc);
  const timelineMemories = [...durableTimelineMemories].sort(byUpdatedAtDesc);
  const candidates = [...candidateMemories].sort(byUpdatedAtDesc);

  const pendingCounts = candidates.reduce(
    (accumulator, memory) => {
      accumulator.total += 1;
      accumulator[memory.layer] += 1;
      return accumulator;
    },
    {
      total: 0,
      base_memory: 0,
      knowledge: 0,
      timeline: 0,
    },
  );

  const baseMemoryDocParts = [
    '# Base Memory（基础记忆）',
    '',
    '- 作用：沉淀稳定协作偏好、原则、规则。',
    '- 来源：当前长期 base memory + 已有协作基线文本。',
    '',
  ];

  const baselineBody = stripTopHeading(collaborationBaselineMarkdown);
  if (baselineBody) {
    baseMemoryDocParts.push('## 当前基线', '', baselineBody, '');
  }

  baseMemoryDocParts.push('## 结构化长期条目', '');
  if (baseMemories.length === 0) {
    baseMemoryDocParts.push('- 暂无。', '');
  } else {
    for (const memory of baseMemories) {
      baseMemoryDocParts.push(renderMemoryEntry(memory, sourcesByMemory[memory.memoryId] || [], { showProject: false }));
    }
  }

  const knowledgeDoc = renderGroupedMemories(
    'Knowledge（知识）',
    {
      已接受知识: knowledgeMemories,
    },
    sourcesByMemory,
    { showProject: true },
  );

  const timelineByProject = timelineMemories.reduce((accumulator, memory) => {
    const key = compact(memory.projectId || 'unknown');
    accumulator[key] = accumulator[key] || [];
    accumulator[key].push(memory);
    return accumulator;
  }, {});
  const timelineDoc = renderGroupedMemories('Timeline（时间线）', timelineByProject, sourcesByMemory, {
    showProject: false,
  });

  const candidateGroups = {
    '待裁定 Base Memory（基础记忆）': candidates.filter((memory) => memory.layer === 'base_memory'),
    '待裁定 Knowledge（知识）': candidates.filter((memory) => memory.layer === 'knowledge'),
    '待裁定 Timeline（时间线）': candidates.filter((memory) => memory.layer === 'timeline'),
  };
  const filteredCandidateGroups = Object.fromEntries(
    Object.entries(candidateGroups).filter(([, memories]) => memories.length > 0),
  );
  const candidatesDoc = renderGroupedMemories('候选记忆', filteredCandidateGroups, sourcesByMemory, {
    showProject: true,
  });

  const candidateSummary =
    candidates.length > 0
      ? candidates
          .slice(0, 8)
          .map(
            (memory) =>
              `- [${memory.layer}] ${memory.title} · ${formatStatus(memory)}${memory.nextStep ? ` · ${memory.nextStep}` : ''}`,
          )
          .join('\n')
      : '- 暂无待裁定候选。';

  const indexDoc = [
    '# Cortex 记忆总览',
    '',
    `- 更新于：${formatDisplayTime(generatedAt)}（上海时间）`,
    `- 长期记忆：Base ${baseMemories.length} / Knowledge ${knowledgeMemories.length} / Timeline ${timelineMemories.length}`,
    `- 待裁定候选：${pendingCounts.total}（Base ${pendingCounts.base_memory} / Knowledge ${pendingCounts.knowledge} / Timeline ${pendingCounts.timeline}）`,
    '',
    '## 记忆流水线',
    '',
    '1. 原始材料：先从 comment / decision / checkpoint / receipt / suggestion 等原材料里提取候选信号。',
    '2. 候选记忆：先落候选，不直接写成长期记忆；同时附带 `source / evidence / confidence / freshness / next_step`。',
    '3. 长期记忆：只有通过 review 且被确认接受的条目，才会进入 durable，并按 Base Memory / Knowledge / Timeline 三类挂载。',
    '',
    '## 导航',
    '',
    '- Base Memory（基础记忆）：docs/memory/base-memory.md',
    '- Knowledge（知识）：docs/memory/knowledge.md',
    '- Timeline（时间线）：docs/memory/timeline.md',
    '- 候选记忆：docs/memory/candidates.md',
    '- 项目级记忆：docs/projects/*/memory.md',
    '',
    '## 当前待裁定摘要',
    '',
    candidateSummary,
    '',
    '## 说明',
    '',
    '- Base Memory / Knowledge 是全局可复用资产，不按项目拆散。',
    '- Timeline 允许按项目留痕，但仍然收敛到同一个 hub 下管理。',
    '- 项目级记忆可以单独存在于 docs/projects/*/memory.md，用于保留项目内协作约定、局部知识和项目里程碑。',
    '- 项目级记忆不会自动并入全局长期记忆中心，只有经过 review 提升后，才会进入全局的 Base / Knowledge / Timeline。',
    '',
  ].join('\n');

  return {
    index: indexDoc,
    baseMemory: baseMemoryDocParts.join('\n').trim(),
    knowledge: knowledgeDoc,
    timeline: timelineDoc,
    candidates: candidatesDoc,
  };
}

export function writeMemoryHubDocuments(paths, documents) {
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.indexPath, documents.index, 'utf8');
  writeFileSync(paths.baseMemoryPath, documents.baseMemory, 'utf8');
  writeFileSync(paths.knowledgePath, documents.knowledge, 'utf8');
  writeFileSync(paths.timelinePath, documents.timeline, 'utf8');
  writeFileSync(paths.candidatesPath, documents.candidates, 'utf8');
}

export function compileMemoryHub({
  cwd = process.cwd(),
  dbPath = process.env.CORTEX_DB_PATH,
  clock = () => new Date(),
} = {}) {
  const paths = resolveMemoryHubPaths({ cwd });
  const store = new CortexStore({ dbPath, clock });

  try {
    const memories = store.listMemoryItems();
    const sourcesByMemory = Object.fromEntries(
      memories.map((memory) => [memory.memoryId, store.listMemorySources(memory.memoryId)]),
    );
    const collaborationBaselineMarkdown = existsSync(paths.collaborationBaselinePath)
      ? readFileSync(paths.collaborationBaselinePath, 'utf8')
      : '';

    const documents = buildMemoryHubDocuments({
      durableBaseMemories: memories.filter((memory) => memory.status === 'durable' && memory.layer === 'base_memory'),
      durableKnowledgeMemories: memories.filter((memory) => memory.status === 'durable' && memory.layer === 'knowledge'),
      durableTimelineMemories: memories.filter((memory) => memory.status === 'durable' && memory.layer === 'timeline'),
      candidateMemories: memories.filter(
        (memory) => memory.status === 'candidate' || memory.reviewState === 'needs_followup',
      ),
      sourcesByMemory,
      collaborationBaselineMarkdown,
      generatedAt: clock(),
    });

    writeMemoryHubDocuments(paths, documents);

    return {
      paths,
      documents,
      stats: {
        totalMemories: memories.length,
        durableBaseCount: memories.filter((memory) => memory.status === 'durable' && memory.layer === 'base_memory').length,
        durableKnowledgeCount: memories.filter((memory) => memory.status === 'durable' && memory.layer === 'knowledge').length,
        durableTimelineCount: memories.filter((memory) => memory.status === 'durable' && memory.layer === 'timeline').length,
        candidateCount: memories.filter((memory) => memory.status === 'candidate' || memory.reviewState === 'needs_followup').length,
      },
    };
  } finally {
    store.close();
  }
}
