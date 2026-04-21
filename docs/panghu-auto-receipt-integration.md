# 胖虎自动回执接入清单

目标：

- 让胖虎不再依赖手工跑 `npm run agent:receipt`
- 在企业 IM 侧任务真正完成后，自动把结果回写到 Cortex
- 如果原任务来自 Notion 评论，同时自动回到原 discussion

## Cortex 这边已经准备好的部分

- 转交入口：`POST /webhook/codex-message`
- 回执入口：`POST /webhook/agent-receipt`
- 仓内 `src/panghu-poller.js` 已支持“发送成功后自动 POST delivery receipt”
- outbox payload 已经会透传：
  - `command_id`
  - `callback_url`
  - `source`
  - `source_url`
  - `project_id`

也就是说：

- Cortex 已经能把任务交给胖虎
- Cortex 也已经能接收胖虎完成后的回执
- 如果你用的是这个仓里的 `panghu-poller`，delivery receipt 已经默认自动回写
- 如果你用的是企业 IM 侧独立 poller / worker，还需要它在任务完成时主动调一下 `callback_url`

## 胖虎侧最小需要做的事

当胖虎收到一条 handoff 消息后：

1. 解析消息里的 `payload`
2. 保存 `payload.command_id`
3. 保存 `payload.callback_url`
4. 当这条任务完成、失败、取消时，调用 `payload.callback_url`

补充：

- 如果胖虎接到的 handoff 不是来自默认本地 `19100`，要么让 Cortex 在 bridge 请求里带上 `callback_base_url`
- 要么在 Cortex 进程里配置 `CORTEX_BASE_URL`
- 否则 handoff 里的 `payload.callback_url` 会默认指向 `http://127.0.0.1:19100/webhook/agent-receipt`
- 当前这台机器对外可达的 live 地址是 `http://192.168.0.10:19100`
- 企业 IM 侧真实 poller 如果不和 Cortex 跑在同一个 localhost 里，轮询地址和 callback 地址都应该优先指向这个 `192.168.0.10` 地址

## 推荐回调 payload

更省事的做法：

- 如果胖虎这边改动成本高，优先用轻量 alias 字段
- Cortex 现在已经兼容 `commandId / agentName / receiptType / signalLevel / sessionId / idempotencyKey`
- `summary / details / metrics / artifacts / decision_context` 也可以直接放顶层，不必手动再包一层 `payload`
- 如果胖虎发送链路里最容易拿到的是 `outbox_id`，现在也可以直接回：
  - `outbox_id`
  - `status=delivered|failed|acknowledged|read`
  - `channel`
  - `session_id`
- Cortex 会自动从 outbox handoff payload 反推出 `command_id / agent_name / project_id`，并自动把对应 outbox 标成 `sent/failed`

这条轻量回调已经在 live `19100` 真机验证通过。

最小成功回调：

```json
{
  "commandId": "CMD-20260402-044",
  "agentName": "panghu",
  "status": "success",
  "receiptType": "result",
  "summary": "lightweight callback live ok",
  "details": "posted after automation restart using alias fields only",
  "metrics": {
    "processed_count": 1
  },
  "signalLevel": "green",
  "channel": "hiredcity",
  "target": "your-target@example.com",
  "sessionId": "your-target@example.com",
  "idempotencyKey": "panghu-callback-live-20260402-002"
}
```

如果胖虎当前完成发送后最容易直接拿到的是 outbox 发送事件，也可以直接这样回：

```json
{
  "outbox_id": 7,
  "status": "delivered",
  "delivered_at": 1743650000,
  "channel": "hiredcity",
  "session_id": "your-target@example.com"
}
```

这条格式已在 live `19100` 验证通过：

- 自动反推出 `command_id=CMD-20260403-008`
- 自动反推出 `agent_name=agent-panghu`
- 自动写入 `RCP-20260403-001`
- 自动把 `outbox_id=7` 从 `pending` 更新成 `sent`

成功：

```json
{
  "command_id": "CMD-20260402-008",
  "agent_name": "agent-panghu",
  "status": "completed",
  "receipt_type": "result",
  "channel": "hiredcity",
  "target": "your-target@example.com",
  "payload": {
    "summary": "胖虎已完成企业 IM 侧执行，并返回处理结果。"
  },
  "signal": "green",
  "result_summary": "胖虎已完成企业 IM 侧执行，并返回处理结果。",
  "reply_text": "胖虎已完成这条任务，结果已回写到 Cortex。",
  "next_step": "如果需要，可以继续派发下一条任务给胖虎。",
  "idempotency_key": "panghu-CMD-20260402-008-result-001"
}
```

失败：

```json
{
  "command_id": "CMD-20260402-008",
  "agent_name": "agent-panghu",
  "status": "failed",
  "receipt_type": "alert",
  "channel": "hiredcity",
  "target": "your-target@example.com",
  "signal": "yellow",
  "result_summary": "胖虎执行失败：企业 IM 侧接口超时。",
  "reply_text": "这条任务执行失败了，我已经把错误回写到 Cortex。"
}
```

