'use client';

import '@/app/globals.css';
import { useCallback, useEffect, useState } from 'react';
import { DefaultChatTransport, ToolUIPart } from 'ai';
import { useChat } from '@ai-sdk/react';

import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';

import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';

import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';

import { ThreadSidebar } from '@/components/thread-sidebar';

function ChatPanel({ threadId }: { threadId: string }) {
  const [input, setInput] = useState<string>('');

  const { messages, setMessages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/chat?threadId=${threadId}`,
    }),
  });

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?threadId=${threadId}`);
      const data = await res.json();
      setMessages([...data]);
    } catch {
      setMessages([]);
    }
  }, [threadId, setMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="flex-1 flex flex-col p-6 relative h-full">
      <Conversation className="h-full">
        <ConversationContent>
          {messages.map((message) => (
            <div key={message.id}>
              {message.parts?.map((part, i) => {
                if (part.type === 'text') {
                  return (
                    <Message
                      key={`${message.id}-${i}`}
                      from={message.role}>
                        <MessageContent>
                          <MessageResponse>{part.text}</MessageResponse>
                        </MessageContent>
                    </Message>
                  );
                }

                if (part.type?.startsWith('tool-')) {
                  return (
                    <Tool key={`${message.id}-${i}`}>
                      <ToolHeader
                        type={(part as ToolUIPart).type}
                        state={(part as ToolUIPart).state || 'output-available'}
                        className="cursor-pointer"
                      />
                      <ToolContent>
                        <ToolInput input={(part as ToolUIPart).input || {}} />
                        <ToolOutput
                          output={(part as ToolUIPart).output}
                          errorText={(part as ToolUIPart).errorText}
                        />
                      </ToolContent>
                    </Tool>
                  );
                }

                return null;
              })}
            </div>
          ))}
          <ConversationScrollButton />
        </ConversationContent>
      </Conversation>

      <PromptInput onSubmit={handleSubmit} className="mt-20">
        <PromptInputBody>
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            className="md:leading-10"
            value={input}
            placeholder="Type your message..."
            disabled={status !== 'ready'}
          />
        </PromptInputBody>
      </PromptInput>
    </div>
  );
}

function ChatPage() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const initThread = async () => {
      try {
        const res = await fetch('/api/threads');
        const data = await res.json();
        const threads = data.threads || [];

        if (threads.length > 0) {
          setActiveThreadId(threads[0].id);
        } else {
          const createRes = await fetch('/api/threads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New chat' }),
          });
          const createData = await createRes.json();
          setActiveThreadId(createData.thread.id);
        }
      } catch (err) {
        console.error('Failed to initialize thread:', err);
      } finally {
        setInitializing(false);
      }
    };

    initThread();
  }, []);

  if (initializing) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <ThreadSidebar
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThreadId}
        onNewThread={setActiveThreadId}
      />

      {activeThreadId ? (
        <ChatPanel key={activeThreadId} threadId={activeThreadId} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">
            Select or create a thread to start chatting
          </p>
        </div>
      )}
    </div>
  );
}

export default ChatPage;
