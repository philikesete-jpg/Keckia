import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Mail,
  Smartphone,
  Bot,
  ShieldCheck,
  Search,
  RefreshCw,
  Send,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Phone,
  Plus,
  Loader2,
  X,
  UserPlus,
} from 'lucide-react';
import {
  Conversation,
  Employee,
  FeedCalendarEvent,
  FeedConversation,
  FeedDraft,
  FeedTraveler,
  TourPackage,
} from '../../types';
import { api } from '../../lib/api';
import { OFFICIAL_WHATSAPP_NUMBER } from '../../lib/dataSyncService';
import { OmnichannelClientImportModal } from '../common/OmnichannelClientImportModal';
import { OmnichannelExtractedClient } from '../../lib/omnichannelClientImport';
import { useWorkspace } from '../../lib/workspace';
import { isAdmin } from '../../../shared/roles';

interface UnifiedInboxViewProps {
  conversations?: FeedConversation[];
  calendarEvents?: FeedCalendarEvent[];
  employees?: Employee[];
  packages?: TourPackage[];
  drafts?: FeedDraft[];
  travelers?: FeedTraveler[];
  onApproveDraft?: (draftId: string) => void;
  onOpenTravelerDossier?: (travelerId: string) => void;
  onOpenDataSync?: () => void;
  onBatchInsertOmnichannelClients?: (clients: OmnichannelExtractedClient[]) => void;
  onOpenAutomationPipeline?: () => void;
}

const WHATSAPP_TEMPLATES = [
  {
    title: 'Selam & Welcome',
    text: `Selam! Thank you for contacting EritreaVisit via our official WhatsApp (${OFFICIAL_WHATSAPP_NUMBER}). We are delighted to assist with your journey to Eritrea. How can our Asmara tour desk help you today?`,
  },
  {
    title: 'Visa on Arrival (VOA) Info',
    text: `For your Eritrea Visa on Arrival sponsorship, please provide: 1) Clear passport photo page (min 6 months validity), 2) International arrival flight itinerary into Asmara (ASM), and 3) Hotel choice in Asmara. We submit applications directly to the Department of Immigration.`,
  },
  {
    title: '1938 Steam Railway Charter',
    text: `The vintage 1938 Ansaldo steam locomotive excursion departs Asmara railway station down to Nefasit and Massawa through 30 engineering tunnels and escarpment bridges. Private charters and group photo runs are available.`,
  },
  {
    title: 'Dahlak Archipelago Permit',
    text: `Dahlak marine permits require 48 hours advance clearance with the Port of Massawa authority. Our private catamaran charters include full snorkelling/camping gear, skipper, chef, and environmental permits for Dissei and Madote.`,
  },
  {
    title: 'Asmara Airport Transfer',
    text: `Confirming your arrival transfer from Asmara International Airport (ASM). Our licensed driver will be at the terminal exit holding an EritreaVisit sign with your name.`,
  },
];