高风险异常：

```json
{
  "command_id": "CMD-20260402-008",
  "agent_name": "agent-panghu",
  "status": "failed",
  "receipt_type": "alert",
  "channel": "hiredcity",
  "target": "your-target@example.com",
  "signal": "red",
  "result_summary": "胖虎发现权限异常，已停止继续执行。",
  "reply_text": "发现高风险异常，已经停止执行并回写 Cortex。"
}
```

## 最小 curl 示例

```bash
curl -X POST http://127.0.0.1:19100/webhook/agent-receipt \
  -H 'Content-Type: application/json' \
  -d '{
    "command_id": "CMD-20260402-008",
    "agent_name": "agent-panghu",
    "status": "completed",
    "receipt_type": "result",
    "channel": "hiredcity",
    "target": "your-target@example.com",
    "signal": "green",
    "result_summary": "胖虎已完成企业 IM 侧执行，并返回处理结果。",
    "reply_text": "胖虎已完成这条任务，结果已回写到 Cortex。"
  }'
```

如果你要尽量少改胖虎代码，可以直接用轻量版：

```bash
curl -X POST http://127.0.0.1:19100/webhook/agent-receipt \
  -H 'Content-Type: application/json' \
  -d '{
    "commandId": "CMD-20260402-044",
    "agentName": "panghu",
    "status": "success",
    "receiptType": "result",
    "summary": "胖虎已完成企业 IM 侧执行",
    "details": "处理了 2 条记录",
    "metrics": {"processed_count": 2, "success_count": 2},
    "signalLevel": "green",
    "channel": "hiredcity",
    "target": "your-target@example.com",
    "sessionId": "your-target@example.com",
    "idempotencyKey": "panghu-CMD-20260402-044-result-001"
  }'
```

## 已提供的现成脚本

仓库里已经补好：

`hooks/task-complete.sh`

以及：

`npm run agent:complete`

用法：

```bash
bash hooks/task-complete.sh <command_id> <signal> <summary> [details] [metrics_json] [status] [receipt_type]
```

示例：

```bash
bash hooks/task-complete.sh \
  CMD-20260402-008 \
  green \
  "胖虎已完成企业 IM 侧执行" \
  "处理了 2 条记录" \
  '{"processed_count":2,"success_count":2}'
```

脚本默认：

- `CORTEX_BASE_URL=http://127.0.0.1:19100`
- `PROJECT_ID=PRJ-cortex`
- `SESSION_ID=your-target@example.com`
- `CHANNEL=hiredcity`
- `TARGET=your-target@example.com`
- `AGENT_NAME=agent-panghu`

也支持通过环境变量覆盖。

推荐优先用 handoff payload 里的 `callback_url`：

```bash
CALLBACK_URL="$PAYLOAD_CALLBACK_URL" \
bash hooks/task-complete.sh \
  "$COMMAND_ID" \
  green \
  "胖虎已完成企业 IM 侧执行" \
  "处理了 2 条记录" \
  '{"processed_count":2,"success_count":2}'
```

这样胖虎侧不需要自己再拼 `/webhook/agent-receipt` 路径，只要保存 Cortex 交过来的 `payload.callback_url` 即可。

如果你是在测试环境、预发环境或非 `19100` 端口联调，记得让 Cortex 生成正确的 `payload.callback_url`：

```json
{
  "callback_base_url": "http://127.0.0.1:3011"
}
```

或者在 Cortex 进程里配置：

```bash
export CORTEX_BASE_URL='http://127.0.0.1:3011'
```

如果胖虎更适合直接跑 Node CLI，也可以用：

```bash
npm run agent:complete -- \
  --handoff-json "$HANDOFF_PAYLOAD_JSON" \
  --agent agent-panghu \
  --signal green \
  --summary "胖虎已完成企业 IM 侧执行" \
  --details "处理了 2 条记录" \
  --metrics-json '{"processed_count":2,"success_count":2}'
```

## 你这边如果要帮忙，最小只需要 1 件事

把下面任意一种能力交给我：

- 胖虎执行端的完成回调 hook 在哪里加
- 胖虎执行端负责发企业 IM 的那段代码路径
- 如果不能改代码，那就告诉我“任务完成”事件最终会落在哪个 webhook / 脚本 / 消息格式上

## 最佳协作方式

如果你能提供其中任意一个，我就能继续把自动回调补上：

- 胖虎消息发送/执行的代码目录
- 胖虎完成任务时可插入的函数名或回调点
- 一个真实完成事件样例
- 一个可以接收 `HTTP POST` 的胖虎侧中转点

## 不需要你再做的事

- 不需要再补 Cortex 协议
- 不需要再手动跑 receipt CLI
- 不需要再补 Notion 侧权限

现在真正缺的只有：胖虎侧在完成时把结果发回来。
