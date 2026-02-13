import { mastra } from '@/mastra';
import { NextResponse } from 'next/server';

const RESOURCE_ID = 'weather-chat';

export async function GET() {
  const memory = await mastra.getAgentById('weather-agent').getMemory();

  if (!memory) {
    return NextResponse.json({ threads: [] });
  }

  const result = await memory.listThreads({
    filter: { resourceId: RESOURCE_ID },
    orderBy: { field: 'createdAt', direction: 'DESC' },
  });

  return NextResponse.json({ threads: result.threads });
}

export async function POST(req: Request) {
  const memory = await mastra.getAgentById('weather-agent').getMemory();

  if (!memory) {
    return NextResponse.json({ error: 'Memory not configured' }, { status: 500 });
  }

  const { title } = await req.json();

  const thread = await memory.createThread({
    resourceId: RESOURCE_ID,
    title: title || 'New chat',
  });

  return NextResponse.json({ thread });
}
