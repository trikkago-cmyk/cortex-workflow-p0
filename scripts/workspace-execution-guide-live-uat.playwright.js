import { test, expect } from '@playwright/test';

const baseUrl = process.env.CORTEX_LIVE_BASE_URL || 'http://127.0.0.1:19100';

async function postJson(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`POST ${pathname} failed: HTTP ${response.status} ${body}`);
  }

  return response.json();
}

async function seedWorkspaceExecutionGuideProject() {
  const suffix = Date.now();
  const projectId = `PRJ-cortex-live-browser-execution-guide-${suffix}`;
  const pageId = `page-browser-execution-guide-${suffix}`;
  const discussionId = `discussion-browser-execution-guide-${suffix}`;
  const commentId = `comment-browser-execution-guide-${suffix}`;
  const threadKey = `notion:${pageId}:${discussionId}`;

  await postJson('/projects/upsert', {
    project_id: projectId,
    root_page_url: 'https://www.notion.so/Cortex-35beb0c2e3f780309d79ddb2bd3c44b6',
    review_window_note: 'Browser UAT · execution guide',
  });

  await postJson('/task-briefs', {
    project_id: projectId,
    title: 'Browser UAT：执行引导要贯穿首页与执行现场',
    why: '需要验证首页、文档页、线程页、memory reviewer 页都能在首屏露出同一套执行引导。',
    context: '这条 brief 会和同一条 discussion 下的红灯、评论、memory 候选共享执行焦点。',
    what: '让 front-end 第一屏不再只在首页像指挥台。',
    status: 'in_progress',
    source_url: `notion://page/${pageId}/discussion/${discussionId}`,
  });

  const decisionResult = await postJson('/decisions', {
    project_id: projectId,
    signal_level: 'red',
    question: 'Browser UAT：doc / thread 首屏是否也会直接露出红灯拍板入口？',
    recommendation: '要，让人离开首页以后仍然知道当前最急的执行入口。',
    why_now: '如果执行引导只停在首页，进入执行现场后还是会重新丢上下文。',
    impact_scope: 'cross_module',
    requested_human_action: '确认首屏执行引导是否跨入口一致。',
    source_url: `notion://page/${pageId}/discussion/${discussionId}`,
  });

  await postJson('/webhook/notion-comment', {
    project_id: projectId,
    target_type: 'page',
    target_id: pageId,
    page_id: pageId,
    discussion_id: discussionId,
    comment_id: commentId,
    body: '为什么这个线程还没有继续跑？',
    owner_agent: 'agent-router',
    source_url: `notion://page/${pageId}/discussion/${discussionId}/comment/${commentId}`,
  });

  const memoryCreate = await postJson('/memory', {
    project_id: projectId,
    layer: 'knowledge',
    type: 'pattern',
    title: '执行引导要贯穿首页与执行现场',
    summary: '只要当前还有红灯、待分流评论或待 review 记忆，进入 doc / thread / memory 现场后也应该继续露出第一屏执行引导。',
    status: 'candidate',
    review_state: 'pending_accept',
    confidence: 'high',
    sources: [
      {
        source_type: 'notion_comment',
        source_url: `notion://page/${pageId}/discussion/${discussionId}/comment/${commentId}`,
        summary: '来源于当前这条 live UAT 评论线程。',
      },
    ],
  });

  await postJson('/inbox', {
    project_id: projectId,
    queue: 'review',
    object_type: 'memory',
    action_type: 'review',
    risk_level: 'yellow',
    title: '确认执行引导是否也覆盖 memory reviewer 首屏',
    summary: 'memory reviewer 现场也应该在首屏露出当前该先处理的红灯和治理入口。',
    payload: {
      memory_id: memoryCreate.memory.memory_id,
    },
  });

  await postJson('/suggestions', {
    project_id: projectId,
    source_type: 'notion_comment',
    source_ref: `comment-browser-execution-guide-${suffix}`,
    proposed_text: '把执行引导继续前置到 doc / thread / memory 首屏',
    reason: '当前 live UAT 需要有一条 suggestion 一起挂进 memory reviewer 现场。',
    owner_agent: 'agent-router',
  });

  await postJson('/runs', {
    project_id: projectId,
    thread_key: `command:browser-residual-${suffix}`,
    thread_label: '继续',
    role: 'worker',
    phase: 'execute',
    status: 'completed',
    title: '继续',
    summary: 'Browser UAT：保留一条 run-only 残留，确保首页线程治理有真实治理对象。',
    agent_name: 'agent-legacy',
    idempotency_key: `browser-residual-${suffix}`,
  });

  return {
    projectId,
    threadKey,
    decisionId: decisionResult.decision.decisionId,
    memoryId: memoryCreate.memory.memory_id,
    workspaceUrl: `${baseUrl}/workspace?project_id=${encodeURIComponent(projectId)}`,
    executionDocUrl: `${baseUrl}/workspace/docs/execution?project_id=${encodeURIComponent(projectId)}`,
    memoryDocUrl: `${baseUrl}/workspace/docs/memory?project_id=${encodeURIComponent(projectId)}`,
    threadUrl: `${baseUrl}/workspace/threads/${encodeURIComponent(threadKey)}?project_id=${encodeURIComponent(projectId)}&document_id=execution`,
  };
}

