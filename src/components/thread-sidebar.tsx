'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type Thread = {
  id: string;
  title?: string;
  resourceId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

interface ThreadSidebarProps {
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: (threadId: string) => void;
}

export function ThreadSidebar({
  activeThreadId,
  onSelectThread,
  onNewThread,
}: ThreadSidebarProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/threads');
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (err) {
      console.error('Failed to fetch threads:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleNewThread = async () => {
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New chat' }),
      });
      const data = await res.json();
      const thread = data.thread;
      setThreads((prev) => [thread, ...prev]);
      onNewThread(thread.id);
    } catch (err) {
      console.error('Failed to create thread:', err);
    }
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/threads/${threadId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        const remaining = threads.filter((t) => t.id !== threadId);
        if (remaining.length > 0) {
          onSelectThread(remaining[0].id);
        } else {
          handleNewThread();
        }
      }
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full w-64 border-r border-border bg-sidebar">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-sidebar-foreground">Threads</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleNewThread}
          title="New chat"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">
              Loading...
            </p>
          )}

          {!loading && threads.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">
              No threads yet
            </p>
          )}

          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              className={cn(
                'group flex items-center gap-2 w-full rounded-md px-2 py-2 text-left text-sm transition-colors',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                activeThreadId === thread.id &&
                  'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
            >
              <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm">
                  {thread.title || 'New chat'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(thread.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => handleDeleteThread(thread.id, e)}
                title="Delete thread"
              >
                <Trash2 className="size-3" />
              </Button>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
