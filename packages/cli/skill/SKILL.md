---
name: moemail
description: Use when an AI agent needs a temporary/disposable email address — for receiving verification emails, testing email integrations, or any task requiring a temporary inbox via the moemail CLI
---

# MoeMail — Temporary Email for AI Agents

## Overview
MoeMail provides disposable email addresses with an agent-first CLI (`moemail`). Create inboxes, wait for messages, read content, and send emails programmatically.

## Install

Install the MoeMail CLI globally when it is not already available:

```bash
npm i -g @moemail/cli
```

Then confirm the binary is available:

```bash
moemail --help
```

## Setup

Configure once per environment:
```bash
moemail config set api-url https://moemail.app
moemail config set api-key YOUR_API_KEY
```

Or via environment variables: `MOEMAIL_API_URL`, `MOEMAIL_API_KEY`.

## Core Workflow: Receive an Email

```bash
# 1. Create inbox — capture ONCE, parse both fields
RESULT=$(moemail --json create --expiry 1h)
ID=$(echo "$RESULT" | jq -r '.id')
EMAIL=$(echo "$RESULT" | jq -r '.address')

# 2. Use $EMAIL wherever needed (registration, forms, etc.)

# 3. Wait for message (exits when message arrives or times out)
MSG=$(moemail --json wait --email-id "$ID" --timeout 120)
MSG_ID=$(echo "$MSG" | jq -r '.messageId')

# 4. Read full message content
moemail --json read --email-id "$ID" --message-id "$MSG_ID"
```

To wait for a specific sender or provider:

```bash
moemail --json wait --email-id "$ID" --provider openai --timeout 120
moemail --json wait --email-id "$ID" --from openai.com --timeout 120
```

## Command Reference

| Command | Required Options | Notable Options |
|---------|-----------------|-----------------|
| `config set` | `<key> <value>` | keys: `api-url`, `api-key` |
| `create` | — | `--name`, `--domain`, `--expiry` (1h\|24h\|3d\|permanent) |
| `list` | — | `--email-id` (lists messages in mailbox), `--cursor`, `--from`, `--provider` |
| `wait` | `--email-id` | `--timeout` (default 120s), `--interval` (default 5s), `--from`, `--provider` |
| `read` | `--email-id`, `--message-id` | `--format` (text\|html) |
| `send` | `--email-id`, `--to`, `--subject`, `--content` | — |
| `delete` | `--email-id` | — |

**Always put `--json` before the subcommand:**
```bash
moemail --json create --expiry 24h   # ✅ correct
moemail create --expiry 24h --json   # ❌ wrong position
```

## JSON Output Shapes

**create:** `{ "id": "...", "address": "user@domain.com", "expiresAt": "2025-..." }`

**wait:** `{ "messageId": "...", "from": "...", "subject": "...", "receivedAt": "2025-..." }`

**read:** `{ "id": "...", "from": "...", "to": "...", "subject": "...", "content": "plain text", "html": "...", "receivedAt": "..." }`

**send:** `{ "success": true, "remainingEmails": 10 }`

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Calling `create` twice to get id + address | Call once, save to variable, parse both fields |
| `--json` after subcommand | Move `--json` before the subcommand |
| Timeout too short for slow services | Use `--timeout 300` for unreliable senders |
| Inbox expired mid-test | Use `--expiry permanent` for long-running workflows |
| Using `content` field for HTML emails | Check both `content` (plain text) and `html` fields |
