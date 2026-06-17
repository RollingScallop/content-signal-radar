#!/usr/bin/env node
// Extract markdown from JSON and send to Telegram

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Load .env manually
const envPath = join(homedir(), '.content-signal-radar', '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  }
} catch(e) {}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = '1037041869';
const MAX_LEN = 4000;

async function sendMessage(text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'Markdown'
    })
  });
  return response.json();
}

async function sendDocument(text, filename = 'signal-report.md') {
  // Save to temp file
  const tmpPath = `/tmp/${filename}`;
  writeFileSync(tmpPath, text, 'utf-8');

  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  formData.append('document', new Blob([text], { type: 'text/markdown' }), filename);
  formData.append('caption', '📡 Content Signal Radar 报告');

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    body: formData
  });
  return response.json();
}

async function main() {
  // Read stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf-8');

  let markdown;
  try {
    const json = JSON.parse(input);
    markdown = json.renderedMarkdown || input;
  } catch(e) {
    markdown = input;
  }

  // Clean up the markdown for Telegram (remove markdown code blocks if any)
  markdown = markdown.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');

  if (!TELEGRAM_BOT_TOKEN) {
    console.log('No TELEGRAM_BOT_TOKEN found');
    process.exit(1);
  }

  let result;
  if (markdown.length > MAX_LEN) {
    // Send as document
    result = await sendDocument(markdown, `signal-radar-${new Date().toISOString().split('T')[0]}.md`);
  } else {
    // Send as message, splitting if needed
    const parts = [];
    while (markdown.length > MAX_LEN) {
      const part = markdown.slice(0, MAX_LEN);
      const lastNewline = part.lastIndexOf('\n');
      parts.push(part.slice(0, lastNewline));
      markdown = markdown.slice(lastNewline + 1);
    }
    parts.push(markdown);

    for (const part of parts) {
      const r = await sendMessage(part);
      if (!r.ok) {
        console.log('❌ Error:', r.description);
        return;
      }
    }
    console.log(`✅ Sent ${parts.length} message(s) to Telegram`);
    return;
  }

  if (result.ok) {
    console.log('✅ Sent document to Telegram');
  } else {
    console.log('❌ Error:', result.description);
  }
}

main().catch(console.error);