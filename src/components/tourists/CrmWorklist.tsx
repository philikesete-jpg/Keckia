import React, { useEffect, useState } from 'react';
import { eritreaDateString, formatEritreaDateTime } from '../../../shared/feedSchema';
import type { CrmPipelineStage, WebsiteEnquiry } from '../../types';

const checklist = ['Visa', 'Travel permit', 'Hotels', 'Guide and vehicle', 'Dahlak boat'] as const;
const states = ['Unreviewed', 'Pending', 'Confirmed', 'Not required'] as const;
type Requirement = typeof checklist[number];
type Readiness = typeof states[number];
type Contact = { id: string; at: string; by: string; channel: string; note: string };
type DeskLead = WebsiteEnquiry & {
  tripReadiness?: Partial<Record<Requirement, Readiness>>;
  contactHistory?: Contact[];
};
const queues = ['Follow-ups due', 'New for 24 hours', 'Arriving within 14 days', 'Pending arrangements', 'All inquiries'] as const;
type Queue = typeof queues[number];
const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const day = 86400000;

export function worklistMatch(lead: DeskLead, stage: CrmPipelineStage, queue: Queue, now: number) {
  if (queue === 'All inquiries') return true;
  if (stage === 'Completed' || lead.operationalBookingStatus === 'Cancelled') return false;
  const today = eritreaDateString(new Date(now));
  switch (queue) {
    case 'Follow-ups due':
      return Boolean(lead.nextFollowUpDate && lead.nextFollowUpDate <= today);
    case 'New for 24 hours':
      return stage === 'New Lead' && !lead.contactHistory?.length && Date.parse(lead.receivedAt) <= now - day;
    case 'Arriving within 14 days': {
      const arrival = lead.expectedTravelDate || lead.preferredDate || '';
      return arrival >= today && arrival <= eritreaDateString(new Date(now + 14 * day));
    }
    case 'Pending arrangements':
      return Object.values(lead.tripReadiness || {}).includes('Pending');
  }
}

export function quoteTotals(leads: WebsiteEnquiry[]) {
  const totals = new Map<string, number>();
  for (const lead of leads) {
    const amount = Number(lead.quotationValue);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = lead.quotationCurrency || 'USD';
    totals.set(currency, (totals.get(currency) || 0) + Math.round(amount * 100));
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, cents]) => (cents / 100).toLocaleString('en', { style: 'currency', currency, currencyDisplay: 'code' }));
}

export function CrmWorklist({ leads, stageOf, agent, canEdit, onSave }: {
  leads: DeskLead[]; stageOf: (lead: WebsiteEnquiry) => CrmPipelineStage;
  agent: string; canEdit: boolean; onSave: (lead: DeskLead) => void;
}) {
  const [queue, setQueue] = useState<Queue>('Follow-ups due');
  const [owner, setOwner] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);
  const ownerOf = (lead: DeskLead) => (lead.assignedAgent || lead.assignedTo || '').trim();
  const owners = [...new Set(leads.map(ownerOf).filter(Boolean))].sort();
  const eligible = leads.filter(lead => {
    const match = [lead.fullName, lead.phone, lead.tourTitle, lead.interestedService, lead.leadSource || lead.source, lead.country]
      .some(v => v?.toLowerCase().includes(search.trim().toLowerCase()));
    return match && (!owner || (owner === '_unassigned' ? !ownerOf(lead) : ownerOf(lead) === owner));
  });
  const keyDate = (lead: DeskLead) => queue === 'Arriving within 14 days'
    ? lead.expectedTravelDate || lead.preferredDate : queue === 'New for 24 hours' ? lead.receivedAt : lead.nextFollowUpDate;
  const rows = eligible.filter(lead => worklistMatch(lead, stageOf(lead), queue, now))
    .sort((a,b) => (keyDate(a) || '9999').localeCompare(keyDate(b) || '9999') || a.fullName.localeCompare(b.fullName));
  const selectedLead = leads.find(lead => lead.id === selected);
  return <section aria-label="Sales and trip worklist" className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h3 className="text-xl font-semibold text-slate-900">Sales and trip worklist</h3>
      <div className="flex flex-wrap gap-2">
        <input className={field} aria-label="Find an inquiry" placeholder="Name, phone, route or source" value={search} onChange={e => setSearch(e.target.value)} />
        <select className={field} aria-label="Sales agent" value={owner} onChange={e => setOwner(e.target.value)}>
          <option value="">All agents</option><option value="_unassigned">Unassigned</option>
          {owners.map(name => <option key={name}>{name}</option>)}
        </select>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">{queues.map(item => <button type="button" key={item} aria-pressed={queue === item}
      className={queue === item ? 'rounded-xl bg-slate-900 px-3 py-2 text-sm text-white' : 'rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800'}
      onClick={() => setQueue(item)}>{item} · {eligible.filter(l => worklistMatch(l, stageOf(l), item, now)).length}</button>)}</div>
    {rows.length ? <ul className="divide-y divide-slate-200">{rows.map(lead => <li key={lead.id}>
      <button type="button" onClick={() => setSelected(lead.id)} className="w-full rounded-lg py-3 px-2 text-left hover:bg-slate-50">
        <span className="block font-semibold text-slate-900">{lead.fullName}</span>
        <span className="block text-sm text-slate-600">{[lead.tourTitle || lead.interestedService, stageOf(lead), ownerOf(lead) || 'Unassigned',
          lead.nextFollowUpDate && 'Follow up ' + lead.nextFollowUpDate,
          (lead.expectedTravelDate || lead.preferredDate) && 'Arrival ' + (lead.expectedTravelDate || lead.preferredDate)].filter(Boolean).join(' · ')}</span>
      </button></li>)}</ul> : <p className="text-sm text-slate-600">No inquiries match this queue and its filters.</p>}
    {selectedLead && <LeadHandoff key={selectedLead.id} lead={selectedLead} agent={agent} canEdit={canEdit} onSave={onSave} onClose={() => setSelected('')} />}
  </section>;
}

