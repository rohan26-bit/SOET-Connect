'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import { useAuth } from '@/components/AuthProvider';
import { useAccessibleDialog } from '@/hooks/useAccessibleDialog';
import {
  chatService,
  ConversationItem,
  ChatMessage,
  ChatAttachment,
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
  Paperclip,
  FileText,
  FileImage,
  Download,
  Loader2,
} from 'lucide-react';


const MAX_CHAT_FILES = 5;
const MAX_CHAT_FILE_SIZE = 10 * 1024 * 1024;
const CHAT_FILE_ACCEPT = ".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv";

function formatAttachmentSize(size: number): string {
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / (1024 * 1024)).toFixed(1) + ' MB';
}

function ChatAttachmentCard({ messageId, attachment, onError }: { messageId: string; attachment: ChatAttachment; onError?: (message: string) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const isImage = attachment.mime_type.startsWith('image/');

  useEffect(() => {
    if (!isImage || !cardRef.current) return;

    let active = true;
    let objectUrl: string | null = null;
    let requested = false;

    const loadPreview = async () => {
      if (requested) return;
      requested = true;
      try {
        const blob = await chatService.downloadAttachment(messageId, attachment.id);
        objectUrl = URL.createObjectURL(blob);
        if (active) setPreviewUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch {
        // The attachment card remains downloadable even when a preview cannot be generated.
      }
    };

    const element = cardRef.current;
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadPreview();
          observer.disconnect();
        }
      }, { rootMargin: '160px' });
      observer.observe(element);
      return () => {
        active = false;
        observer.disconnect();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    void loadPreview();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isImage, messageId, attachment.id]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await chatService.downloadAttachment(messageId, attachment.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = attachment.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Could not download this attachment.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div ref={cardRef} className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-sm">
      {isImage && previewUrl && (
        <img src={previewUrl} alt={attachment.file_name} loading="lazy" className="max-h-56 w-full bg-gray-50 object-contain" />
      )}
      <div className="flex min-w-0 items-center gap-3 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {isImage ? <FileImage className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold" title={attachment.file_name}>{attachment.file_name}</p>
          <p className="mt-0.5 text-[10px] text-gray-500">{formatAttachmentSize(attachment.size_bytes)}</p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          title="Download attachment"
          className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [archiveConfirmationId, setArchiveConfirmationId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  // New Chat Modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [alumniList, setAlumniList] = useState<AlumniDirectoryItem[]>([]);
  const [loadingAlumni, setLoadingAlumni] = useState(false);
  const [alumniLoadError, setAlumniLoadError] = useState<string | null>(null);
  const [startingChatId, setStartingChatId] = useState<string | null>(null);
  const [alumniSearch, setAlumniSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const newChatDialogRef = useAccessibleDialog<HTMLDivElement>(showNewChatModal, () => setShowNewChatModal(false));

  useEffect(() => {
    setPendingFiles([]);
  }, [selectedConversationId]);

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

  // Refresh presence and deleted-account state while the chat screen is open.
  useEffect(() => {
    if (!user?.id) return;

    let active = true;
    const refreshConversations = async () => {
      try {
        const data = await chatService.getConversations();
        if (active) setConversations(data);
      } catch (err) {
        console.warn('Unable to refresh chat presence:', err);
      }
    };

    const intervalId = window.setInterval(refreshConversations, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshConversations();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user?.id]);

  // ============================================================
  // LOAD MESSAGES FOR SELECTED CONVERSATION
  // ============================================================

  useEffect(() => {
    const currentUserId = String(user?.id || '');
    if (!selectedConversationId || !currentUserId) return;

    let isMounted = true;
    let requestInFlight = false;
    let intervalId: number | undefined;
    const knownMessageIds = new Set<string>();
    const readReceiptRequests = new Set<string>();
    const completedReadReceipts = new Set<string>();

    setLoadingMessages(true);
    setError(null);

    const markIncomingMessagesRead = (items: ChatMessage[]) => {
      const unreadIncoming = items.filter(
        (message) =>
          message.sender_id !== currentUserId
          && !message.read_by?.includes(currentUserId)
          && !readReceiptRequests.has(message.id)
          && !completedReadReceipts.has(message.id)
      );

      if (!unreadIncoming.length) return;

      // Update the active thread's unread badge immediately while read receipts
      // are being persisted by the API.
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === selectedConversationId
            ? { ...conversation, unread_count: 0 }
            : conversation
        )
      );

      for (const message of unreadIncoming) {
        readReceiptRequests.add(message.id);
        void chatService.markMessageAsRead(message.id)
          .then((result) => {
            completedReadReceipts.add(message.id);
            if (!isMounted) return;
            const readBy = Array.isArray(result.read_by)
              ? result.read_by
              : [...(message.read_by || []), currentUserId];
            setMessages((previous) =>
              previous.map((item) =>
                item.id === message.id ? { ...item, read_by: readBy } : item
              )
            );
          })
          .catch((readError) => {
            console.warn('Unable to mark an incoming chat message as read:', readError);
          })
          .finally(() => {
            readReceiptRequests.delete(message.id);
          });
      }
    };

    const fetchMessages = async (initialLoad = false) => {
      if (!isMounted || requestInFlight) return;
      if (!initialLoad && document.visibilityState !== 'visible') return;

      requestInFlight = true;
      if (initialLoad) setLoadingMessages(true);

      try {
        const fetchedMessages = await chatService.getMessages(selectedConversationId);
        if (!isMounted) return;

        const newIncomingMessages = fetchedMessages.filter(
          (message) => !knownMessageIds.has(message.id) && message.sender_id !== currentUserId
        );
        fetchedMessages.forEach((message) => knownMessageIds.add(message.id));

        setMessages(fetchedMessages);
        markIncomingMessagesRead(fetchedMessages);

        if (initialLoad) {
          window.setTimeout(scrollToBottom, 50);
        } else if (newIncomingMessages.length > 0) {
          // A new incoming message arrived in the active thread; keep the thread
          // current and refresh the inbox preview/unread metadata as well.
          window.setTimeout(scrollToBottom, 50);
          try {
            const updatedConversations = await chatService.getConversations();
            if (isMounted) {
              setConversations(
                updatedConversations.map((conversation) =>
                  conversation.id === selectedConversationId
                    ? { ...conversation, unread_count: 0 }
                    : conversation
                )
              );
            }
          } catch (conversationError) {
            console.warn('Unable to refresh chat previews after a new message:', conversationError);
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        if (initialLoad) {
          console.error('Failed to load messages:', err);
          setError(err.message || 'Failed to load messages.');
        } else {
          // Keep the existing thread visible during a transient polling failure.
          console.warn('Unable to refresh the active chat thread:', err);
        }
      } finally {
        requestInFlight = false;
        if (isMounted && initialLoad) setLoadingMessages(false);
      }
    };

    void fetchMessages(true);

    // The inbox refreshes separately; poll the selected thread as well so
    // incoming messages appear without requiring the user to switch chats.
    intervalId = window.setInterval(() => {
      void fetchMessages(false);
    }, 15_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchMessages(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isMounted = false;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [selectedConversationId, user?.id]);

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    if (pendingFiles.length + selected.length > MAX_CHAT_FILES) {
      setActionFeedback('Share up to 5 files in one message. Remove a pending file before adding more.');
      return;
    }

    const allowedExtensions = CHAT_FILE_ACCEPT.split(',');
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      const extension = '.' + (file.name.split('.').pop() || '').toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        rejected.push(file.name + ': unsupported file type.');
        continue;
      }
      if (file.size > MAX_CHAT_FILE_SIZE) {
        rejected.push(file.name + ': each file must be 10 MB or smaller.');
        continue;
      }
      if (file.size === 0) {
        rejected.push(file.name + ': empty files cannot be shared.');
        continue;
      }
      accepted.push(file);
    }

    setPendingFiles((current) => [...current, ...accepted].slice(0, MAX_CHAT_FILES));
    setActionFeedback(rejected.length ? rejected.join(' ') : null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputMessage.trim();
    if ((!content && pendingFiles.length === 0) || !selectedConversationId || sending) return;

    setSending(true);
    setActionFeedback(null);
    try {
      const newMsg = pendingFiles.length > 0
        ? await chatService.sendAttachments(selectedConversationId, content, pendingFiles)
        : await chatService.sendMessage(selectedConversationId, content);
      setMessages((prev) => [...prev, newMsg]);
      setInputMessage('');
      setPendingFiles([]);

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
      setActionFeedback(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  // ============================================================
  // ARCHIVE / DELETE CONVERSATION
  // ============================================================

  const handleArchiveConversation = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    setActionFeedback(null);
    setArchiveConfirmationId(conversationId);
  };

  const confirmArchiveConversation = async () => {
    if (!archiveConfirmationId || archiving) return;
    const conversationId = archiveConfirmationId;
    setArchiving(true);
    setActionFeedback(null);
    try {
      await chatService.archiveConversation(conversationId);
      const remaining = conversations.filter((c) => c.id !== conversationId);
      setConversations(remaining);
      setArchiveConfirmationId(null);

      if (selectedConversationId === conversationId) {
        setSelectedConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      console.error('Failed to hide conversation:', err);
      setActionFeedback(err.message || 'Failed to hide conversation.');
    } finally {
      setArchiving(false);
    }
  };

  // ============================================================
  // NEW CHAT MODAL
  // ============================================================

  const loadAlumniForNewChat = async () => {
    setLoadingAlumni(true);
    setAlumniLoadError(null);
    try {
      const data = await alumniService.getApprovedAlumni();
      setAlumniList(data.filter((a) => a.id !== user?.id));
    } catch (err) {
      console.error('Failed to load alumni directory:', err);
      setAlumniLoadError(err instanceof Error ? err.message : 'Unable to load alumni. Please try again.');
    } finally {
      setLoadingAlumni(false);
    }
  };

  const openNewChatModal = async () => {
    setShowNewChatModal(true);
    await loadAlumniForNewChat();
  };

  const startChatWithAlumni = async (alumniId: string) => {
    if (startingChatId) return;
    setStartingChatId(alumniId);
    setActionFeedback(null);
    try {
      const conv = await chatService.createOrGetConversation(alumniId);
      setShowNewChatModal(false);
      await loadConversations(conv.id);
    } catch (err: any) {
      console.error('Failed to start chat:', err);
      setActionFeedback(err.message || 'Failed to start chat.');
    } finally {
      setStartingChatId(null);
    }
  };

  // Helper to resolve other participant in direct conversation
  const getOtherParticipant = (conv: ConversationItem): ParticipantInfo => {
    const other = conv.participants?.find((p) => p.id !== user?.id);
    return (
      other || {
        id: '',
        name: 'Deleted account',
        email: '',
        role: 'former member',
        is_online: false,
        last_seen_at: null,
        is_deleted: true,
        is_available: false,
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

      {actionFeedback && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <span>{actionFeedback}</span>
          <button type="button" onClick={() => setActionFeedback(null)} aria-label="Dismiss chat message" className="shrink-0 font-bold">Dismiss</button>
        </div>
      )}

      {archiveConfirmationId && (
        <div role="group" aria-label="Confirm hiding conversation" className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-amber-900">Hide this conversation from your inbox? Your chat history will be retained.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setArchiveConfirmationId(null)} disabled={archiving} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={confirmArchiveConversation} disabled={archiving} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{archiving ? 'Hiding…' : 'Hide conversation'}</button>
          </div>
        </div>
      )}

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
              <LoadingState message="Loading messages" className="p-6" />
            ) : error && conversations.length === 0 ? (
              <div className="p-6 text-center">
                <p role="alert" className="text-xs text-rose-700">{error}</p>
                <button
                  type="button"
                  onClick={() => { setLoadingConversations(true); setError(null); void loadConversations(); }}
                  className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Retry loading conversations
                </button>
              </div>
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
                  <span className={`text-xs font-medium flex items-center ${
                    activePartner.is_available && activePartner.is_online
                      ? 'text-green-600'
                      : 'text-gray-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full mr-2 ${
                      activePartner.is_available && activePartner.is_online
                        ? 'bg-green-500'
                        : 'bg-gray-400'
                    }`}></span>
                    {activePartner.is_deleted
                      ? 'Account deleted'
                      : !activePartner.is_available
                        ? 'Unavailable'
                        : activePartner.is_online
                          ? 'Online'
                          : 'Offline'}
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
                {!activePartner.is_available && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                    {activePartner.is_deleted
                      ? 'This account has been deleted. You can still view the existing conversation and download previously shared attachments.'
                      : 'This account is currently unavailable. You can still view the existing conversation and download previously shared attachments.'}
                  </div>
                )}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {loadingMessages ? (
                  <LoadingState message="Loading messages" className="py-12" />
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
                        {msg.content && (
                          <div
                            className={`p-3 max-w-sm shadow-sm text-sm break-words ${
                              isMine
                                ? 'bg-blue-600 text-white rounded-xl rounded-tr-none'
                                : 'bg-white border border-gray-200 text-gray-800 rounded-xl rounded-tl-none'
                            }`}
                          >
                            {msg.content}
                          </div>
                        )}
                        {Boolean(msg.attachments?.length) && (
                          <div className="mt-2 flex w-full max-w-sm flex-col gap-2">
                            {msg.attachments.map((attachment) => (
                              <ChatAttachmentCard key={attachment.id} messageId={msg.id} attachment={attachment} onError={setActionFeedback} />
                            ))}
                          </div>
                        )}
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
              <form onSubmit={handleSendMessage} className="border-t border-gray-100 bg-white p-3 sm:p-4">
                {pendingFiles.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {pendingFiles.map((file, index) => (
                      <div key={file.name + file.lastModified + index} className="flex max-w-full items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-800">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[180px] truncate" title={file.name}>{file.name}</span>
                        <span className="shrink-0 text-[10px] text-blue-600">{formatAttachmentSize(file.size)}</span>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                          title="Remove file"
                          className="rounded p-0.5 hover:bg-blue-100 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 sm:gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={CHAT_FILE_ACCEPT}
                    onChange={handleFilesSelected}
                    className="hidden"
                    aria-label="Choose chat attachments"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || !activePartner.is_available || pendingFiles.length >= MAX_CHAT_FILES}
                    title="Attach files (up to 5, 10 MB each)"
                    className="shrink-0 rounded-full p-3 text-gray-500 transition hover:bg-gray-100 hover:text-blue-600 disabled:opacity-40"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    type="text"
                    placeholder={activePartner.is_available ? 'Type a message...' : 'Account unavailable'}
                    value={inputMessage}
                    disabled={sending || !activePartner.is_available}
                    onChange={(e) => setInputMessage(e.target.value)}
                    className="min-w-0 flex-1 rounded-full border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={sending || !activePartner.is_available || (!inputMessage.trim() && pendingFiles.length === 0)}
                    className="shrink-0 rounded-full bg-blue-600 p-3 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Send message"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-2 pl-1 text-[10px] text-gray-400">
                  PDF, Office documents, images, TXT and CSV · Up to 5 files · 10 MB each
                </p>
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
        <div ref={newChatDialogRef} tabIndex={-1} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewChatModal(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="new-chat-title" tabIndex={-1} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100">
            <button
              onClick={() => setShowNewChatModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 id="new-chat-title" className="text-lg font-bold text-slate-900 mb-1">Start New Conversation</h3>
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

            {actionFeedback && (
              <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{actionFeedback}</p>
            )}
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {loadingAlumni ? (
                <LoadingState message="Loading alumni profiles" className="py-8" />
              ) : alumniLoadError ? (
                <div className="py-6 text-center">
                  <p role="alert" className="mb-3 text-xs text-rose-700">{alumniLoadError}</p>
                  <button type="button" onClick={loadAlumniForNewChat} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Retry loading alumni</button>
                </div>
              ) : filteredAlumni.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No alumni found.</div>
              ) : (
                filteredAlumni.map((alum) => (
                  <button
                    type="button"
                    key={alum.id}
                    onClick={() => startChatWithAlumni(alum.id)}
                    disabled={startingChatId !== null}
                    className="w-full py-3 px-2 flex items-center justify-between text-left hover:bg-slate-50 rounded-xl transition disabled:opacity-50"
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
                    <span className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg shrink-0">
                      {startingChatId === alum.id ? 'Opening…' : 'Chat'}
                    </span>
                  </button>
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
    <Suspense fallback={<LoadingState message="Loading messages" className="p-8" />}>
      <ChatContent />
    </Suspense>
  );
}
