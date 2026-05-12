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

async function seedWorkspaceHomeFeedbackProject() {
  const suffix = Date.now();
  const projectId = `PRJ-cortex-live-browser-home-feedback-${suffix}`;
  const pageId = `page-browser-home-feedback-${suffix}`;
  const discussionId = `discussion-browser-home-feedback-${suffix}`;
  const commentId = `comment-browser-home-feedback-${suffix}`;
  const threadKey = `notion:${pageId}:${discussionId}`;
  const decisionNote = '先按首页这条指引继续推进。';
  const replyBody = '我先确认看到了这条评论，随后把执行结果补回当前线程。';

  await postJson('/projects/upsert', {
    project_id: projectId,
    root_page_url: 'https://www.notion.so/Cortex-35beb0c2e3f780309d79ddb2bd3c44b6',
    review_window_note: 'Browser UAT · homepage feedback',
  });

  const decisionResult = await postJson('/decisions', {
    project_id: projectId,
    signal_level: 'red',
    question: 'Browser UAT：首页拍板后刷新回来还能继续看到 feedback 吗？',
    recommendation: '先直接在首页完成一次拍板，再确认成功反馈没有丢。',
    why_now: '这是当前 workspace 首页协同动作是否形成闭环的最后一段 live UAT。',
    impact_scope: 'module',
    requested_human_action: '确认首页 feedback 是否持续可见。',
    source_url: `notion://page/${pageId}/discussion/${discussionId}`,
  });

  await postJson('/webhook/notion-comment', {
    project_id: projectId,
    target_type: 'page',
    target_id: pageId,
    page_id: pageId,
    discussion_id: discussionId,
    comment_id: commentId,
    body: 'Browser UAT：请直接在首页评论回流中枢里回复这条评论。',
    owner_agent: 'agent-router',
    source_url: `notion://page/${pageId}/discussion/${discussionId}/comment/${commentId}`,
  });

  return {
    projectId,
    threadKey,
    decisionNote,
    replyBody,
    decisionId: decisionResult.decision.decisionId,
  };
}

test('workspace homepage comment and decision actions keep success feedback after refresh', async ({
  page,
}, testInfo) => {
  const seeded = await seedWorkspaceHomeFeedbackProject();
  const workspaceUrl = `${baseUrl}/workspace?project_id=${encodeURIComponent(seeded.projectId)}`;

  await page.goto(workspaceUrl, {
    waitUntil: 'networkidle',
  });

  await expect(page.locator('#execution-checklist')).toContainText('4 / 5 已收口');
  await expect(page.locator('#execution-checklist')).toContainText('还剩 1 个闭环需要继续推进');
  await expect(page.locator('#comment-workflow-center')).toContainText('待分流评论');
  await expect(page.locator('#decision-center')).toContainText('红灯待拍板');

  const commentCenter = page.locator('#comment-workflow-center');
  const replyBox = commentCenter.locator('[data-home-comment-box]').first();
  const feedbackBanner = page.locator('[data-workspace-action-feedback]');
  const expectedReplyFeedback = `首页动作已写回 · 线程回复：${seeded.replyBody}`;
  await replyBox.locator('[data-home-comment-note]').fill(seeded.replyBody);
  await replyBox.locator('[data-home-comment-target="reply"][data-home-comment-action="comment"]').click();

  await expect(feedbackBanner).toHaveAttribute('data-tone', 'success');
  await expect(feedbackBanner).toContainText(expectedReplyFeedback);
  await expect(commentCenter).toContainText('最近事件：线程回复 · 已归档');
  await expect(commentCenter.locator('[data-home-comment-audit-item="thread_reply"]').first()).toContainText(
    seeded.replyBody,
  );

  const decisionCenter = page.locator('#decision-center');
  const decisionBox = decisionCenter.locator('[data-home-decision-box]').first();
  const expectedDecisionFeedback = `首页动作已写回 · 决策拍板：${seeded.decisionNote}`;
  await decisionBox.locator('[data-home-decision-note]').fill(seeded.decisionNote);
  await decisionBox.locator('[data-home-decision-action="approved"]').click();

  await expect(feedbackBanner).toHaveAttribute('data-tone', 'success');
  await expect(feedbackBanner).toContainText(expectedDecisionFeedback);
  await expect(decisionCenter).toContainText('当前没有红灯待拍板事项');
  await expect(page.locator('#execution-checklist')).toContainText('4 / 5 已收口');

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: seeded.projectId,
        threadKey: seeded.threadKey,
        decisionId: seeded.decisionId,
        replyBody: seeded.replyBody,
        decisionNote: seeded.decisionNote,
        workspaceUrl,
        checkedAt: new Date().toISOString(),
        artifactDir: testInfo.outputDir,
      },
      null,
      2,
    ),
  );
});