export const UnifiedInboxView: React.FC<UnifiedInboxViewProps> = ({
  conversations = [],
  calendarEvents = [],
  employees = [],
  packages = [],
  drafts = [],
  travelers = [],
  onApproveDraft,
  onOpenTravelerDossier,
  onOpenDataSync,
  onBatchInsertOmnichannelClients,
  onOpenAutomationPipeline,
}) => {
  const { user } = useWorkspace();
  const userIsAdmin = isAdmin(user?.role as any);
  const [localConversations, setLocalConversations] = useState<FeedConversation[]>(conversations);
  const [selectedChannel, setSelectedChannel] = useState<'all' | 'email' | 'whatsapp' | 'uchat'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'unanswered' | 'bot-only' | 'waiting-for-client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeConvId, setActiveConvId] = useState<string | null>(conversations[0]?.id || null);
  const [isOmnichannelModalOpen, setIsOmnichannelModalOpen] = useState(false);
  const [focusOmnichannelConv, setFocusOmnichannelConv] = useState<Conversation | null>(null);

  // Approval modal state
  const [approvingDraft, setApprovingDraft] = useState<FeedDraft | null>(null);
  const [approvedActionSuccess, setApprovedActionSuccess] = useState<string | null>(null);

  // Interactive Reply state
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySuccessNotice, setReplySuccessNotice] = useState<string | null>(null);

  // Inbound Simulation Modal state
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simName, setSimName] = useState('Marco Rossi');
  const [simPhone, setSimPhone] = useState('+39 348 9912034');
  const [simTopic, setSimTopic] = useState('Dahlak Catamaran Charter');
  const [simMessage, setSimMessage] = useState('Hello EritreaVisit (+2917190374), can we get boat charter and permit rates for 3 days in Dahlak?');
  const [isSimulating, setIsSimulating] = useState(false);

  const convertFeedConvToStandard = (fc: FeedConversation): Conversation => ({
    id: fc.id,
    channel: fc.channel === 'whatsapp' ? 'WhatsApp' : 'Email',
    clientName: fc.travelerName || 'Client',
    clientHandle:
      fc.channel === 'whatsapp'
        ? (fc as any).phoneNumber || '+2917190374'
        : `${(fc.travelerName || 'client').toLowerCase().replace(/[^a-z0-9]/g, '.')}@traveler.com`,
    subject: fc.subject || 'Tour & Travel Inquiry',
    status: fc.status === 'unanswered' ? 'Unanswered' : 'Waiting for Client',
    lastMessagePreview: fc.messages[fc.messages.length - 1]?.content || '',
    lastTimestamp: fc.lastMessageAt,
    unreadCount: fc.status === 'unanswered' ? 1 : 0,
    messages: fc.messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      senderName: m.senderName,
      text: m.content,
      timestamp: m.timestamp,
      channel: fc.channel === 'whatsapp' ? 'WhatsApp' : 'Email',
    })),
  });

  useEffect(() => {
    setLocalConversations(conversations);
    if (!activeConvId && conversations.length > 0) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations]);

  // Filter conversations
  const filteredConversations = localConversations.filter((c) => {
    if (selectedChannel !== 'all' && c.channel !== selectedChannel) return false;
    if (selectedStatus !== 'all' && c.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (c.travelerName || '').toLowerCase().includes(q);
      const matchSubject = (c.subject || '').toLowerCase().includes(q);
      const matchMsg = c.messages.some((m) => m.content.toLowerCase().includes(q));
      if (!matchName && !matchSubject && !matchMsg) return false;
    }
    return true;
  });

  const activeConversation = localConversations.find((c) => c.id === activeConvId) || filteredConversations[0] || null;

  // Linked drafts for active conversation or traveler
  const linkedDrafts = drafts.filter(
    (d) =>
      (activeConversation && d.conversationId === activeConversation.id) ||
      (activeConversation?.travelerId && d.travelerId === activeConversation.travelerId)
  );

  const getRecipientPhone = (conv: FeedConversation): string => {
    if ((conv as any).phoneNumber) return (conv as any).phoneNumber;
    const trav = travelers.find((t) => t.id === conv.travelerId);
    if (trav?.phone) return trav.phone;
    for (const msg of conv.messages) {
      const match = (msg.senderName || '').match(/\+?\d[\d\s-]{7,}\d/);
      if (match) return match[0];
    }
    return OFFICIAL_WHATSAPP_NUMBER;
  };

  const handleSendReply = async () => {
    if (!activeConversation || !replyText.trim() || isSendingReply) return;
    setIsSendingReply(true);
    setReplySuccessNotice(null);

    const recipientPhone = getRecipientPhone(activeConversation);

    try {
      const res = await api.post<any>('/whatsapp/send-reply', {
        conversationId: activeConversation.id,
        replyText: replyText.trim(),
        recipientPhone,
      });

      const newMsg = {
        id: `msg_rep_${Date.now()}`,
        sender: 'agent' as const,
        senderName: 'EritreaVisit Operations Desk',
        content: replyText.trim(),
        timestamp: new Date().toISOString(),
      };

      setLocalConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? {
                ...c,
                status: 'waiting-for-client',
                lastMessageAt: newMsg.timestamp,
                messages: [...c.messages, newMsg],
              }
            : c
        )
      );

      setReplyText('');
      setReplySuccessNotice('Reply recorded in thread and logged to audit trail.');
      setTimeout(() => setReplySuccessNotice(null), 4000);
    } catch (err: any) {
      console.warn('Reply notice:', err);
      // Fallback local update
      const newMsg = {
        id: `msg_rep_${Date.now()}`,
        sender: 'agent' as const,
        senderName: 'EritreaVisit Operations Desk',
        content: replyText.trim(),
        timestamp: new Date().toISOString(),
      };
      setLocalConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? {
                ...c,
                status: 'waiting-for-client',
                lastMessageAt: newMsg.timestamp,
                messages: [...c.messages, newMsg],
              }
            : c
        )
      );
      setReplyText('');
      setReplySuccessNotice('Reply recorded locally.');
      setTimeout(() => setReplySuccessNotice(null), 3000);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleOpenWhatsAppWeb = () => {
    if (!activeConversation) return;
    const rawPhone = getRecipientPhone(activeConversation);
    const cleanPhone = rawPhone.replace(/[^\d]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(replyText || 'Selam from EritreaVisit Tours & Travel (+2917190374)')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    if (replyText.trim()) {
      handleSendReply();
    }
  };

  const handleSimulateInbound = async () => {
    if (!simMessage.trim() || isSimulating) return;
    setIsSimulating(true);

    try {
      const res = await api.post<any>('/whatsapp/inbound', {
        senderName: simName.trim(),
        senderPhone: simPhone.trim(),
        message: simMessage.trim(),
        topic: simTopic.trim(),
      });

      if (res?.conversationId) {
        setActiveConvId(res.conversationId);
      }

      setIsSimulateModalOpen(false);
      if (onOpenDataSync) {
        // Trigger sync to refresh parent state
      }
    } catch (err) {
      console.warn('Simulation notice:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const renderChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="w-3.5 h-3.5 text-blue-600" />;
      case 'whatsapp':
        return <Smartphone className="w-3.5 h-3.5 text-emerald-600" />;
      case 'uchat':
        return <Bot className="w-3.5 h-3.5 text-purple-600" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'unanswered':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-200">
            Unanswered
          </span>
        );
      case 'bot-only':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold border border-purple-200">
            Bot-Only
          </span>
        );
      case 'waiting-for-client':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200">
            Waiting for Client
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[780px] font-sans text-slate-900">
      {/* 1. Header Toolbar */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
              Multichannel Communications
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-mono font-bold border border-emerald-200 flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-emerald-600" /> Line: {OFFICIAL_WHATSAPP_NUMBER}
            </span>
          </div>
          <h2 className="text-2xl font-serif font-bold text-slate-950 italic mt-0.5">
            Unified Client Inbox & Approval Desk
          </h2>
        </div>

        {/* Channel filter tabs & Fetch action */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium">
            {(['all', 'email', 'whatsapp', 'uchat'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setSelectedChannel(ch)}
                className={`px-3 py-1 rounded-md transition cursor-pointer capitalize ${
                  selectedChannel === ch
                    ? 'bg-white text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ch === 'all' ? 'All Channels' : ch}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsSimulateModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Simulate receiving an inbound customer WhatsApp message to test the operations response flow"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Simulate Inbound WA</span>
          </button>

          {userIsAdmin && onOpenAutomationPipeline && (
            <button
              type="button"
              onClick={onOpenAutomationPipeline}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Open Email & AI Automation for Hotels, Visa & Travel Permits"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Auto-Book Pipeline</span>
            </button>
          )}

          {onOpenDataSync && (
            <button
              onClick={onOpenDataSync}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Fetch live inquiries from tours@eritreavisit.com and WhatsApp (+2917190374)"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
              <span>Fetch Messages</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Sub-filters bar */}
      <div className="px-6 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Status filters */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mr-1">
            Status:
          </span>
          {(['all', 'unanswered', 'bot-only', 'waiting-for-client'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer border ${
                selectedStatus === st
                  ? 'bg-slate-900 border-slate-900 text-white font-bold'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {st === 'all' ? 'All' : st === 'bot-only' ? 'Bot-Only' : st === 'unanswered' ? 'Unanswered' : 'Waiting for Client'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="px-2.5 py-1 pl-7 rounded-md bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 w-52 focus:outline-hidden focus:ring-1 focus:ring-slate-400"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
        </div>
      </div>

      {/* 3. Main Split View (Left: Thread List, Right: Message Thread + Draft Approvals + Composer) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Conversation List (320px) */}
        <div className="w-80 border-r border-slate-200 overflow-y-auto bg-slate-50/50 divide-y divide-slate-100">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              No conversations found matching filters.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.id === activeConversation?.id;
              const lastMsg = conv.messages[conv.messages.length - 1];

              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`p-3.5 transition cursor-pointer space-y-1.5 ${
                    isSelected ? 'bg-white border-l-4 border-l-brand-500 shadow-2xs' : 'hover:bg-slate-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {renderChannelIcon(conv.channel)}
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {conv.travelerName || 'Guest'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(conv.lastMessageAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  {conv.subject && (
                    <div className="text-xs font-semibold text-slate-800 truncate">
                      {conv.subject}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 line-clamp-1">
                    {lastMsg ? lastMsg.content : 'No messages'}
                  </p>

                  <div className="flex items-center justify-between pt-0.5">
                    {renderStatusBadge(conv.status)}
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {conv.channel}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Conversation Thread + Draft Actions + WhatsApp Composer */}
        {activeConversation ? (
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Thread Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-800 text-xs">
                  {activeConversation.travelerName ? activeConversation.travelerName.charAt(0) : 'G'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-950 font-serif">
                      {activeConversation.travelerName || 'Client Conversation'}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1">
                      {renderChannelIcon(activeConversation.channel)} {activeConversation.channel}
                    </span>
                    {activeConversation.channel === 'whatsapp' && (
                      <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                        Line: {getRecipientPhone(activeConversation)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Subject: {activeConversation.subject || 'Direct Messaging'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {activeConversation.channel === 'whatsapp' && (
                  <a
                    href={`https://wa.me/${getRecipientPhone(activeConversation).replace(/[^\d]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1 transition border border-emerald-200 cursor-pointer shadow-2xs"
                  >
                    <span>Open WhatsApp Web</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {activeConversation.travelerId && onOpenTravelerDossier && (
                  <button
                    onClick={() => onOpenTravelerDossier(activeConversation.travelerId!)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                  >
                    View Dossier &rarr;
                  </button>
                )}
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40">
              {activeConversation.messages.map((msg) => {
                const isClient = msg.sender === 'client';
                const isBot = msg.sender === 'bot';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isClient ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 mb-1 px-1">
                      <span>{msg.senderName || (isClient ? 'Client' : isBot ? 'Bot' : 'Agent')}</span>
                      <span>·</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div
                      className={`max-w-md p-3.5 rounded-2xl text-xs leading-relaxed ${
                        isClient
                          ? 'bg-white text-slate-900 border border-slate-200 rounded-tl-sm shadow-2xs'
                          : isBot
                          ? 'bg-purple-50 text-purple-950 border border-purple-200 rounded-tr-sm'
                          : 'bg-slate-900 text-white rounded-tr-sm shadow-2xs'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Explicit Human Approval Area */}
            {linkedDrafts.length > 0 && (
              <div className="p-3 border-t border-slate-200 bg-amber-50/60 shrink-0 space-y-2">
                <div className="flex items-center justify-between text-xs text-amber-900">
                  <span className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-700" />
                    Human-In-The-Loop Draft Action ({linkedDrafts.length})
                  </span>
                  <span className="text-[10px] font-mono text-amber-800">
                    Suggestions are drafts only: no external send without approval
                  </span>
                </div>

                <div className="space-y-1.5">
                  {linkedDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="p-2.5 rounded-xl bg-white border border-amber-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-slate-900">{draft.title}</div>
                        <div className="text-[11px] text-slate-600 truncate">
                          {draft.proposedAction}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setApprovingDraft(draft)}
                          className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                        >
                          Review & Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interactive Response Composer */}
            <div className="p-3.5 border-t border-slate-200 bg-white shrink-0 space-y-2.5">
              {/* Template Picker Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase shrink-0">
                  Templates:
                </span>
                {WHATSAPP_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => setReplyText(tpl.text)}
                    className="px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition cursor-pointer shrink-0 border border-slate-200"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Write ${activeConversation.channel === 'whatsapp' ? 'WhatsApp' : 'official'} response to ${activeConversation.travelerName || 'client'}...`}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center gap-2 text-xs">
                  {replySuccessNotice && (
                    <span className="text-emerald-700 font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      {replySuccessNotice}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {activeConversation.channel === 'whatsapp' && (
                    <button
                      type="button"
                      onClick={handleOpenWhatsAppWeb}
                      className="px-3.5 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>WhatsApp Web &rarr;</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isSendingReply}
                    className="px-4 py-1.5 rounded-xl brand-gradient text-white text-xs font-bold transition shadow-brand hover:brightness-105 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSendingReply ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Record Reply</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400 italic">
            Select a conversation on the left to read messages and review draft suggestions.
          </div>
        )}
      </div>

      {/* 4. INBOUND WHATSAPP SIMULATOR MODAL */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 text-slate-900 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-bold text-slate-950">
                    Simulate WhatsApp Client Message
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Inbound to Asmara operations line: {OFFICIAL_WHATSAPP_NUMBER}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Client Name
                </label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Sender Phone Number
                </label>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs text-slate-900 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Inquiry Topic
                </label>
                <input
                  type="text"
                  value={simTopic}
                  onChange={(e) => setSimTopic(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  WhatsApp Message Body
                </label>
                <textarea
                  value={simMessage}
                  onChange={(e) => setSimMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSimulateModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSimulateInbound}
                disabled={!simMessage.trim() || isSimulating}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSimulating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5" />
                )}
                <span>Receive Message in Inbox</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. APPROVAL CONFIRMATION MODAL */}
      {approvingDraft && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 text-slate-900 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-amber-700 font-bold">
                  Explicit Operational Approval Required
                </span>
                <h3 className="text-base font-serif font-bold text-slate-950 mt-1">
                  {approvingDraft.title}
                </h3>
              </div>
              <button
                onClick={() => setApprovingDraft(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-slate-600 font-semibold">Proposed Operational Action:</div>
              <p className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 leading-relaxed font-mono text-[11px]">
                {approvingDraft.proposedAction}
              </p>

              {approvingDraft.details?.body && (
                <div className="space-y-1 pt-1">
                  <div className="text-slate-600 font-semibold">Prepared Message Content:</div>
                  <div className="p-3 bg-slate-100 rounded-xl text-slate-900 text-xs italic">
                    "{approvingDraft.details.body}"
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>By clicking confirm, this draft will be approved and recorded in the audit trail.</span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setApprovingDraft(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel Draft
              </button>
              <button
                onClick={() => {
                  if (onApproveDraft) onApproveDraft(approvingDraft.id);
                  setApprovingDraft(null);
                  setApprovedActionSuccess('Action approved and logged to audit trail.');
                  setTimeout(() => setApprovedActionSuccess(null), 3000);
                }}
                className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
              >
                Approve & Execute Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
