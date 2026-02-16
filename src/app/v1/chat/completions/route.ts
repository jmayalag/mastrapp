import { mastra } from '@/mastra';
import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

function verifyAuth(req: NextRequest): boolean {
  const key = process.env.OPENAI_API_COMPAT_KEY;
  if (!key) return true;

  const auth = req.headers.get('authorization');
  return auth === `Bearer ${key}`;
}

function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', code } },
    { status },
  );
}

export async function POST(req: NextRequest) {
  if (!verifyAuth(req)) {
    return errorResponse('Invalid API key', 'invalid_api_key', 401);
  }

  const body = await req.json();
  const { model, messages, stream = false } = body;

  const agentId = model || 'weather-agent';

  let agent;
  try {
    agent = mastra.getAgentById(agentId);
  } catch {
    return errorResponse(`Model '${agentId}' not found`, 'model_not_found', 404);
  }

  const completionId = `chatcmpl-${nanoid()}`;
  const created = Math.floor(Date.now() / 1000);

  if (!stream) {
    const result = await agent.generate(messages);
    const usage = result.usage;
    return NextResponse.json({
      id: completionId,
      object: 'chat.completion',
      created,
      model: agentId,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.text },
          finish_reason: 'stop',
        },
      ],
      usage: usage
        ? {
            prompt_tokens: usage.inputTokens ?? 0,
            completion_tokens: usage.outputTokens ?? 0,
            total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
          }
        : undefined,
    });
  }

  const { fullStream } = await agent.stream(messages);
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model: agentId,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      });

      try {
        for await (const chunk of fullStream) {
          if (chunk.type === 'text-delta') {
            send({
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: agentId,
              choices: [{ index: 0, delta: { content: chunk.payload.text }, finish_reason: null }],
            });
          } else if (chunk.type === 'finish') {
            const usage = chunk.payload?.output?.usage;
            send({
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: agentId,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: usage
                ? {
                    prompt_tokens: usage.inputTokens ?? 0,
                    completion_tokens: usage.outputTokens ?? 0,
                    total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
                  }
                : undefined,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stream error';
        send({
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: agentId,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          error: { message },
        });
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