test('workspace execution guide stays visible across homepage, docs, memory, and thread scenes', async ({
  page,
}, testInfo) => {
  const seeded = await seedWorkspaceExecutionGuideProject();

  await test.step('workspace homepage shows the top-level execution guide queue', async () => {
    await page.goto(seeded.workspaceUrl, { waitUntil: 'networkidle' });

    await expect(page.locator('body')).toContainText('当前执行引导');
    await expect(page.locator('body')).toContainText(/红灯待拍板|红灯拍板|黄灯绕行中|黄灯绕行/);
    await expect(page.locator('body')).toContainText('评论分流');
    await expect(page.locator('body')).toContainText('记忆治理');
    const notionCollaborationGuidance = page.locator('[data-notion-collaboration-guidance]');
    await expect(notionCollaborationGuidance).toContainText('当前协作节点');
    await expect(notionCollaborationGuidance).toContainText('当前判断');
    await expect(notionCollaborationGuidance).toContainText('下一步');
    await expect(notionCollaborationGuidance).toContainText('Checkpoint 规则');

    const decisionCenter = page.locator('#decision-center');
    await expect(decisionCenter).toContainText('当前关联闭环');
    await expect(decisionCenter).toContainText('执行清单：');
    const decisionCenterGuidance = page.locator('[data-home-decision-center-guidance]');
    await expect(decisionCenterGuidance).toContainText('当前决策节点');
    await expect(decisionCenterGuidance).toContainText('当前判断');
    await expect(decisionCenterGuidance).toContainText('这一步拍板');
    await expect(decisionCenterGuidance).toContainText('Checkpoint 规则');

    const commentCenter = page.locator('#comment-workflow-center');
    await expect(commentCenter).toContainText('当前关联闭环');
    await expect(commentCenter).toContainText('执行清单：');
    const commentCenterGuidance = page.locator('[data-home-comment-center-guidance]');
    await expect(commentCenterGuidance).toContainText('当前评论节点');
    await expect(commentCenterGuidance).toContainText('当前判断');
    await expect(commentCenterGuidance).toContainText('下一步');
    await expect(commentCenterGuidance).toContainText('Checkpoint 规则');

    const memoryCenter = page.locator('#memory-governance-center');
    await expect(memoryCenter).toContainText('当前关联闭环');
    await expect(memoryCenter).toContainText('执行清单：');
    const memoryCenterGuidance = page.locator('[data-home-memory-center-guidance]');
    await expect(memoryCenterGuidance).toContainText('当前治理节点');
    await expect(memoryCenterGuidance).toContainText('当前判断');
    await expect(memoryCenterGuidance).toContainText('这一步判断');
    await expect(memoryCenterGuidance).toContainText('Checkpoint 规则');
    await expect(memoryCenter).toContainText('当前治理节点');
    await expect(memoryCenter).toContainText('当前判断');
    await expect(memoryCenter).toContainText('这一步判断');
    await expect(memoryCenter).toContainText('最近证据');
    await expect(memoryCenter).toContainText('更新于');
    await expect(memoryCenter).toContainText(/证据现场：(记忆候选区|Review 队列|Suggestion 沉淀区|记忆治理现场)/);

    const workspaceTaskCard = page.locator('[data-workspace-task-card]').first();
    await expect(workspaceTaskCard).toContainText('与当前闭环关系');
    await expect(workspaceTaskCard).toContainText('执行清单：');
    await expect(workspaceTaskCard.locator('[data-workspace-card-body-context="workspace-task-card"]')).toContainText('与当前闭环关系');
    await expect(workspaceTaskCard.locator('[data-workspace-card-body-middle-context="workspace-task-card"]')).toContainText(/当前节点|执行链|推荐动作|下一步/);

    const homeDecisionCard = page.locator('[data-home-decision-focus-card]').first();
    await expect(homeDecisionCard).toContainText('与当前闭环关系');
    await expect(homeDecisionCard).toContainText('执行清单：');
    await expect(homeDecisionCard.locator('[data-home-card-body-context="decision-focus-card"]')).toContainText('与当前闭环关系');
    await expect(homeDecisionCard.locator('[data-home-card-body-middle-context="decision-focus-card"]')).toContainText(/卡点原因|下一步/);
    await expect(homeDecisionCard.locator('[data-home-inline-action-box="decision"]')).toBeVisible();
    await expect(homeDecisionCard.locator('[data-home-inline-action-note="decision"]')).toBeVisible();
    await expect(homeDecisionCard.locator('[data-home-inline-action-list="decision"]')).toBeVisible();
    await expect(homeDecisionCard.locator('[data-home-inline-action-button="approved"]')).toBeVisible();

    const homeCommentCard = page.locator('[data-home-comment-workflow-card]').first();
    await expect(homeCommentCard).toContainText('与当前闭环关系');
    await expect(homeCommentCard).toContainText('执行清单：');
    await expect(homeCommentCard.locator('[data-home-card-body-context="comment-workflow-card"]')).toContainText('与当前闭环关系');
    await expect(homeCommentCard.locator('[data-home-card-body-middle-context="comment-workflow-card"]')).toContainText(/当前判断|建议动作/);
    await expect(homeCommentCard.locator('[data-home-inline-action-box="comment"]')).toBeVisible();
    await expect(homeCommentCard.locator('[data-home-inline-action-note="comment"]')).toBeVisible();
    await expect(homeCommentCard.locator('[data-home-inline-action-list="comment"]')).toBeVisible();
    await expect(homeCommentCard.locator('[data-home-inline-action-button]').first()).toBeVisible();

    const homeGridCard = page.locator('[data-home-grid-card]').filter({ hasText: '与当前闭环关系' }).first();
    await expect(homeGridCard).toContainText('与当前闭环关系');
    await expect(homeGridCard).toContainText('执行清单：');
    await expect(homeGridCard.locator('[data-home-card-body-context="home-grid-card"]')).toContainText('与当前闭环关系');
    await expect(homeGridCard.locator('[data-home-card-body-middle-context="home-grid-card"]')).toContainText(/当前治理节点|当前判断|这一步判断|最近证据/);
    await expect(homeGridCard.locator('[data-meta-grid-context="home-memory-governance-card"]')).toContainText(/当前治理节点|最近 source 锚点/);
    await expect(homeGridCard.locator('[data-workflow-next-block="next-step"]')).toContainText(/这一步判断|下一步/);
    await expect(homeGridCard.locator('[data-home-memory-governance-meta-list]')).toBeVisible();
    await expect(homeGridCard.locator('[data-home-governance-action-box]')).toBeVisible();

    const attentionGuidance = page.locator('[data-attention-view-guidance]');
    await expect(attentionGuidance).toContainText('当前注意力焦点');
    await expect(attentionGuidance).toContainText('当前判断');
    await expect(attentionGuidance).toContainText('下一步');
    await expect(attentionGuidance).toContainText('验收条件');
    await expect(attentionGuidance).toContainText('Checkpoint 规则');
    await expect(page.locator('#attention-view')).toContainText('最近证据：');
    await expect(page.locator('#attention-view')).toContainText(/进入拍板现场|进入执行现场|回看已完成现场/);

    const threadGovernance = page.locator('[data-thread-governance-guidance]');
    await expect(threadGovernance).toContainText('当前治理节点');
    await expect(threadGovernance).toContainText('当前判断');
    await expect(threadGovernance).toContainText('这一步处理');
    await expect(threadGovernance).toContainText('验收条件');
    await expect(threadGovernance).toContainText('治理规则');
    await expect(page.locator('#thread-governance')).toContainText('最近证据：');
    await expect(page.locator('#thread-governance')).toContainText('打开证据现场');
    await expect(page.locator('#thread-governance')).toContainText(/查看全部历史线程|切回聚焦视图|清除残留筛选/);

    const heroDataHygieneGuidance = page.locator('[data-hero-data-hygiene-guidance]');
    await expect(heroDataHygieneGuidance).toContainText('当前治理焦点');
    await expect(heroDataHygieneGuidance).toContainText('当前判断');
    await expect(heroDataHygieneGuidance).toContainText('这一步处理');
    await expect(heroDataHygieneGuidance).toContainText('关联闭环：第 3 步');
    await expect(heroDataHygieneGuidance).toContainText('验收条件');
    await expect(heroDataHygieneGuidance).toContainText('Checkpoint 规则');
    await expect(heroDataHygieneGuidance).toContainText('最近证据：');
    await expect(heroDataHygieneGuidance).toContainText('证据现场：历史层残留');
    await expect(heroDataHygieneGuidance).toContainText('打开证据现场');
    await expect(heroDataHygieneGuidance).toContainText(/打开待治理线程|打开源位置|打开最近源位置/);
    await expect(heroDataHygieneGuidance).toContainText('查看全部历史线程');
    await expect(heroDataHygieneGuidance).toContainText('打开线程治理');

    const runtimeGuidance = page.locator('[data-runtime-health-guidance]');
    await expect(runtimeGuidance).toContainText('当前 runtime 节点');
    await expect(runtimeGuidance).toContainText('当前判断');
    await expect(runtimeGuidance).toContainText('这一步恢复');
    await expect(runtimeGuidance).toContainText(/runtime 已对齐|live listener 漂移|managed runtime 未拉起|managed 进程掉线|health probe 未确认|listener 待完全对齐|listener 待确认|live listener 待确认/);
    await expect(page.locator('[data-runtime-headline]')).not.toHaveText('正在读取 live runtime、health probe 与端口监听状态。');

    await page.locator('[data-view-target="thread"]').click();
    const threadPanelHead = page.locator('[data-thread-panel-head]');
    const threadFilterSummaryLabel = page.locator('[data-thread-filter-summary-label]');
    const threadFilterSummaryCount = page.locator('[data-thread-filter-summary-count]');
    const threadViewGuidance = page.locator('[data-thread-view-guidance]');
    const threadViewProof = page.locator('[data-thread-view-guidance-proof-row]');
    const threadViewActions = page.locator('[data-thread-view-guidance-actions-links]');
    const threadFilterBar = page.locator('[data-thread-filter-bar]');
    const threadFilterEmpty = page.locator('[data-thread-filter-empty]');
    const threadFilterEmptyLabel = page.locator('[data-thread-filter-empty-label]');
    const threadFilterEmptyCount = page.locator('[data-thread-filter-empty-count]');
    const threadFilterEmptyCopy = page.locator('[data-thread-filter-empty-copy]');
    const allFilter = threadFilterBar.locator('[data-thread-filter="all"]');
    const triageFilter = threadFilterBar.locator('[data-thread-filter="triage"]');
    const readyFilter = threadFilterBar.locator('[data-thread-filter="ready"]');
    const redFilter = threadFilterBar.locator('[data-thread-filter="red"]');
    const activeFilter = threadFilterBar.locator('[data-thread-filter="active"]');
    const completedFilter = threadFilterBar.locator('[data-thread-filter="completed"]');
    const threadGroup = page.locator('[data-thread-group]').filter({ hasText: seeded.threadKey }).first();
    const expectThreadViewActions = async (labelPattern, emptyPattern) => {
      const guidanceText = await threadViewGuidance.textContent();
      if (emptyPattern.test(guidanceText || '')) {
        await expect(threadViewActions).toBeHidden();
        return;
      }
      await expect(threadViewActions).toContainText(labelPattern);
    };
    const expectThreadFilterSurface = async (filterLabel, filterKey) => {
      const totalCount = await page.locator('[data-thread-group]').count();
      const expectedCount = await page.locator('[data-thread-group]:visible').count();
      await expect(
        page.locator(`[data-thread-group][data-thread-group-active-filter="${filterKey}"]`),
      ).toHaveCount(totalCount);
      await expect(
        page.locator('[data-thread-group][data-thread-group-filter-membership]'),
      ).toHaveCount(totalCount);
      await expect(
        page.locator('[data-thread-group][data-thread-group-visibility="visible"]'),
      ).toHaveCount(expectedCount);
      await expect(
        page.locator('[data-thread-group][data-thread-group-visibility="hidden"]'),
      ).toHaveCount(totalCount - expectedCount);
      if (totalCount > 0) {
        await expect(page.locator('[data-thread-group]').first()).toHaveAttribute(
          'data-thread-group-visibility-reason',
          new RegExp(`当前筛选是“${filterLabel}”`),
        );
      }
      await expect(threadFilterSummaryLabel).toHaveText(`当前筛选：${filterLabel}`);
      await expect(threadFilterSummaryCount).toHaveText(`${expectedCount} 条线程`);
      if (expectedCount === 0) {
        await expect(threadFilterEmpty).toBeVisible();
        await expect(threadFilterEmptyLabel).toHaveText(`当前筛选：${filterLabel}`);
        await expect(threadFilterEmptyCount).toHaveText('0 条线程');
        const expectedCopy =
          filterLabel === '全部'
            ? '当前还没有可展示的线程分组。'
            : `当前筛选下没有${filterLabel}线程，试试切回“全部”或其他状态。`;
        await expect(threadFilterEmptyCopy).toHaveText(expectedCopy);
      } else {
        await expect(threadFilterEmpty).toBeHidden();
      }
      await expect(page.locator('[data-thread-group]:visible')).toHaveCount(expectedCount);
    };
    await expect(threadPanelHead).toBeVisible();
    await expect(threadPanelHead.locator('[data-thread-panel-title]')).toHaveText('按线程');
    await expect(threadPanelHead.locator('[data-thread-panel-note]')).toContainText('同一条协作线程下拆了哪些任务');
    await expect(threadViewGuidance).toContainText('当前线程焦点');
    await expect(threadViewGuidance).toContainText('当前判断');
    await expect(threadViewGuidance).toContainText('下一步');
    await expect(threadViewGuidance).toContainText('验收条件');
    await expect(threadViewGuidance).toContainText('Checkpoint 规则');
    await expect(threadViewProof).toContainText('最近证据：');
    await expect(threadViewActions).toContainText(/打开焦点线程|进入评论分流现场|进入执行回流现场|打开待拍板线程|打开执行中线程|打开已完成线程/);
    await expect(threadFilterBar).toBeVisible();
    await expect(allFilter).toHaveAttribute('data-thread-filter-state', 'active');
    await expect(allFilter.locator('[data-thread-filter-label]')).toHaveText('全部');
    await expect(allFilter.locator('[data-thread-filter-count]')).toHaveText(/^\d+$/);
    await expectThreadFilterSurface('全部', 'all');
    await expect(triageFilter.locator('[data-thread-filter-label]')).toHaveText('待分流评论');
    await expect(triageFilter.locator('[data-thread-filter-count]')).toHaveText(/^\d+$/);
    await expect(readyFilter.locator('[data-thread-filter-label]')).toHaveText('已接回执行');
    await expect(readyFilter.locator('[data-thread-filter-count]')).toHaveText(/^\d+$/);
    await expect(redFilter.locator('[data-thread-filter-label]')).toHaveText('红灯');
    await expect(redFilter.locator('[data-thread-filter-count]')).toHaveText(/^\d+$/);
    await expect(activeFilter.locator('[data-thread-filter-label]')).toHaveText('进行中');
    await expect(activeFilter.locator('[data-thread-filter-count]')).toHaveText(/^\d+$/);
    await expect(completedFilter.locator('[data-thread-filter-label]')).toHaveText('已完成');
    await expect(completedFilter.locator('[data-thread-filter-count]')).toHaveText(/^\d+$/);
    await expect(threadGroup.locator('[data-thread-group-title]')).toContainText('Browser UAT：执行引导要贯穿首页与执行现场');
    await expect(threadGroup.locator('[data-thread-group-key]')).toContainText(seeded.threadKey);
    await expect(threadGroup.locator('[data-thread-group-updated]')).toContainText('最近更新');
    await expect(threadGroup.locator('[data-thread-group-filter-note]')).toContainText('当前归类：');
    await expect(threadGroup.locator('[data-thread-group-overview]')).toContainText(/红灯|待分流评论|已接回执行评论/);
    await expect(threadGroup).toHaveAttribute('data-thread-group-filter-membership', /当前归类：/);
    await expect(threadGroup).toHaveAttribute('data-thread-group-active-filter', 'all');
    await expect(threadGroup).toHaveAttribute('data-thread-group-visibility', 'visible');
    await expect(threadGroup).toHaveAttribute('data-thread-group-visibility-reason', /当前筛选是“全部”/);
    await expect(threadGroup).toContainText('与当前闭环关系');
    await expect(threadGroup).toContainText('执行清单：');
    await expect(threadGroup.locator('[data-workspace-card-body-context="thread-group"]')).toContainText('与当前闭环关系');
    await expect(threadGroup.locator('[data-thread-group-stats]')).toBeVisible();
    await expect(threadGroup.locator('[data-thread-group-stat="tasks"]')).toContainText('1 个任务');
    await expect(threadGroup.locator('[data-thread-group-stat="red"]')).toContainText('1 个红灯');
    await expect(threadGroup.locator('[data-workspace-card-body-middle-context="thread-group"]')).toBeVisible();
    await expect(threadGroup.locator('[data-thread-group-task-list] [data-workspace-task-card]').first()).toBeVisible();
    await triageFilter.click();
    await expect(triageFilter).toHaveAttribute('data-thread-filter-state', 'active');
    await expect(allFilter).toHaveAttribute('data-thread-filter-state', 'inactive');
    await expectThreadFilterSurface('待分流评论', 'triage');
    await expect(threadViewGuidance).toContainText(/待分流评论线程|当前没有待分流线程/);
    await expectThreadViewActions(/进入评论分流现场|打开焦点线程/, /当前没有待分流线程/);
    await readyFilter.click();
    await expect(readyFilter).toHaveAttribute('data-thread-filter-state', 'active');
    await expect(triageFilter).toHaveAttribute('data-thread-filter-state', 'inactive');
    await expectThreadFilterSurface('已接回执行', 'ready');
    await expect(threadViewGuidance).toContainText(/已接回执行线程|当前没有已接回执行线程/);
    await expectThreadViewActions(/进入执行回流现场|打开焦点线程/, /当前没有已接回执行线程/);
    await redFilter.click();
    await expect(redFilter).toHaveAttribute('data-thread-filter-state', 'active');
    await expect(readyFilter).toHaveAttribute('data-thread-filter-state', 'inactive');
    await expectThreadFilterSurface('红灯', 'red');
    await expect(threadViewGuidance).toContainText(/待拍板线程|当前没有红灯线程/);
    await expectThreadViewActions(/打开待拍板线程|打开焦点线程/, /当前没有红灯线程/);
    await activeFilter.click();
    await expect(activeFilter).toHaveAttribute('data-thread-filter-state', 'active');
    await expect(redFilter).toHaveAttribute('data-thread-filter-state', 'inactive');
    await expectThreadFilterSurface('进行中', 'active');
    await expect(threadViewGuidance).toContainText(/执行中线程|当前没有处理中线程/);
    await expectThreadViewActions(/打开执行中线程|打开焦点线程/, /当前没有处理中线程/);
    await completedFilter.click();
    await expect(completedFilter).toHaveAttribute('data-thread-filter-state', 'active');
    await expect(activeFilter).toHaveAttribute('data-thread-filter-state', 'inactive');
    await expectThreadFilterSurface('已完成', 'completed');
    await expect(threadViewGuidance).toContainText(/已完成线程|当前没有已完成线程/);
    await expectThreadViewActions(/打开已完成线程|打开焦点线程/, /当前没有已完成线程/);
  });

  await test.step('execution doc page keeps red decision and comment triage guidance on the first screen', async () => {
    await page.goto(seeded.executionDocUrl, { waitUntil: 'networkidle' });

    const focusStrip = page.locator('[data-execution-focus-strip]');
    const directLinksCard = focusStrip.locator('[data-focus-proof-kind="execution-direct-links"]');
    const workflowNodeCard = focusStrip.locator('[data-focus-proof-kind="execution-workflow-node"]');
    const evidenceCard = focusStrip.locator('[data-focus-proof-kind="execution-focus-evidence"]');
    await expect(focusStrip).toContainText('当前执行引导');
    await expect(focusStrip).toContainText('当前节点');
    await expect(focusStrip).toContainText('这一步验收');
    await expect(focusStrip).toContainText('Checkpoint 规则');
    await expect(focusStrip).toContainText(/红灯待拍板|红灯拍板|黄灯绕行中|黄灯绕行/);
    await expect(focusStrip).toContainText('评论分流');
    await expect(focusStrip).toContainText('最近证据');
    await expect(focusStrip).toContainText(/证据现场：(历史层残留|线程治理现场)/);
    await expect(focusStrip).toContainText('打开证据现场');
    await expect(focusStrip).toContainText(/打开待治理线程|打开最近源位置|打开源位置/);
    await expect(directLinksCard).toContainText('现场直达');
    await expect(directLinksCard).toContainText('查看任务流转');
    await expect(workflowNodeCard).toContainText('当前节点');
    await expect(evidenceCard).toContainText('最近证据');
    await expect(page.locator('body')).toContainText('Browser UAT：doc / thread 首屏是否也会直接露出红灯拍板入口？');
    await expect(page.locator('body')).toContainText('为什么这个线程还没有继续跑？');
  });

  await test.step('memory reviewer page keeps governance guidance on the first screen', async () => {
    await page.goto(seeded.memoryDocUrl, { waitUntil: 'networkidle' });

    const focusStrip = page.locator('[data-memory-focus-strip]');
    const reviewerFocusCard = page.locator('[data-memory-reviewer-focus-card]');
    const reviewerStats = page.locator('[data-thread-stats-context="memory-reviewer-focus-card"]');
    const reviewerSummaryCard = page.locator('[data-memory-reviewer-summary-card]');
    const executionRelationCard = focusStrip.locator('[data-focus-proof-kind="memory-execution-relation"]');
    const governanceNodeCard = focusStrip.locator('[data-focus-proof-kind="memory-node-guidance"]');
    const evidenceCard = focusStrip.locator('[data-focus-proof-kind="memory-focus-evidence"]');
    const governanceCardWithChecklist = page.locator('[data-memory-governance-card]').filter({ hasText: '与当前闭环关系' }).first();
    await expect(focusStrip).toContainText('当前执行引导');
    await expect(focusStrip).toContainText('当前治理节点');
    await expect(focusStrip).toContainText('这一步判断');
    await expect(focusStrip).toContainText('与当前闭环关系');
    await expect(focusStrip).toContainText('执行清单：4 / 5 已收口');
    await expect(focusStrip).toContainText(/红灯待拍板|红灯拍板|黄灯绕行中|黄灯绕行/);
    await expect(focusStrip).toContainText('记忆治理');
    await expect(focusStrip).toContainText('最近证据');
    await expect(focusStrip).toContainText('更新于');
    await expect(focusStrip).toContainText(/证据现场：(记忆候选区|Review 队列|Suggestion 沉淀区|记忆治理现场)/);
    await expect(focusStrip).toContainText('打开证据现场');
    await expect(focusStrip).toContainText('打开当前来源');
    await expect(executionRelationCard).toContainText('与当前闭环关系');
    await expect(governanceNodeCard).toContainText(/当前治理节点|Review Pending|Suggestion|Candidate/);
    await expect(evidenceCard).toContainText('最近证据');
    await expect(reviewerFocusCard).toContainText('与当前闭环关系');
    await expect(reviewerFocusCard).toContainText('执行清单：4 / 5 已收口');
    await expect(reviewerFocusCard.locator('[data-scene-card-body-context="memory-reviewer-focus-card"]')).toContainText('当前闭环关系');
    await expect(reviewerFocusCard.locator('[data-scene-card-body-middle-context="memory-reviewer-focus-card"]')).toContainText(/当前焦点|当前队列|下一步/);
    await expect(reviewerFocusCard.locator('[data-scene-card-body-middle="memory-reviewer-focus-details"]')).toContainText(/当前焦点|最近证据/);
    await expect(reviewerFocusCard.locator('[data-meta-grid-context="memory-reviewer-focus-card"]')).toContainText(/当前焦点|当前队列|下一步/);
    await expect(reviewerStats).toContainText(/记忆候选|Review 队列|相关 Suggestions|待治理总数/);
    await expect(reviewerStats.locator('[data-thread-stat="candidates"]')).toContainText('记忆候选');
    await expect(reviewerStats.locator('[data-thread-stat="reviews"]')).toContainText('Review 队列');
    await expect(reviewerStats.locator('[data-thread-stat="suggestions"]')).toContainText('相关 Suggestions');
    await expect(reviewerStats.locator('[data-thread-stat="actionable-total"]')).toContainText('待治理总数');
    await expect(reviewerStats.locator('[data-thread-stat="candidates"] [data-thread-stat-value]')).toBeVisible();
    await expect(reviewerStats.locator('[data-thread-stat="reviews"] [data-thread-stat-value]')).toBeVisible();
    await expect(reviewerStats.locator('[data-thread-stat="suggestions"] [data-thread-stat-value]')).toBeVisible();
    await expect(reviewerStats.locator('[data-thread-stat="actionable-total"] [data-thread-stat-value]')).toBeVisible();
    await expect(reviewerSummaryCard).toContainText('与当前闭环关系');
    await expect(reviewerSummaryCard).toContainText('执行清单：4 / 5 已收口');
    await expect(reviewerSummaryCard.locator('[data-scene-card-body-context="memory-reviewer-summary-card"]')).toContainText('当前闭环关系');
    await expect(reviewerSummaryCard.locator('[data-scene-card-body-middle-context="memory-reviewer-summary-card"]')).toContainText(/当前焦点|当前队列|推进规则/);
    await expect(reviewerSummaryCard.locator('[data-scene-card-body-middle="memory-reviewer-summary-details"]')).toContainText(/证据变化|重新校验|当前主闭环/);
    await expect(reviewerSummaryCard.locator('[data-workflow-next-block="current-decision"]')).toContainText('当前判断');
    await expect(reviewerSummaryCard.locator('[data-meta-grid-context="memory-reviewer-summary-card"]')).toContainText(/当前焦点|推进规则/);
    await expect(governanceCardWithChecklist).toContainText('与当前闭环关系');
    await expect(governanceCardWithChecklist).toContainText('执行清单：4 / 5 已收口');
    await expect(governanceCardWithChecklist.locator('[data-scene-card-body-context="memory-governance-card"]')).toContainText('与当前闭环关系');
    await expect(governanceCardWithChecklist.locator('[data-scene-card-body-middle-context="memory-governance-card"]')).toContainText(/生命周期|Review|最近证据/);
    await expect(governanceCardWithChecklist.locator('[data-scene-card-body-middle="memory-governance-details"]')).toContainText(/Freshness|证据变化|重新校验建议/);
    await expect(governanceCardWithChecklist.locator('[data-workflow-next-block="next-step"]')).toContainText('下一步');
    await expect(governanceCardWithChecklist.locator('[data-meta-grid-context="memory-governance-card"]')).toContainText(/生命周期|最近 source 锚点/);
    await expect(governanceCardWithChecklist.locator('[data-memory-governance-meta-list]')).toContainText(/生命周期|Review/);
    const memoryGovernanceActionCard = page.locator('[data-memory-governance-card][data-memory-kind="memory"]').first();
    await expect(memoryGovernanceActionCard.locator('[data-memory-inline-action-box="memory"]')).toBeVisible();
    await expect(memoryGovernanceActionCard.locator('[data-memory-inline-action-note="memory"]')).toBeVisible();
    await expect(memoryGovernanceActionCard.locator('[data-memory-inline-action-list="memory"]')).toBeVisible();
    await expect(memoryGovernanceActionCard.locator('[data-memory-inline-action-button="accepted"]')).toBeVisible();
    await expect(memoryGovernanceActionCard.locator('[data-memory-inline-action-button="needs_followup"]')).toBeVisible();
    await expect(memoryGovernanceActionCard.locator('[data-memory-inline-action-button="rejected"]')).toBeVisible();
    await expect(memoryGovernanceActionCard.locator('[data-memory-inline-action-button="refresh"]')).toBeVisible();
    const suggestionGovernanceCard = page.locator('[data-memory-governance-card][data-memory-kind="suggestion"]').first();
    await expect(suggestionGovernanceCard.locator('[data-memory-inline-action-box="suggestion"]')).toBeVisible();
    await expect(suggestionGovernanceCard.locator('[data-memory-inline-action-note="suggestion"]')).toBeVisible();
    await expect(suggestionGovernanceCard.locator('[data-memory-inline-action-list="suggestion"]')).toBeVisible();
    await expect(suggestionGovernanceCard.locator('[data-memory-inline-action-button="accept"]')).toBeVisible();
    await expect(suggestionGovernanceCard.locator('[data-memory-inline-action-button="reject"]')).toBeVisible();
    await expect(page.locator('body')).toContainText('确认执行引导是否也覆盖 memory reviewer 首屏');
    await expect(page.locator('body')).toContainText('执行引导要贯穿首页与执行现场');
  });

  await test.step('thread page still shows execution guide before diving into task flow', async () => {
    await page.goto(seeded.threadUrl, { waitUntil: 'networkidle' });

    const focusStrip = page.locator('[data-execution-focus-strip]');
    const threadFocus = page.locator('[data-thread-focus-card]');
    const threadStats = page.locator('[data-thread-stats-context="thread-focus-card"]');
    const executionChecklistCard = page.locator('[data-execution-checklist-card]');
    const threadWorkflowCard = page.locator('[data-thread-workflow-card]');
    const executionSummaryCard = page.locator('[data-execution-summary-card]');
    const composeCard = page.locator('[data-workspace-compose-card]');
    const commentSummaryCard = page.locator('[data-comment-summary-card]').first();
    const commentFilterStatus = page.locator('[data-comment-filter-status]');
    const threadEventSummaryCard = page.locator('[data-thread-event-summary-card]');
    const threadEventCardWithChecklist = page.locator('[data-thread-event-card]').filter({ hasText: '与当前闭环关系' }).first();
    const threadTaskCard = page.locator('[data-thread-task-card]').first();
    const commentFocusCard = page.locator('[data-comment-focus-card]');
    const visibleCommentFocusEntry = page.locator('[data-comment-focus-entry]:not(.is-hidden)');
    const commentThreadCard = page.locator('[data-comment-thread-card]').first();
    const decisionCard = page.locator('[data-decision-card]').first();
    await expect(focusStrip).toContainText('当前执行引导');
    await expect(focusStrip).toContainText('当前节点');
    await expect(focusStrip).toContainText('这一步验收');
    await expect(focusStrip).toContainText('Checkpoint 规则');
    await expect(focusStrip).toContainText(/红灯待拍板|红灯拍板|黄灯绕行中|黄灯绕行/);
    await expect(focusStrip).toContainText('最近证据');
    await expect(focusStrip).toContainText(/证据现场：(历史层残留|线程治理现场)/);
    await expect(focusStrip).toContainText('打开证据现场');
    await expect(focusStrip).toContainText(/打开待治理线程|打开最近源位置|打开源位置/);
    await expect(threadFocus).toContainText('当前闭环关系');
    await expect(threadFocus).toContainText('执行清单：4 / 5 已收口');
    await expect(threadFocus.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(threadFocus.locator('[data-scene-card-context-block="checklist-relation"]')).toContainText('当前闭环关系');
    await expect(threadFocus.locator('[data-thread-state-guidance-block="state"]')).toContainText(/待拍板线程|已接回执行线程/);
    await expect(threadFocus.locator('[data-thread-state-guidance-block="action"]')).toContainText(/补拍板|继续产生命令/);
    await expect(threadStats).toContainText(/待拍板|线程事件|关联任务|红灯数量/);
    await expect(threadStats.locator('[data-thread-stat="open-decisions"]')).toContainText('待拍板');
    await expect(threadStats.locator('[data-thread-stat="events"]')).toContainText('线程事件');
    await expect(threadStats.locator('[data-thread-stat="related-tasks"]')).toContainText('关联任务');
    await expect(threadStats.locator('[data-thread-stat="red-signals"]')).toContainText('红灯数量');
    await expect(threadStats.locator('[data-thread-stat="open-decisions"] [data-thread-stat-value]')).toBeVisible();
    await expect(threadStats.locator('[data-thread-stat="events"] [data-thread-stat-value]')).toBeVisible();
    await expect(threadStats.locator('[data-thread-stat="related-tasks"] [data-thread-stat-value]')).toBeVisible();
    await expect(threadStats.locator('[data-thread-stat="red-signals"] [data-thread-stat-value]')).toBeVisible();
    await expect(executionChecklistCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(executionChecklistCard.locator('[data-thread-state-guidance-block="summary"]')).toContainText(/红灯|接回执行链/);
    await expect(executionChecklistCard.locator('[data-scene-card-body-context="execution-checklist-card"]')).toContainText('闭环进度');
    await expect(executionChecklistCard.locator('[data-scene-card-body-middle-context="execution-checklist-card"]')).toContainText(/验收条件|推进规则|自动唤醒/);
    await expect(executionChecklistCard.locator('[data-scene-card-body-middle="execution-checklist-details"]')).toContainText(/闭环进度|已完成|进行中|待执行/);
    await expect(executionChecklistCard.locator('[data-checklist-progress]')).toContainText('闭环进度');
    await expect(executionChecklistCard.locator('[data-checklist-progress-fill]')).toBeVisible();
    await expect(executionChecklistCard.locator('[data-meta-grid-context="execution-checklist-card"]')).toContainText(/当前主闭环|验收条件/);
    await expect(executionChecklistCard.locator('[data-checklist-kpis]')).toContainText(/已完成|进行中|待执行/);
    await expect(executionChecklistCard.locator('[data-checklist-mini-grid]')).toContainText('当前焦点');
    await expect(threadWorkflowCard).toContainText('与当前闭环关系');
    await expect(threadWorkflowCard).toContainText('执行清单：4 / 5 已收口');
    await expect(threadWorkflowCard.locator('[data-thread-inline-action-box="workflow"]')).toBeVisible();
    await expect(threadWorkflowCard.locator('[data-thread-inline-action-note="workflow"]')).toBeVisible();
    await expect(threadWorkflowCard.locator('[data-thread-inline-action-list="workflow"]')).toBeVisible();
    await expect(threadWorkflowCard.locator('[data-thread-inline-action-button="continue"]')).toBeVisible();
    await expect(threadWorkflowCard.locator('[data-thread-inline-action-button="improve"]')).toBeVisible();
    await expect(threadWorkflowCard.locator('[data-thread-inline-action-button="retry"]')).toBeVisible();
    await expect(threadWorkflowCard.locator('[data-thread-inline-action-button="stop"]')).toBeVisible();
    await expect(executionSummaryCard).toContainText('当前关联闭环');
    await expect(executionSummaryCard).toContainText('执行清单：4 / 5 已收口');
    await expect(executionSummaryCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(executionSummaryCard.locator('[data-scene-card-context-block="checklist-relation"]')).toContainText('当前关联闭环');
    await expect(executionSummaryCard.locator('[data-thread-state-guidance-block="summary"]')).toContainText(/红灯|接回执行链/);
    await expect(executionSummaryCard.locator('[data-scene-card-body-context="execution-summary-card"]')).toContainText('卡点原因');
    await expect(executionSummaryCard.locator('[data-scene-card-body-middle-context="execution-summary-card"]')).toContainText(/为什么现在处理|影响范围|证据/);
    await expect(executionSummaryCard.locator('[data-scene-card-body-middle="execution-summary-details"]')).toContainText(/卡点原因|需要你做什么/);
    await expect(executionSummaryCard.locator('[data-workflow-next-block="blocker-reason"]')).toContainText('卡点原因');
    await expect(executionSummaryCard.locator('[data-workflow-next-block="requested-human-action"]')).toContainText('需要你做什么');
    await expect(executionSummaryCard.locator('[data-meta-grid-context="execution-summary-card"]')).toContainText(/为什么现在处理|影响范围|证据/);
    await expect(composeCard).toContainText('当前关联闭环');
    await expect(composeCard).toContainText('执行清单：4 / 5 已收口');
    await expect(composeCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(composeCard.locator('[data-scene-card-context-block="checklist-relation"]')).toContainText('当前关联闭环');
    await expect(composeCard.locator('[data-thread-inline-action-box="compose"]')).toBeVisible();
    await expect(composeCard.locator('[data-thread-inline-action-note="compose"]')).toBeVisible();
    await expect(composeCard.locator('[data-thread-inline-action-list="compose"]')).toBeVisible();
    await expect(composeCard.locator('[data-thread-inline-action-button="comment"]')).toBeVisible();
    await expect(composeCard.locator('[data-thread-inline-action-button="yellow"]')).toBeVisible();
    await expect(composeCard.locator('[data-thread-inline-action-button="red"]')).toBeVisible();
    await expect(commentSummaryCard).toContainText('当前关联闭环');
    await expect(commentSummaryCard).toContainText('执行清单：4 / 5 已收口');
    await expect(commentSummaryCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(commentSummaryCard.locator('[data-scene-card-context-block="checklist-relation"]')).toContainText('当前关联闭环');
    await expect(commentFilterStatus).toContainText('当前关联闭环');
    await expect(commentFilterStatus).toContainText('执行清单：4 / 5 已收口');
    await expect(commentFilterStatus.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(commentFilterStatus.locator('[data-scene-card-context-block="checklist-relation"]')).toContainText('当前关联闭环');
    await expect(threadEventSummaryCard).toContainText('当前关联闭环');
    await expect(threadEventSummaryCard).toContainText('执行清单：4 / 5 已收口');
    await expect(threadEventSummaryCard).toContainText('命令');
    await expect(threadEventSummaryCard).toContainText('Checkpoint');
    await expect(threadEventSummaryCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(threadEventSummaryCard.locator('[data-scene-card-context-block="checklist-relation"]')).toContainText('当前关联闭环');
    await expect(threadEventCardWithChecklist).toContainText('与当前闭环关系');
    await expect(threadEventCardWithChecklist).toContainText('执行清单：4 / 5 已收口');
    await expect(threadEventCardWithChecklist).toContainText('跳到关联子任务');
    await expect(threadEventCardWithChecklist.locator('[data-scene-card-context-block="thread-state"]')).toContainText('线程状态');
    await expect(threadEventCardWithChecklist.locator('[data-scene-card-context-block="checklist-relation"]')).toContainText('与当前闭环关系');
    await expect(threadTaskCard).toContainText('与当前闭环关系');
    await expect(threadTaskCard).toContainText('执行清单：4 / 5 已收口');
    await expect(threadTaskCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('线程状态');
    await expect(threadTaskCard.locator('[data-scene-card-context-block="checklist-relation"]')).toContainText('与当前闭环关系');
    await expect(commentFocusCard).toContainText('当前判断');
    await expect(commentFocusCard).toContainText('当前节点');
    await expect(commentFocusCard).toContainText('与当前闭环关系');
    await expect(commentFocusCard).toContainText('执行清单：4 / 5 已收口');
    await expect(commentThreadCard).toContainText('当前判断');
    await expect(commentThreadCard).toContainText('与当前闭环关系');
    await expect(commentThreadCard).toContainText('执行清单：4 / 5 已收口');
    await expect(commentThreadCard.locator('[data-thread-inline-action-box="comment"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-note="comment"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="comment-reply"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="comment-reply"] [data-thread-inline-action-button="comment"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="comment-promote"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="comment-promote"] [data-thread-inline-action-button="continue"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="comment-promote"] [data-thread-inline-action-button="yellow"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="comment-promote"] [data-thread-inline-action-button="red"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-box="inbox"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="inbox"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="inbox"] [data-thread-inline-action-button="resolve"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="inbox"] [data-thread-inline-action-button="archive"]')).toBeVisible();
    await expect(commentThreadCard.locator('[data-thread-inline-action-list="inbox"] [data-thread-inline-action-button="snooze"]')).toBeVisible();
    await expect(decisionCard).toContainText('当前判断');
    await expect(decisionCard).toContainText('与当前闭环关系');
    await expect(decisionCard).toContainText('执行清单：4 / 5 已收口');
    await expect(decisionCard.locator('[data-thread-inline-action-box="decision"]')).toBeVisible();
    await expect(decisionCard.locator('[data-thread-inline-action-note="decision"]')).toBeVisible();
    await expect(decisionCard.locator('[data-thread-inline-action-list="decision"]')).toBeVisible();
    await expect(decisionCard.locator('[data-thread-inline-action-button="approved"]')).toBeVisible();
    await expect(decisionCard.locator('[data-thread-inline-action-button="changes_requested"]')).toBeVisible();
    await expect(decisionCard.locator('[data-thread-inline-action-button="retry_requested"]')).toBeVisible();
    await expect(decisionCard.locator('[data-thread-inline-action-button="stopped"]')).toBeVisible();
    await expect(decisionCard.locator('[data-scene-card-body-context="decision-card"]')).toContainText('与当前闭环关系');
    await expect(commentThreadCard.locator('[data-scene-card-body-context="comment-thread-card"]')).toContainText('与当前闭环关系');
    await expect(visibleCommentFocusEntry.locator('[data-scene-card-body-context="comment-focus-card"]')).toContainText('当前判断');
    await expect(threadWorkflowCard.locator('[data-scene-card-body-context="thread-workflow-card"]')).toContainText('与当前闭环关系');
    await expect(threadWorkflowCard.locator('[data-scene-card-body-middle-context="thread-workflow-card"]')).toContainText('命令');
    await expect(threadWorkflowCard.locator('[data-scene-card-body-middle="thread-workflow-details"]')).toContainText('Checkpoint');
    await expect(decisionCard.locator('[data-scene-card-workflow-context="decision-card"]')).toContainText('当前判断');
    await expect(commentThreadCard.locator('[data-scene-card-workflow-context="comment-thread-card"]')).toContainText('当前判断');
    await expect(visibleCommentFocusEntry.locator('[data-scene-card-workflow-context="comment-focus-card"]')).toContainText('当前判断');
    await expect(threadWorkflowCard.locator('[data-scene-card-workflow-context="thread-workflow-card"]')).toContainText('下一步');
    await expect(decisionCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(commentThreadCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(threadWorkflowCard.locator('[data-scene-card-context-block="thread-state"]')).toContainText('当前状态');
    await expect(threadWorkflowCard.locator('[data-thread-state-guidance-block="state"]')).toContainText(/待拍板线程|已接回执行线程/);
    await expect(threadWorkflowCard.locator('[data-thread-state-guidance-block="summary"]')).toContainText(/红灯|接回执行链/);
    await expect(threadWorkflowCard.locator('[data-thread-state-guidance-block="action"]')).toContainText(/补拍板|继续产生命令/);
    await page.locator('[data-comment-filter="resolved"]').click();
    await expect(commentFilterStatus).toContainText('当前聚焦：历史层 · 0 条');
    await expect(visibleCommentFocusEntry).toContainText('当前筛选里暂时没有可展开的评论节点');
    await expect(visibleCommentFocusEntry).toContainText('回到评论线程列表');
    await page.locator('[data-comment-filter="triage"]').click();
    await expect(commentFilterStatus).toContainText('当前聚焦：待分流 · 1 条');
    await expect(visibleCommentFocusEntry).toContainText('当前评论还停在 triage，还没有安全地接回执行链。');
    await expect(page.locator('body')).toContainText('查看任务流转');
    await expect(page.locator('body')).toContainText('Browser UAT：doc / thread 首屏是否也会直接露出红灯拍板入口？');
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: seeded.projectId,
        threadKey: seeded.threadKey,
        decisionId: seeded.decisionId,
        memoryId: seeded.memoryId,
        workspaceUrl: seeded.workspaceUrl,
        executionDocUrl: seeded.executionDocUrl,
        memoryDocUrl: seeded.memoryDocUrl,
        threadUrl: seeded.threadUrl,
        checkedAt: new Date().toISOString(),
        artifactDir: testInfo.outputDir,
      },
      null,
      2,
    ),
  );
});