function LeadHandoff({ lead, agent, canEdit, onSave, onClose }: {
  lead: DeskLead; agent: string; canEdit: boolean; onSave: (lead: DeskLead) => void; onClose: () => void;
}) {
  const [changes, setChanges] = useState<DeskLead['tripReadiness']>({});
  const [next, setNext] = useState<string | null>(null);
  const [channel, setChannel] = useState('WhatsApp');
  const [note, setNote] = useState('');
  const dirty = Object.keys(changes).length > 0 || next !== null || Boolean(note.trim());
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || !dirty) return;
    const updated = { ...lead, tripReadiness: { ...lead.tripReadiness, ...changes } };
    if (next !== null) updated.nextFollowUpDate = next || undefined;
    if (note.trim()) updated.contactHistory = [...lead.contactHistory || [], {
      id: crypto.randomUUID(), at: new Date().toISOString(), by: agent, channel, note: note.trim()
    }];
    onSave(updated);
    onClose();
  }
  return <div role="dialog" aria-modal="true" aria-label={'Trip handoff for ' + lead.fullName} className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4">
    <form onSubmit={save} className="max-h-[88vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6">
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{lead.fullName}</h3>
        <p className="text-sm text-slate-600">{[lead.tourTitle || lead.interestedService, lead.phone].filter(Boolean).join(' · ')}</p></div>
        <button type="button" onClick={onClose} className={field}>Close</button></div>
      <fieldset disabled={!canEdit} className="space-y-3"><legend className="font-semibold">Trip arrangements</legend>
        <div className="grid gap-3 sm:grid-cols-2">{checklist.map(item => <label key={item} className="grid gap-1 text-sm">{item}
          <select className={field} value={changes[item] || lead.tripReadiness?.[item] || 'Unreviewed'}
            onChange={e => setChanges({ ...changes, [item]: e.target.value as Readiness })}>
            {states.map(s => <option key={s}>{s}</option>)}</select></label>)}</div>
        <label className="grid gap-1 text-sm">Next follow-up in Asmara<input type="date" className={field} value={next ?? lead.nextFollowUpDate ?? ''} onChange={e => setNext(e.target.value)} /></label>
      </fieldset>
      <div><h4 className="font-semibold">Contact history</h4>
        {!lead.contactHistory?.length && <p className="mt-1 text-sm text-slate-600">No contact logged yet.</p>}
        <ol className="divide-y">{lead.contactHistory?.slice().reverse().map(entry => <li key={entry.id} className="py-2">
          <div className="text-sm font-medium">{entry.channel} · {entry.by} · {formatEritreaDateTime(entry.at)}</div>
          <p className="whitespace-pre-wrap break-words text-sm">{entry.note}</p></li>)}</ol></div>
      {canEdit && <><label className="grid gap-1 text-sm">Contact channel<select className={field} value={channel} onChange={e => setChannel(e.target.value)}>
        {['WhatsApp', 'Email', 'Phone', 'In person'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Log a conversation<textarea className={field} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What was agreed with the traveler?" /></label>
        <button disabled={!dirty} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save changes</button></>}
    </form></div>;
}
