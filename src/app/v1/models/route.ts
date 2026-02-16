import { mastra } from '@/mastra';
import { NextRequest, NextResponse } from 'next/server';

function verifyAuth(req: NextRequest): boolean {
  const key = process.env.OPENAI_API_COMPAT_KEY;
  if (!key) return true;

  const auth = req.headers.get('authorization');
  return auth === `Bearer ${key}`;
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json(
      { error: { message: 'Invalid API key', type: 'invalid_request_error', code: 'invalid_api_key' } },
      { status: 401 },
    );
  }

  const agents = mastra.listAgents();
  const created = Math.floor(Date.now() / 1000);

  const data = Object.entries(agents).map(([, agent]) => ({
    id: agent.id,
    object: 'model' as const,
    created,
    owned_by: 'mastra',
  }));

  return NextResponse.json({ object: 'list', data });
}
