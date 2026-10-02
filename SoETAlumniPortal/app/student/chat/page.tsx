'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import {
  chatService,
  ConversationItem,
  ChatMessage,
  ParticipantInfo,
} from '@/lib/services/chatService';
import { alumniService, AlumniDirectoryItem } from '@/lib/services/alumniService';
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Search,
  X,
  AlertCircle,
  User,
} from 'lucide-react';

function ChatContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('userId') || searchParams.get('participantId');

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Chat Modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [alumniList, setAlumniList] = useState<AlumniDirectoryItem[]>([]);
  const [loadingAlumni, setLoadingAlumni] = useState(false);
  const [alumniSearch, setAlumniSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ============================================================
  // LOAD CONVERSATIONS
  // ============================================================

  const loadConversations = async (autoSelectId?: string) => {
    try {
      const data = await chatService.getConversations();
      setConversations(data);

      if (autoSelectId) {
        setSelectedConversationId(autoSelectId);
      } else if (!selectedConversationId && data.length > 0) {
        setSelectedConversationId(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
      setError(err.message || 'Failed to load conversations.');
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    async function initChat() {
      if (targetUserId && targetUserId !== user?.id) {
        try {
          const conv = await chatService.createOrGetConversation(targetUserId);
          await loadConversations(conv.id);
        } catch (err) {
          console.error('Failed to create/get direct conversation:', err);
          await loadConversations();
        }
      } else {
        await loadConversations();
      }
    }

    initChat();
  }, [user, targetUserId]);

  // ============================================================
  // LOAD MESSAGES FOR SELECTED CONVERSATION
  // ============================================================

  useEffect(() => {
    if (!selectedConversationId || !user) return;

    let isMounted = true;
    setLoadingMessages(true);
    setError(null);

    async function fetchMessages() {
      try {
        const msgs = await chatService.getMessages(selectedConversationId!);
        if (!isMounted) return;
        setMessages(msgs);
        setTimeout(scrollToBottom, 50);

        // Mark unread incoming messages as read
        const unreadIncoming = msgs.filter(
          (m) => m.sender_id !== user?.id && !m.read_by?.includes(user?.id || '')
        );

        if (unreadIncoming.length > 0) {
          for (const msg of unreadIncoming) {
            chatService.markMessageAsRead(msg.id).catch(() => {});
          }

          // Decrement local unread count
          setConversations((prev) =>
            prev.map((c) =>
              c.id === selectedConversationId ? { ...c, unread_count: 0 } : c
            )
          );
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Failed to load messages:', err);
        setError(err.message || 'Failed to load messages.');
      } finally {
        if (isMounted) setLoadingMessages(false);
      }
    }

    fetchMessages();

    return () => {
      isMounted = false;
    };
  }, [selectedConversationId, user]);

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputMessage.trim();
    if (!content || !selectedConversationId || sending) return;

    setSending(true);
    try {
      const newMsg = await chatService.sendMessage(selectedConversationId, content);
      setMessages((prev) => [...prev, newMsg]);
      setInputMessage('');

      // Update conversation list preview
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversationId
            ? { ...c, last_message: newMsg, last_message_at: newMsg.created_at }
            : c
        )
      );

      setTimeout(scrollToBottom, 50);
    } catch (err: any) {
      console.error('Failed to send message:', err);
      alert(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  // ============================================================
  // ARCHIVE / DELETE CONVERSATION
  // ============================================================

  const handleArchiveConversation = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to hide this conversation?')) return;

    try {
      await chatService.archiveConversation(conversationId);
      const remaining = conversations.filter((c) => c.id !== conversationId);
      setConversations(remaining);

      if (selectedConversationId === conversationId) {
        setSelectedConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      console.error('Failed to hide conversation:', err);
      alert(err.message || 'Failed to hide conversation.');
    }
  };

  // ============================================================
  // NEW CHAT MODAL
  // ============================================================

  const openNewChatModal = async () => {
    setShowNewChatModal(true);
    setLoadingAlumni(true);
    try {
      const data = await alumniService.getApprovedAlumni();
      setAlumniList(data.filter((a) => a.id !== user?.id));
    } catch (err) {
      console.error('Failed to load alumni directory:', err);
    } finally {
      setLoadingAlumni(false);
    }
  };

  const startChatWithAlumni = async (alumniId: string) => {
    try {
      const conv = await chatService.createOrGetConversation(alumniId);
      setShowNewChatModal(false);
      await loadConversations(conv.id);
    } catch (err: any) {
      console.error('Failed to start chat:', err);
      alert(err.message || 'Failed to start chat.');
    }
  };

  // Helper to resolve other participant in direct conversation
  const getOtherParticipant = (conv: ConversationItem): ParticipantInfo => {
    const other = conv.participants?.find((p) => p.id !== user?.id);
    return (
      other || {
        id: '',
        name: 'Chat User',
        email: '',
        role: 'user',
      }
    );
  };

  const selectedConv = conversations.find((c) => c.id === selectedConversationId);
  const activePartner = selectedConv ? getOtherParticipant(selectedConv) : null;

  const filteredAlumni = alumniList.filter(
    (a) =>
      (a.full_name || '').toLowerCase().includes(alumniSearch.toLowerCase()) ||
      (a.company && a.company.toLowerCase().includes(alumniSearch.toLowerCase())) ||
      (a.department && a.department.toLowerCase().includes(alumniSearch.toLowerCase()))
  );

  return (
    <DashboardLayout>
      <div className="flex items-center text-sm text-gray-500 mb-6">
        <span>Home</span>
        <span className="mx-2">/</span>
        <span className="font-medium text-gray-900">Chat</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex h-[calc(100vh-12rem)] overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/3 border-r border-gray-100 bg-gray-50 flex flex-col">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Conversations</h2>
            <button
              onClick={openNewChatModal}
              title="Start New Chat"
              className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-1 text-xs font-semibold px-2.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="p-6 text-center text-xs text-gray-400">Loading chats...</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">
                <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p>No conversations yet.</p>
                <button
                  onClick={openNewChatModal}
                  className="mt-3 text-blue-600 hover:text-blue-700 font-bold"
                >
                  Start a chat
                </button>
              </div>
            ) : (
              conversations.map((conv) => {
                const partner = getOtherParticipant(conv);
                const isSelected = conv.id === selectedConversationId;

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`p-4 border-l-4 cursor-pointer transition flex items-start justify-between group ${
                      isSelected
                        ? 'bg-white border-blue-600'
                        : 'hover:bg-gray-100 border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-gray-900 truncate text-sm">
                          {partner.name}{' '}
                          <span className="text-xs font-normal text-gray-500 capitalize">
                            ({partner.role})
                          </span>
                        </h3>
                        {conv.unread_count > 0 && (
                          <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {conv.last_message?.content || 'No messages yet'}
                      </p>
                    </div>

                    <button
                      onClick={(e) => handleArchiveConversation(e, conv.id)}
                      title="Hide conversation"
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="w-2/3 flex flex-col">
          {activePartner && selectedConversationId ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-900">{activePartner.name}</h2>
                  <p className="text-xs text-gray-500">
                    <span className="capitalize">{activePartner.role}</span>
                    {activePartner.email && ` • ${activePartner.email}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-500 font-medium flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>Online
                  </span>
                  <button
                    onClick={(e) => handleArchiveConversation(e, selectedConversationId)}
                    title="Hide conversation"
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Messages Container */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-gray-50">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {loadingMessages ? (
                  <div className="py-12 text-center text-xs text-gray-400">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-gray-400">
                    <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p>No messages yet. Say hello!</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === user?.id;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`p-3 max-w-sm shadow-sm text-sm break-words ${
                            isMine
                              ? 'bg-blue-600 text-white rounded-xl rounded-tr-none'
                              : 'bg-white border border-gray-200 text-gray-800 rounded-xl rounded-tl-none'
                          }`}
                        >
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 px-1">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex gap-4">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={inputMessage}
                  disabled={sending}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-full px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  type="submit"
                  disabled={sending || !inputMessage.trim()}
                  className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 text-gray-400 text-xs">
              <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
              <h3 className="font-bold text-gray-700 text-sm mb-1">Your Messages</h3>
              <p className="max-w-xs mb-4">
                Select a conversation from the sidebar or start a new direct chat with an alumni member.
              </p>
              <button
                onClick={openNewChatModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition"
              >
                Start New Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100">
            <button
              onClick={() => setShowNewChatModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Start New Conversation</h3>
            <p className="text-xs text-slate-500 mb-4">Select an alumni member to message.</p>

            <div className="relative mb-4">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={alumniSearch}
                onChange={(e) => setAlumniSearch(e.target.value)}
                placeholder="Search alumni by name, company, department..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {loadingAlumni ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading directory...</div>
              ) : filteredAlumni.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No alumni found.</div>
              ) : (
                filteredAlumni.map((alum) => (
                  <div
                    key={alum.id}
                    onClick={() => startChatWithAlumni(alum.id)}
                    className="py-3 px-2 flex items-center justify-between hover:bg-slate-50 rounded-xl cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {(alum.full_name || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate">
                          {alum.full_name}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate">
                          {alum.designation || alum.department || 'Alumni'}
                          {alum.company && ` @ ${alum.company}`}
                        </p>
                      </div>
                    </div>
                    <button className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition shrink-0">
                      Chat
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-gray-400">Loading chat...</div>}>
      <ChatContent />
    </Suspense>
  );
}
