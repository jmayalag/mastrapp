import { mastra } from '@/mastra';
import { NextResponse } from 'next/server';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const memory = await mastra.getAgentById('weather-agent').getMemory();

  if (!memory) {
    return NextResponse.json({ error: 'Memory not configured' }, { status: 500 });
  }

  await memory.deleteThread(threadId);

  return NextResponse.json({ success: true });
}
