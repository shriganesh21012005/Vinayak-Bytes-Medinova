import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, ChevronUp, Sparkles, Trash2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: "Hi! I'm your MediNova AI health assistant. I can answer general health questions and, if you've uploaded medical records, I'll factor your personal health profile into my responses.\n\nHow can I help you today?",
};

const API_BASE = '/api';

const ChatAssistant = () => {
  const { isAuthenticated, accessToken, refreshAccessToken } = useAuth();
  const { toast } = useToast();

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        if (isChatOpen && !isMinimized) {
          setIsMinimized(true);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isChatOpen, isMinimized]);

  const loadHistory = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/chat/history`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json() as { messages: Array<{ role: 'user' | 'assistant'; content: string }> };
      if (data.messages.length > 0) {
        setMessages(data.messages);
      }
    } catch {
      // silently ignore — welcome message stays
    }
  }, []);

  const openChat = useCallback(async () => {
    setIsChatOpen(true);
    setIsMinimized(false);
    setTimeout(() => inputRef.current?.focus(), 100);

    if (isAuthenticated && accessToken && !historyLoaded) {
      setHistoryLoaded(true);
      await loadHistory(accessToken);
    }
  }, [isAuthenticated, accessToken, historyLoaded, loadHistory]);

  // Reset history-loaded flag when auth state changes
  useEffect(() => {
    setHistoryLoaded(false);
    setMessages([WELCOME_MESSAGE]);
  }, [isAuthenticated]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    return refreshAccessToken();
  }, [accessToken, refreshAccessToken]);

  const handleSendMessage = useCallback(async () => {
    const text = inputMessage.trim();
    if (!text || isLoading || isStreaming) return;

    if (!isAuthenticated) {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: "To use the AI Health Assistant, please sign in or create a free account. Your responses will then be personalised based on your uploaded health records.",
        },
      ]);
      setInputMessage('');
      return;
    }

    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    const token = await getToken();
    if (!token) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Your session has expired. Please sign in again to continue." },
      ]);
      setIsLoading(false);
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${API_BASE}/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ message: text }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' })) as { error: string };
        throw new Error(errData.error ?? 'Request failed');
      }

      setIsLoading(false);
      setIsStreaming(true);
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const jsonStr = part.slice(6).trim();
          if (!jsonStr) continue;

          let event: { type: string; content?: string; message?: string };
          try {
            event = JSON.parse(jsonStr) as typeof event;
          } catch {
            continue;
          }

          if (event.type === 'chunk' && event.content) {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + event.content,
                };
              }
              return updated;
            });
          } else if (event.type === 'done') {
            break;
          } else if (event.type === 'error') {
            throw new Error(event.message ?? 'Stream error');
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          updated[updated.length - 1] = { role: 'assistant', content: msg };
        } else {
          updated.push({ role: 'assistant', content: msg });
        }
        return updated;
      });
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [inputMessage, isLoading, isStreaming, isAuthenticated, getToken, toast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleClearChat = useCallback(async () => {
    if (!isAuthenticated || !accessToken) {
      setMessages([WELCOME_MESSAGE]);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }

    try {
      await fetch(`${API_BASE}/chat`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
    } catch {
      // best-effort
    }
    setMessages([WELCOME_MESSAGE]);
    setIsLoading(false);
    setIsStreaming(false);
  }, [isAuthenticated, accessToken]);

  return (
    <div className="fixed bottom-5 right-5 z-50" ref={chatRef}>
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              height: isMinimized ? 'auto' : 480,
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'bg-white rounded-2xl shadow-2xl w-[340px] overflow-hidden flex flex-col',
              isMinimized ? 'h-auto' : 'h-[480px]'
            )}
          >
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-blue-600 to-blue-700 text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8 border-2 border-white/20">
                  <AvatarImage src="/mediNova-logo.png" alt="Bot" />
                  <AvatarFallback className="bg-blue-800 text-white text-xs">MN</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium text-sm">MediNova AI</span>
                  <span className="text-xs text-white/70 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {isAuthenticated ? 'Health-aware assistant' : 'AI Health Assistant'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isAuthenticated && !isMinimized && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleClearChat}
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-white hover:bg-white/10"
                        disabled={isStreaming}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>Clear conversation</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Button
                  onClick={() => setIsMinimized(!isMinimized)}
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-white hover:bg-white/10"
                >
                  <ChevronUp className={`h-5 w-5 transition-transform ${isMinimized ? 'rotate-180' : ''}`} />
                </Button>
                <Button
                  onClick={() => {
                    if (abortRef.current) abortRef.current.abort();
                    setIsChatOpen(false);
                  }}
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-white hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div className="flex-1 p-4 overflow-y-auto bg-gray-50 space-y-4">
                  <AnimatePresence initial={false}>
                    {messages.map((message, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className={`flex items-start gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        {message.role === 'assistant' && (
                          <Avatar className="h-7 w-7 mt-0.5 flex-shrink-0">
                            <AvatarImage src="/mediNova-logo.png" alt="AI" />
                            <AvatarFallback className="bg-blue-600 text-white text-xs">MN</AvatarFallback>
                          </Avatar>
                        )}
                        {message.role === 'user' && (
                          <Avatar className="h-7 w-7 mt-0.5 flex-shrink-0">
                            <AvatarFallback className="bg-gray-300 text-gray-700 text-xs">You</AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={cn(
                            'rounded-2xl px-3 py-2 text-sm max-w-[230px] leading-relaxed',
                            message.role === 'user'
                              ? 'bg-blue-600 text-white rounded-tr-sm'
                              : 'bg-white text-gray-900 border border-gray-200 shadow-sm rounded-tl-sm',
                            isStreaming && index === messages.length - 1 && message.role === 'assistant' && message.content === ''
                              ? 'min-w-[48px] min-h-[32px]'
                              : ''
                          )}
                        >
                          {isStreaming && index === messages.length - 1 && message.role === 'assistant' && message.content === '' ? (
                            <div className="flex space-x-1 items-center h-4">
                              {[0, 0.2, 0.4].map((delay) => (
                                <motion.div
                                  key={delay}
                                  animate={{ scale: [0.8, 1.2, 0.8] }}
                                  transition={{ repeat: Infinity, duration: 0.9, delay }}
                                  className="h-1.5 w-1.5 rounded-full bg-blue-400"
                                />
                              ))}
                            </div>
                          ) : (
                            <p className="whitespace-pre-line">{message.content}</p>
                          )}
                        </div>
                      </motion.div>
                    ))}

                    {isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-2"
                      >
                        <Avatar className="h-7 w-7 mt-0.5 flex-shrink-0">
                          <AvatarFallback className="bg-blue-600 text-white text-xs">MN</AvatarFallback>
                        </Avatar>
                        <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 border border-gray-200 shadow-sm">
                          <div className="flex space-x-1 items-center h-4">
                            {[0, 0.2, 0.4].map((delay) => (
                              <motion.div
                                key={delay}
                                animate={{ scale: [0.8, 1.2, 0.8] }}
                                transition={{ repeat: Infinity, duration: 0.9, delay }}
                                className="h-1.5 w-1.5 rounded-full bg-blue-400"
                              />
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                    <div ref={messagesEndRef} />
                  </AnimatePresence>
                </div>

                {/* Input */}
                <div className="p-3 border-t bg-white flex-shrink-0">
                  {!isAuthenticated && (
                    <div className="mb-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <LogIn className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Sign in for personalised health responses</span>
                    </div>
                  )}
                  <div className="relative rounded-xl overflow-hidden border border-gray-300 focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-blue-400 bg-white">
                    <textarea
                      ref={inputRef}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask a health question…"
                      className="w-full px-3 py-2 pr-10 text-sm max-h-24 resize-none focus:outline-none text-gray-900 bg-transparent"
                      rows={1}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isLoading || isStreaming}
                      className={cn(
                        'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors',
                        inputMessage.trim() && !isLoading && !isStreaming
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-gray-400">
                    General health information only · Not medical advice
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!isChatOpen && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={openChat}
                className="bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg flex items-center gap-2"
              >
                <Bot className="w-5 h-5" />
                <span className="hidden md:inline text-sm font-medium">AI Health Assistant</span>
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Ask our AI health assistant</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

export default ChatAssistant;
