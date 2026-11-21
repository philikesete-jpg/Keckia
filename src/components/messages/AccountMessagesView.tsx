import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Download, FileText, MessageSquare, Paperclip, Plane, Search, Send, ShieldCheck, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Ticket } from '../../types';

type Account = { id: number; fullName: string; username: string; role: string };
type DirectMessage = { id: string; senderId: number; recipientId: number; senderName: string; kind: string; content: string; timestamp: string; readAt?: string; fulfilledAt?: string; ticket?: Partial<Ticket>; attachment?: { name: string; type: string; size: number } };
type Summary = { peer: string; latest: DirectMessage; unread: number };
const initials = (name: string) => name.split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase();
const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-600';

export function AccountMessagesView({ currentUserId, tickets, dispatch }: { currentUserId: number; tickets: Ticket[]; dispatch: React.ReactNode }) {
  const [mode, setMode] = useState('private');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [peer, setPeer] = useState<number | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [search, setSearch] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState('text');
  const [ticketId, setTicketId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const activePeer = useRef(peer);
  activePeer.current = peer;
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = accounts.find(account => account.id === peer);
  const refreshInbox = useCallback(async () => {
    const result = await api.get<{ rows: Summary[] }>('messaging/inbox');
    setSummaries(result.rows);
  }, []);
  const refreshThread = useCallback(async (id: number) => {
    const result = await api.get<{ rows: DirectMessage[] }>(`messaging/messages?peer=${id}`);
    if (activePeer.current !== id) return;
    setMessages(result.rows);
    await api.post('messaging/read', { peerId: id });
  }, []);
  useEffect(() => {
    let alive = true;
    api.get<{ rows: Account[] }>('messaging/accounts').then(result => { if (alive) setAccounts(result.rows); }).catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); });
    const update = () => refreshInbox().catch(err => { if (alive) setError(err.message); });
    update();
    const timer = setInterval(update, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [refreshInbox]);
  useEffect(() => {
    if (!peer) return;
    setThreadLoading(true);
    setMessages([]); setContent(''); setFile(null); setKind('text'); setTicketId(''); setError('');
    const update = () => refreshThread(peer).catch(err => { if (activePeer.current === peer) setError(err.message); });
    update().finally(() => { if (activePeer.current === peer) setThreadLoading(false); });
    const timer = setInterval(update, 4000);
    return () => clearInterval(timer);
  }, [peer, refreshThread]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!peer || sending) return;
    const target = peer;
    setSending(true); setError('');
    try {
      let attachment;
      if (file) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read this file.'));
          reader.readAsDataURL(file);
        });
        attachment = { name: file.name, type: file.type, base64 };
      }
      await api.post('messaging/messages', { recipientId: target, content, kind, ticketId, attachment });
      if (activePeer.current === target) { setContent(''); setFile(null); setKind('text'); setTicketId(''); }
      await refreshThread(target); await refreshInbox();
    } catch (err: any) { setError(err.message); }
    finally { setSending(false); }
  }
  async function download(message: DirectMessage) {
    setDownloading(message.id); setError('');
    try {
      const result = await api.get<{ name: string; type: string; base64: string }>(`messaging/attachment/${message.id}`);
      const bytes = Uint8Array.from(atob(result.base64), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: result.type }));
      const link = document.createElement('a'); link.href = url; link.download = result.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) { setError(err.message); }
    finally { setDownloading(null); }
  }
  const visible = accounts.filter(account => `${account.fullName} ${account.username} ${account.role}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const aSummary = summaries.find(item => Number(item.peer) === a.id);
    const bSummary = summaries.find(item => Number(item.peer) === b.id);
    return (bSummary?.latest.timestamp || '').localeCompare(aSummary?.latest.timestamp || '') || a.fullName.localeCompare(b.fullName);
  });
  return <div className="space-y-5 pb-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] uppercase tracking-[0.25em] font-bold text-amber-700 mb-2">EritreaVisit / Team workspace</p><h2 className="text-3xl font-serif font-bold text-slate-900">Messages</h2><p className="text-sm text-slate-500 mt-2">Exchange tickets, request passport copies, and keep every handover together.</p></div>
      <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold"><button onClick={() => setMode('private')} className={`rounded-lg px-4 py-2 ${mode === 'private' ? 'bg-white shadow-sm' : ''}`}>Account messages</button><button onClick={() => setMode('dispatch')} className={`rounded-lg px-4 py-2 ${mode === 'dispatch' ? 'bg-white shadow-sm' : ''}`}>Dispatch hub</button></div>
    </div>
    {mode === 'dispatch' ? dispatch : <>
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
      <div className="grid md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm min-h-[640px]">
        <aside className={`bg-stone-50 border-r border-slate-200 ${peer ? 'hidden md:block' : ''}`}>
          <div className="p-5 border-b border-slate-200"><div className="flex justify-between items-center mb-4"><h3 className="font-semibold text-slate-800">Team accounts</h3><span className="text-xs text-slate-500">{accounts.length}</span></div><label className="relative block"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input aria-label="Search accounts" placeholder="Find a colleague…" value={search} onChange={event => setSearch(event.target.value)} className={`${field} pl-9`}/></label></div>
          <div className="max-h-[560px] overflow-y-auto p-2">
            {loading ? <div className="p-4 space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-200 rounded-xl"/>)}</div> : !visible.length ? <p className="p-5 text-sm text-slate-500">{search ? 'No matching accounts.' : 'No other active accounts yet. An administrator can add staff in Accounts.'}</p> : visible.map(account => {
              const summary = summaries.find(item => Number(item.peer) === account.id);
              return <button key={account.id} disabled={sending} onClick={() => setPeer(account.id)} className={`w-full rounded-xl text-left p-3 flex gap-3 mb-1 transition-colors ${peer === account.id ? 'bg-amber-100/70' : 'hover:bg-stone-100'}`}><span className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${peer === account.id ? 'bg-amber-800 text-white' : 'bg-stone-200 text-stone-600'}`}>{initials(account.fullName)}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold truncate">{account.fullName}</span>{Number(summary?.unread) > 0 && <span className="rounded-full bg-amber-800 text-white text-[10px] px-1.5 py-0.5">{summary?.unread}</span>}</span><span className="block text-[10px] tracking-wider text-amber-800 mt-0.5">{account.role.replaceAll('_', ' ')}</span><span className="block truncate text-xs text-slate-500 mt-1">{summary ? summary.latest.content || (summary.latest.ticket ? 'Shared a ticket' : 'Sent a document') : `Start a conversation · @${account.username}`}</span></span></button>;
            })}
          </div>
        </aside>
        <section className={`min-w-0 flex flex-col ${!peer ? 'hidden md:flex' : ''}`}>
          {!selected ? <div className="flex-1 flex flex-col items-center justify-center p-12 text-center"><span className="bg-amber-50 p-5 rounded-2xl text-amber-800 mb-5"><MessageSquare size={32} strokeWidth={1.4}/></span><h3 className="text-2xl font-serif text-slate-800">Every handover, in one place.</h3><p className="text-sm text-slate-500 max-w-sm mt-3 leading-relaxed">Choose a colleague to send a message, share a ticket, or request a passenger’s passport copy.</p></div> : <>
            <header className="p-5 border-b border-slate-200 flex justify-between items-center gap-3"><div><button disabled={sending} onClick={() => setPeer(null)} className="md:hidden text-xs text-amber-800 mb-2">← All accounts</button><h3 className="font-semibold text-slate-900">{selected.fullName}</h3><p className="text-xs text-slate-500 mt-1">{selected.role.replaceAll('_', ' ')} · @{selected.username}</p></div><span className="flex items-center gap-1.5 text-[11px] text-slate-500"><ShieldCheck size={15}/>Private conversation</span></header>
            <div role="log" aria-label="Conversation" aria-live="polite" className="flex-1 h-[380px] max-h-[520px] overflow-y-auto p-4 sm:p-6 bg-stone-50/40 space-y-5">
              {threadLoading ? <p className="text-sm text-slate-500">Loading conversation…</p> : !messages.length ? <p className="text-center text-xs text-slate-500 py-14">No messages yet. Start the conversation below.</p> : <><p className="text-center text-[10px] text-slate-400">Showing up to 200 recent messages · Updates every 4 seconds</p>{messages.map(message => {
                const mine = message.senderId === currentUserId;
                return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className="max-w-[90%] sm:max-w-[80%]"><div className={`rounded-2xl p-4 text-sm ${mine ? 'bg-slate-800 text-white rounded-br-sm' : 'bg-white border border-slate-200 rounded-bl-sm text-slate-800'}`}>
                  {message.kind === 'passport_request' && <div className="border-b border-current/15 pb-2 mb-2"><span className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={16}/>Passport copy requested</span><span className="text-[10px] opacity-70">{message.fulfilledAt ? 'Received' : 'Awaiting passport copy'}</span></div>}
                  {message.ticket && <div className="mb-3 p-3 rounded-xl bg-amber-50 text-slate-800 border border-amber-200"><div className="text-[10px] uppercase tracking-widest text-amber-800 flex gap-2 items-center mb-2"><Plane size={14}/>Shared ticket</div><p className="font-semibold">{message.ticket.passengerName || message.ticket.touristName}</p><p className="mt-1">{message.ticket.route || [message.ticket.origin, message.ticket.destination].filter(Boolean).join(' → ') || message.ticket.airline}</p><p className="text-xs mt-2">{message.ticket.ticketNumber} · {message.ticket.pnr || message.ticket.bookingRef}</p><p className="text-xs mt-1">{message.ticket.departureDate} {message.ticket.departureTime} · {message.ticket.status}</p></div>}
                  {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                  {message.attachment && <button disabled={downloading === message.id} onClick={() => download(message)} className="mt-3 flex items-center gap-3 rounded-lg border border-current/20 p-3 w-full text-left hover:opacity-75"><FileText size={20}/><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{message.attachment.name}</span><span className="text-[10px] opacity-70">{Math.ceil(message.attachment.size / 1024)} KB · {downloading === message.id ? 'Downloading…' : 'Download'}</span></span><Download size={15}/></button>}
                  {message.kind === 'passport_request' && !message.fulfilledAt && (mine ? <button className="mt-3 text-xs underline" onClick={async () => { try { await api.post(`messaging/fulfill/${message.id}`); await refreshThread(selected.id); } catch (err: any) { setError(err.message); } }}>Mark passport received</button> : <button className="mt-3 text-xs underline" onClick={() => { setKind('text'); setContent(`Passport copy for: ${message.content}`); fileInput.current?.click(); }}>Reply with passport copy</button>)}
                </div><p className={`text-[10px] text-slate-400 mt-1.5 flex gap-1 items-center ${mine ? 'justify-end' : ''}`}>{new Date(message.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{mine && (message.readAt ? <><CheckCheck size={13}/>Read</> : <><Check size={13}/>Sent</>)}</p></div></div>;
              })}</>}
              <div ref={end}/>
            </div>
            <form onSubmit={send} className="p-4 border-t border-slate-200 space-y-3">
              <div className="flex gap-2 flex-wrap">{[{ value: 'text', label: 'Message', icon: MessageSquare }, { value: 'ticket', label: 'Send ticket', icon: Plane }, { value: 'passport_request', label: 'Request passport', icon: ShieldCheck }].map(item => <button key={item.value} type="button" disabled={sending} onClick={() => setKind(item.value)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${kind === item.value ? 'bg-amber-100 text-amber-900' : 'text-slate-500 hover:bg-slate-100'}`}><item.icon size={14}/>{item.label}</button>)}</div>
              {kind === 'ticket' && <label className="block text-xs text-slate-600">Ticket to share<select required value={ticketId} disabled={sending} onChange={event => setTicketId(event.target.value)} className={`${field} mt-1`}><option value="">{tickets.length ? 'Choose a ticket…' : 'No accessible tickets. Create a ticket first.'}</option>{tickets.map(ticket => <option key={ticket.id} value={ticket.id}>{ticket.ticketNumber} · {ticket.passengerName || ticket.touristName} · {ticket.departureDate}</option>)}</select></label>}
              {kind === 'passport_request' && <p className="text-xs text-amber-800">Include the passenger’s name and booking reference. Your colleague can reply with the copy here.</p>}
              {file && <div className="flex items-center justify-between gap-2 text-xs bg-stone-100 rounded-lg p-2"><span className="truncate">{file.name} · {Math.ceil(file.size / 1024)} KB</span><button type="button" disabled={sending} aria-label="Remove attachment" onClick={() => setFile(null)}><X size={15}/></button></div>}
              <textarea aria-label="Message" maxLength={4000} required={kind === 'passport_request'} disabled={sending} rows={2} value={content} onChange={event => setContent(event.target.value)} placeholder={kind === 'passport_request' ? 'Please send the passport copy for…' : `Message ${selected.fullName.split(' ')[0]}…`} className={`${field} resize-none bg-stone-50`}/>
              <div className="flex items-center justify-between gap-2"><div><input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={event => { const next = event.target.files?.[0]; event.target.value = ''; if (!next) return; if (next.size > 2 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(next.type)) { setError('Choose a PDF, JPG, or PNG up to 2 MB.'); return; } setError(''); setFile(next); }}/><button disabled={sending} type="button" onClick={() => fileInput.current?.click()} className="text-xs text-slate-600 flex items-center gap-1.5 hover:text-amber-800"><Paperclip size={16}/>Attach document</button><p className="text-[10px] text-slate-400 mt-1">PDF, JPG, PNG · Up to 2 MB</p></div><button disabled={sending || threadLoading || (!content.trim() && !file && kind !== 'ticket') || (kind === 'ticket' && !ticketId)} className="flex items-center gap-2 rounded-xl bg-amber-800 text-white px-5 py-3 text-xs font-semibold hover:bg-amber-900 disabled:opacity-40"><Send size={15}/>{sending ? 'Sending…' : 'Send'}</button></div>
            </form>
          </>}
        </section>
      </div>
    </>}
  </div>;
}
