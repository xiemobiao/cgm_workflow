# Quick Trace（最短排查路径）

目标：给一份 Logan/JSONL 日志，用最少操作定位“链路卡在哪”：
连接 → READY → getData → 入库 → publish → delivered → ACK。

## 1) 一条命令（本地离线）

支持两种输入：
- 解码后的 JSONL（每行 outer JSON，字段 `c/f/l/...`）
- Logan 加密二进制文件（平台同款解密逻辑；需配置 KEY/IV）

```bash
# JSONL
npm run logs:quick-trace -- --file /path/to/decoded.jsonl

# Logan 二进制（如需要）
LOGAN_DECRYPT_KEY=xxxxxxxxxxxxxxxx LOGAN_DECRYPT_IV=xxxxxxxxxxxxxxxx \
  npm run logs:quick-trace -- --file /path/to/logan.bin
```

常用过滤：
```bash
npm run logs:quick-trace -- --file /path/to/decoded.jsonl --deviceSn SN123
npm run logs:quick-trace -- --file /path/to/decoded.jsonl --attemptId <attemptId>
npm run logs:quick-trace -- --file /path/to/decoded.jsonl --linkCode <linkCode>
npm run logs:quick-trace -- --file /path/to/decoded.jsonl --requestId <requestId>
```

输出含义（摘要）：
- `status=ack_ok/ack_timeout/stall_timeout/persist_timeout/index_gap_blocked/incomplete`
- `auth/ready/getData/done/publish/ack`：从 connectStart 起算的关键节点耗时（缺失为 `-`）
- `topErrorCode`：本次过滤范围内的错误码 TopN

## 2) 线上定位建议（字段优先级）

1. `attemptId`（最强）：一次真实连接尝试的链路主键（连接/鉴权/数据/入库/上传/ACK 尽量都能串起来）
2. `linkCode`：一次连接会话（可能包含多次连接尝试）
3. `requestId`（MQTT=msgId）：一次 publish/ACK 批次
4. `deviceSn/deviceMac`：设备维度聚合

## 3) 看到这些 errorCode，直接按“固定套路”排

- `DATA_STREAM_STALL_TIMEOUT`：数据流停滞兜底（先看 connect/READY 是否完成、getData 是否发出、lastRaw/persistedMax/pendingCallbacks）
- `DATA_PERSIST_TIMEOUT`：入库确认超时（通常伴随缺口/卡住；结合 `INDEX_GAP_BLOCKED` 看 expected/actualFirst）
- `INDEX_GAP_BLOCKED`：严格顺序入库卡住（缺中间 index；优先补缺口而不是“继续上传”）
- `ACK_PENDING`：已有在途批次等待 ACK（看 delivered/ACK 超时与重试是否正常）
- `ACK_TIMEOUT`：ACK 超时回退重试（看 topic/msgId/requestId/serverIndex/rollback）
- `MQTT_PUBLISH_FAILED`：publish 失败进入退避（看网络/鉴权/断线重连）

