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
  const { model, messages, tools, tool_choice, stream = false } = body;

  const agentId = model || 'weather-agent';

  let agent;
  try {
    agent = mastra.getAgentById(agentId);
  } catch {
    return errorResponse(`Model '${agentId}' not found`, 'model_not_found', 404);
  }

  const execOptions: Record<string, unknown> = {};
  if (tools) execOptions.tools = tools;
  if (tool_choice) execOptions.toolChoice = tool_choice;

  const completionId = `chatcmpl-${nanoid()}`;
  const created = Math.floor(Date.now() / 1000);

  if (!stream) {
    const result = await agent.generate(messages, execOptions);
    const usage = result.usage;
    const toolCalls = result.toolCalls?.length
      ? result.toolCalls.map((tc, i) => ({
          index: i,
          id: tc.payload.toolCallId,
          type: 'function' as const,
          function: { name: tc.payload.toolName, arguments: JSON.stringify(tc.payload.args) },
        }))
      : undefined;

    return NextResponse.json({
      id: completionId,
      object: 'chat.completion',
      created,
      model: agentId,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: result.text || null,
            ...(toolCalls && { tool_calls: toolCalls }),
          },
          finish_reason: toolCalls ? 'tool_calls' : 'stop',
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

  const { fullStream } = await agent.stream(messages, execOptions);
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

      let toolCallIndex = 0;
      const toolIndexMap = new Map<string, number>();
      let hasToolCalls = false;

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
          } else if (chunk.type === 'tool-call-input-streaming-start') {
            hasToolCalls = true;
            const idx = toolCallIndex++;
            toolIndexMap.set(chunk.payload.toolCallId, idx);
            send({
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: agentId,
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index: idx,
                    id: chunk.payload.toolCallId,
                    type: 'function',
                    function: { name: chunk.payload.toolName, arguments: '' },
                  }],
                },
                finish_reason: null,
              }],
            });
          } else if (chunk.type === 'tool-call-delta') {
            const idx = toolIndexMap.get(chunk.payload.toolCallId) ?? 0;
            send({
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: agentId,
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index: idx,
                    function: { arguments: chunk.payload.argsTextDelta },
                  }],
                },
                finish_reason: null,
              }],
            });
          } else if (chunk.type === 'finish') {
            const usage = chunk.payload?.output?.usage;
            send({
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: agentId,
              choices: [{ index: 0, delta: {}, finish_reason: hasToolCalls ? 'tool_calls' : 'stop' }],
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
