import { handleChatStream } from '@mastra/ai-sdk';
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui'
import { createUIMessageStreamResponse } from 'ai';
import { mastra } from '@/mastra';
import { NextRequest, NextResponse } from 'next/server';

const RESOURCE_ID = 'weather-chat';

export async function POST(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get('threadId');
  const params = await req.json();

  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
  }

  const stream = await handleChatStream({
    mastra,
    agentId: 'weather-agent',
    params: {
      ...params,
      memory: {
        ...params.memory,
        thread: threadId,
        resource: RESOURCE_ID,
      }
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get('threadId');

  if (!threadId) {
    return NextResponse.json([]);
  }

  const memory = await mastra.getAgentById('weather-agent').getMemory();
  let response = null;

  try {
    response = await memory?.recall({
      threadId,
      resourceId: RESOURCE_ID,
    });
  } catch {
    console.log('No previous messages found.');
  }

  const uiMessages = toAISdkV5Messages(response?.messages || []);

  return NextResponse.json(uiMessages);
}
