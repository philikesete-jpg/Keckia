import React, { useState, useMemo } from 'react';
import {
  Globe,
  Mail,
  Phone,
  Users,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Inbox,
  LayoutGrid,
  List,
  Plus,
  AlertCircle,
  Clock,
  DollarSign,
  UserCheck,
  Briefcase,
  CheckCircle2,
  Link2,
  Edit3,
  ArrowRight,
  X,
  Search,
  Filter,
  Bot,
  Sparkles,
} from 'lucide-react';
import {
  WebsiteEnquiry,
  CrmPipelineStage,
  TouristProfile,
  Booking,
  TourBooking,
  Employee,
  TourPackage,
  PaymentStatus,
  Conversation,
  FeedCalendarEvent,
} from '../../types';
import { BRAND } from '../../../shared/brand';
import { useWorkspace } from '../../lib/workspace';
import { isAdmin } from '../../../shared/roles';
import { OmnichannelClientImportModal } from '../common/OmnichannelClientImportModal';
import { OmnichannelExtractedClient } from '../../lib/omnichannelClientImport';

import { CrmWorklist, quoteTotals } from './CrmWorklist';
import { eritreaDateString } from '../../../shared/feedSchema';

export const CRM_STAGES: CrmPipelineStage[] = [
  'New Lead',
  'Contacted',
  'Quotation Sent',
  'Negotiation',
  'Booked',
  'Completed',
];

const STAGE_TO_LEGACY_STATUS: Record<CrmPipelineStage, WebsiteEnquiry['status']> = {
  'New Lead': 'New',
  Contacted: 'Contacted',
  'Quotation Sent': 'Quoted',
  Negotiation: 'Quoted',
  Booked: 'Converted',
  Completed: 'Closed',
};

export function resolveLeadStage(enquiry: WebsiteEnquiry): CrmPipelineStage {
  const stage = enquiry.stage || enquiry.crmStage;
  if (stage && CRM_STAGES.includes(stage)) {
    return stage;
  }
  switch (enquiry.status) {
    case 'New':
      return 'New Lead';
    case 'Contacted':
      return 'Contacted';
    case 'Quoted':
      return 'Quotation Sent';
    case 'Converted':
      return 'Booked';
    case 'Closed':
      return 'Completed';
    default:
      return 'New Lead';
  }
}

const STAGE_STYLES: Record<CrmPipelineStage, string> = {
  'New Lead': 'bg-sky-50 text-sky-800 border-sky-200',
  Contacted: 'bg-blue-50 text-blue-800 border-blue-200',
  'Quotation Sent': 'bg-purple-50 text-purple-800 border-purple-200',
  Negotiation: 'bg-amber-50 text-amber-900 border-amber-200',
  Booked: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Completed: 'bg-slate-100 text-slate-700 border-slate-300',
};

interface WebsiteEnquiriesPanelProps {
  enquiries: WebsiteEnquiry[];
  tourists?: TouristProfile[];
  bookings?: Booking[];
  tourBookings?: TourBooking[];
  employees?: Employee[];
  packages?: TourPackage[];
  conversations?: Conversation[];
  calendarEvents?: FeedCalendarEvent[];
  /** Whether the user can edit or advance pipeline stages. */
  canEdit?: boolean;
  onUpdateEnquiry: (enquiry: WebsiteEnquiry) => void;
  onAddEnquiry?: (enquiry: WebsiteEnquiry) => void;
  onBatchInsertOmnichannelClients?: (clients: OmnichannelExtractedClient[]) => void;
  /** Called when the desk wants to turn an enquiry into a tourist record. */
  onConvert?: (enquiry: WebsiteEnquiry) => void;
  /** Creates or links a Tourist and Booking without duplicate records when a lead is Booked. */
  onConvertBookedLeadToBooking?: (
    enquiry: WebsiteEnquiry,
    options: {
      existingTouristId?: string;
      existingBookingId?: string;
      operationalStatus: NonNullable<WebsiteEnquiry['operationalBookingStatus']>;
      paymentStatus: PaymentStatus;
    }
  ) => void;
}

export const WebsiteEnquiriesPanel: React.FC<WebsiteEnquiriesPanelProps> = ({
  enquiries = [],
  tourists = [],
  bookings = [],
  tourBookings = [],
  employees = [],
  packages = [],
  conversations = [],
  calendarEvents = [],
  canEdit = false,
  onUpdateEnquiry,
  onAddEnquiry,
  onBatchInsertOmnichannelClients,
  onConvert,
  onConvertBookedLeadToBooking,
}) => {
  const { user } = useWorkspace();
  const userIsAdmin = isAdmin(user?.role as any);

  const [expanded, setExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'pipeline' | 'table' | 'worklist'>('pipeline');
  const [stageFilter, setStageFilter] = useState<'all' | CrmPipelineStage>('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state for creating or editing a lead
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<WebsiteEnquiry | null>(null);
  const [isOmnichannelModalOpen, setIsOmnichannelModalOpen] = useState(false);

  // Modal state for converting / linking a Booked lead to a Tourist & Booking without duplicates
  const [convertingLead, setConvertingLead] = useState<WebsiteEnquiry | null>(null);
  const [selectedExistingTouristId, setSelectedExistingTouristId] = useState<string>('');
  const [selectedExistingBookingId, setSelectedExistingBookingId] = useState<string>('');
  const [convOperationalStatus, setConvOperationalStatus] =
    useState<NonNullable<WebsiteEnquiry['operationalBookingStatus']>>('Confirmed');
  const [convPaymentStatus, setConvPaymentStatus] = useState<PaymentStatus>('Pending');

  // Lead Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [leadSource, setLeadSource] = useState('Website Contact Form');
  const [interestedService, setInterestedService] = useState('Guided Tour Package');
  const [tourTitle, setTourTitle] = useState('');
  const [expectedTravelDate, setExpectedTravelDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [partySize, setPartySize] = useState<number>(2);
  const [assignedAgent, setAssignedAgent] = useState('');
  const [quotationValue, setQuotationValue] = useState<number>(0);
  const [quotationCurrency, setQuotationCurrency] = useState<'USD' | 'EUR' | 'GBP' | 'CHF' | 'ERN'>('USD');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [stage, setStage] = useState<CrmPipelineStage>('New Lead');
  const [operationalBookingStatus, setOperationalBookingStatus] =
    useState<NonNullable<WebsiteEnquiry['operationalBookingStatus']>>('Unbooked');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Pending');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState('');

  const applyOmnichannelClientToLeadForm = (client: OmnichannelExtractedClient) => {
    setEditingLead(null);
    setFullName(client.fullName || '');
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setCountry(client.country || client.nationality || 'International');
    setLeadSource(client.leadSource || `Omnichannel (${client.channels.join(' + ')})`);
    setInterestedService(client.interestedService || 'Guided Tour Package');
    setTourTitle(client.tourTitle || '');
    setExpectedTravelDate(client.expectedTravelDate || '');
    setExpectedReturnDate(client.expectedReturnDate || '');
    setPartySize(client.partySize || 1);
    setAssignedAgent(client.assignedAgent || user?.fullName || 'Sales Desk');
    setQuotationValue(client.quotationValue || 0);
    setQuotationCurrency(client.quotationCurrency || 'USD');
    setNextFollowUpDate(
      client.nextFollowUpDate ||
        eritreaDateString(new Date(Date.now() + 2 * 86400000))
    );
    setStage(client.crmStage || 'New Lead');
    setOperationalBookingStatus(
      client.operationalBookingStatus || (client.crmStage === 'Booked' ? 'Confirmed' : 'Unbooked')
    );
    setPaymentStatus(client.paymentStatus || 'Pending');
    setMessage(client.conversationSummary || '');
    setNotes(
      `[AI Categorization (${client.channels.join(' + ')})]: ${client.aiJudgmentReason} | Gender: ${client.gender} | Assigned Guide: ${client.assignedGuideName} | Assigned Driver: ${client.assignedDriverName} (${client.assignedFieldRoleNote})`
    );
    setIsLeadModalOpen(true);
  };

  const todayISO = eritreaDateString();

  const isLeadOverdue = (lead: WebsiteEnquiry): boolean => {
    const resolved = resolveLeadStage(lead);
    if (resolved === 'Completed') return false;
    if (!lead.nextFollowUpDate) return false;
    return lead.nextFollowUpDate < todayISO;
  };

  // Stage counts & overdue count
  const stageCounts = useMemo(() => {
    const counts: Record<CrmPipelineStage, number> = {
      'New Lead': 0,
      Contacted: 0,
      'Quotation Sent': 0,
      Negotiation: 0,
      Booked: 0,
      Completed: 0,
    };
    enquiries.forEach((e) => {
      const st = resolveLeadStage(e);
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [enquiries]);

  const overdueCount = useMemo(
    () => enquiries.filter((e) => isLeadOverdue(e)).length,
    [enquiries, todayISO]
  );

  const filteredEnquiries = useMemo(() => {
    return [...enquiries]
      .sort((a, b) => String(b.receivedAt ?? '').localeCompare(String(a.receivedAt ?? '')))
      .filter((e) => {
        const st = resolveLeadStage(e);
        if (stageFilter !== 'all' && st !== stageFilter) return false;
        if (onlyOverdue && !isLeadOverdue(e)) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const matchName = (e.fullName || '').toLowerCase().includes(q);
          const matchService = [e.interestedService, e.tourTitle, e.phone, userIsAdmin && e.email].some(value => value && value.toLowerCase().includes(q));
          const matchAgent = (e.assignedAgent || e.assignedTo || '').toLowerCase().includes(q);
          const matchSource = (e.leadSource || e.source || '').toLowerCase().includes(q);
          const matchCountry = (e.country || '').toLowerCase().includes(q);
          if (!matchName && !matchService && !matchAgent && !matchSource && !matchCountry) {
            return false;
          }
        }
        return true;
      });
  }, [enquiries, stageFilter, onlyOverdue, searchQuery, todayISO, userIsAdmin]);

  const openNewLeadModal = () => {
    setEditingLead(null);
    setFullName('');
    setEmail('');
    setPhone('');
    setCountry('');
    setLeadSource('Direct Inquiry / Phone');
    setInterestedService('Guided Tour Package');
    setTourTitle('');
    setExpectedTravelDate('');
    setExpectedReturnDate('');
    setPartySize(2);
    setAssignedAgent(user?.fullName || employees[0]?.name || 'Sales Desk');
    setQuotationValue(0);
    setQuotationCurrency('USD');
    setNextFollowUpDate(eritreaDateString(new Date(Date.now() + 2 * 86400000)));
    setStage('New Lead');
    setOperationalBookingStatus('Unbooked');
    setPaymentStatus('Pending');
    setMessage('');
    setNotes('');
    setIsLeadModalOpen(true);
  };

  const openEditLeadModal = (lead: WebsiteEnquiry) => {
    setEditingLead(lead);
    setFullName(lead.fullName || '');
    setEmail(lead.email || '');
    setPhone(lead.phone || '');
    setCountry(lead.country || '');
    setLeadSource(lead.leadSource || lead.source || 'Website Contact Form');
    setInterestedService(lead.interestedService || (lead.tourTitle ? 'Guided Tour Package' : 'Custom Travel Service'));
    setTourTitle(lead.tourTitle || '');
    setExpectedTravelDate(lead.expectedTravelDate || lead.preferredDate || '');
    setExpectedReturnDate(lead.expectedReturnDate || '');
    setPartySize(lead.partySize || 1);
    setAssignedAgent(lead.assignedAgent || lead.assignedTo || user?.fullName || '');
    setQuotationValue(lead.quotationValue || 0);
    setQuotationCurrency(lead.quotationCurrency || 'USD');
    setNextFollowUpDate(lead.nextFollowUpDate || '');
    setStage(resolveLeadStage(lead));
    setOperationalBookingStatus(
      lead.operationalBookingStatus || (lead.linkedBookingId ? 'Confirmed' : 'Unbooked')
    );
    setPaymentStatus(lead.paymentStatus || 'Pending');
    setMessage(lead.message || '');
    setNotes(lead.notes || '');
    setIsLeadModalOpen(true);
  };

  const handleSaveLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !fullName.trim()) return;

    const payload: WebsiteEnquiry = {
      ...(enquiries.find(lead => lead.id === editingLead?.id) || editingLead),
      id: editingLead?.id || `enq-${crypto.randomUUID()}`,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      country: country.trim() || null,
      tourId: editingLead?.tourId || null,
      tourTitle: tourTitle.trim() || interestedService,
      preferredDate: expectedTravelDate || null,
      partySize: Number(partySize) || 1,
      message: message.trim() || `Interested in ${interestedService}`,
      source: leadSource,
      status: STAGE_TO_LEGACY_STATUS[stage],
      stage,
      crmStage: stage,
      leadSource,
      interestedService,
      expectedTravelDate: expectedTravelDate || undefined,
      expectedReturnDate: expectedReturnDate || undefined,
      assignedAgent: assignedAgent.trim() || undefined,
      assignedTo: assignedAgent.trim() || null,
      quotationValue: Number(quotationValue) || 0,
      quotationCurrency,
      nextFollowUpDate: nextFollowUpDate || undefined,
      notes: notes.trim() || undefined,
      linkedTouristId: editingLead?.linkedTouristId,
      linkedBookingId: editingLead?.linkedBookingId,
      operationalBookingStatus,
      paymentStatus,
      receivedAt: editingLead?.receivedAt || new Date().toISOString(),
      handledAt: new Date().toISOString(),
    };

    if (editingLead) {
      onUpdateEnquiry(payload);
    } else if (onAddEnquiry) {
      onAddEnquiry(payload);
    } else {
      onUpdateEnquiry(payload);
    }
    setIsLeadModalOpen(false);
  };

  const handleStageChange = (lead: WebsiteEnquiry, nextStage: CrmPipelineStage) => {
    const updated: WebsiteEnquiry = {
      ...lead,
      stage: nextStage,
      crmStage: nextStage,
      status: STAGE_TO_LEGACY_STATUS[nextStage],
      handledAt: new Date().toISOString(),
    };
    onUpdateEnquiry(updated);

    if (nextStage === 'Booked' && !lead.linkedTouristId && !lead.linkedBookingId) {
      openBookingConversionModal(updated);
    }
  };

  // Find potential matching existing tourist to prevent duplicates
  const findPotentialDuplicateTourists = (lead: WebsiteEnquiry) => {
    const normName = (lead.fullName || '').trim().toLowerCase();
    const normEmail = (lead.email || '').trim().toLowerCase();
    const normPhone = (lead.phone || '').replace(/[^\d+]/g, '');

    return tourists.filter((t) => {
      if (lead.linkedTouristId && t.id === lead.linkedTouristId) return true;
      if (normName && (t.fullName || '').trim().toLowerCase() === normName) return true;
      if (normEmail && (t.email || '').trim().toLowerCase() === normEmail) return true;
      if (normPhone && normPhone.length >= 6 && (t.phone || '').replace(/[^\d+]/g, '').includes(normPhone)) {
        return true;
      }
      return false;
    });
  };

  const openBookingConversionModal = (lead: WebsiteEnquiry) => {
    setConvertingLead(lead);
    const matches = findPotentialDuplicateTourists(lead);
    const defaultTouristId = lead.linkedTouristId || (matches[0]?.id ?? '');
    setSelectedExistingTouristId(defaultTouristId);

    const matchingTourBooking = tourBookings.find(
      (tb) =>
        tb.id === lead.linkedBookingId ||
        (defaultTouristId && tb.touristId === defaultTouristId) ||
        tb.touristName.toLowerCase() === lead.fullName.toLowerCase()
    );
    const matchingSeatBooking = bookings.find(
      (b) =>
        b.id === lead.linkedBookingId ||
        (defaultTouristId && b.touristId === defaultTouristId) ||
        b.touristName.toLowerCase() === lead.fullName.toLowerCase()
    );

    setSelectedExistingBookingId(
      lead.linkedBookingId || matchingTourBooking?.id || matchingSeatBooking?.id || ''
    );
    setConvOperationalStatus(
      lead.operationalBookingStatus && lead.operationalBookingStatus !== 'Unbooked'
        ? lead.operationalBookingStatus
        : 'Confirmed'
    );
    setConvPaymentStatus(lead.paymentStatus || 'Pending');
  };

  // Departure bookings record amounts in USD. Link an existing booking for other currencies.
  const conversionIssue = convertingLead && !selectedExistingBookingId
    ? !convertingLead.quotationValue ? 'Enter the agreed party quote before creating a booking.'
      : convertingLead.quotationCurrency && convertingLead.quotationCurrency !== 'USD'
        ? 'Link an existing booking or enter an agreed USD quote to create a departure booking.' : ''
    : '';

  const handleConfirmConversion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !convertingLead || conversionIssue) return;

    if (onConvertBookedLeadToBooking) {
      onConvertBookedLeadToBooking(convertingLead, {
        existingTouristId: selectedExistingTouristId || undefined,
        existingBookingId: selectedExistingBookingId || undefined,
        operationalStatus: convOperationalStatus,
        paymentStatus: convPaymentStatus,
      });
    } else if (onConvert) {
      onConvert(convertingLead);
    }
    setConvertingLead(null);
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xs overflow-hidden">
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-0.5 brand-hairline" />
      </div>

      {/* Header Bar */}
      <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="flex items-center gap-3 text-left cursor-pointer"
        >
          <span className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Globe className="w-5 h-5 text-amber-700" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-serif italic font-bold text-slate-900">
                CRM Sales Pipeline &amp; Lead Management
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-mono font-bold text-slate-700">
                {enquiries.length} Leads
              </span>
              {stageCounts['New Lead'] > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-black uppercase tracking-wider">
                  {stageCounts['New Lead']} New
                </span>
              )}
              {overdueCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {overdueCount} Overdue Follow-Up
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              New Lead → Contacted → Quotation Sent → Negotiation → Booked → Completed (Separated from operational booking &amp; payment status)
            </p>
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* View switcher: Pipeline vs Table */}
          <div className="flex flex-wrap items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <button type="button" aria-pressed={viewMode === 'worklist'} onClick={() => { setExpanded(true); setViewMode('worklist'); }}
              className={`px-3 py-1.5 rounded-lg font-semibold ${viewMode === 'worklist' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
              Daily worklist
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pipeline')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'pipeline'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-600" /> Pipeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5 text-blue-600" /> Table View
            </button>
          </div>

          <button
            type="button"
            disabled={!canEdit}
            onClick={openNewLeadModal}
            className="px-4 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" /> + Add Sales Lead
          </button>

          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && viewMode === 'worklist' && (
        <div className="p-4"><CrmWorklist leads={enquiries} stageOf={resolveLeadStage} agent={user?.fullName || 'Sales desk'}
          canEdit={canEdit} onSave={onUpdateEnquiry} /></div>
      )}
      {expanded && viewMode !== 'worklist' && (
        <div className="p-5 space-y-4">
          {/* Stage Count Bar & Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStageFilter('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                  stageFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Stages ({enquiries.length})
              </button>
              {CRM_STAGES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStageFilter(st)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                    stageFilter === st
                      ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{st}</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-800 font-mono text-[10px] font-bold">
                    {stageCounts[st]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyOverdue((v) => !v)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  onlyOverdue
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Overdue Follow-ups ({overdueCount})
              </button>

              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search lead, agent, service..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* PIPELINE (KANBAN) VIEW */}
          {viewMode === 'pipeline' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {CRM_STAGES.map((colStage) => {
                const colLeads = filteredEnquiries.filter((l) => resolveLeadStage(l) === colStage);
                const totals = quoteTotals(colLeads);

                return (
                  <div
                    key={colStage}
                    className="rounded-2xl bg-slate-50/80 border border-slate-200 p-3 flex flex-col justify-between min-h-[260px]"
                  >
                    <div>
                      {/* Column Header */}
                      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200">
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${STAGE_STYLES[colStage]}`}
                          >
                            {colStage}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                          {colLeads.length}
                        </span>
                      </div>

                      {totals.length > 0 && (
                        <div className="mb-2 px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[10px] font-mono text-slate-600 flex items-center justify-between">
                          <span>Quoted</span>
                          <span className="font-bold text-emerald-700">{totals.join(' · ')}</span>
                        </div>
                      )}

                      {/* Cards */}
                      <div className="space-y-2.5">
                        {colLeads.length === 0 ? (
                          <div className="py-8 text-center text-[11px] text-slate-400 italic">
                            No leads in {colStage}
                          </div>
                        ) : (
                          colLeads.map((lead) => {
                            const overdue = isLeadOverdue(lead);
                            const linkedTourist = tourists.find((t) => t.id === lead.linkedTouristId);

                            return (
                              <div
                                key={lead.id}
                                className={`p-3 rounded-xl bg-white border shadow-2xs space-y-2 text-xs transition ${
                                  overdue ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <div>
                                    <div className="font-bold text-slate-900 leading-snug">{lead.fullName}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">
                                      {lead.leadSource || lead.source || BRAND.website}
                                      {lead.country ? ` · ${lead.country}` : ''}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => openEditLeadModal(lead)}
                                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                                    title="Edit Lead"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {(lead.interestedService || lead.tourTitle) && (
                                  <div className="text-[11px] font-semibold text-amber-900 bg-amber-50/70 px-2 py-1 rounded-lg border border-amber-200/60 truncate">
                                    {lead.interestedService || lead.tourTitle}
                                  </div>
                                )}

                                <div className="space-y-1 text-[10px] text-slate-600 font-mono">
                                  {lead.quotationValue ? (
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400">Quote:</span>
                                      <span className="font-bold text-emerald-700">
                                        {lead.quotationValue.toLocaleString()} {lead.quotationCurrency || 'USD'}
                                      </span>
                                    </div>
                                  ) : null}
                                  {(lead.expectedTravelDate || lead.preferredDate) && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400">Travel:</span>
                                      <span>{lead.expectedTravelDate || lead.preferredDate}</span>
                                    </div>
                                  )}
                                  {lead.assignedAgent || lead.assignedTo ? (
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400">Agent:</span>
                                      <span className="truncate max-w-[100px]">{lead.assignedAgent || lead.assignedTo}</span>
                                    </div>
                                  ) : null}
                                  {lead.nextFollowUpDate && (
                                    <div
                                      className={`flex items-center justify-between ${
                                        overdue ? 'text-rose-700 font-bold' : 'text-slate-600'
                                      }`}
                                    >
                                      <span>{overdue ? '⚠ Overdue:' : 'Follow-up:'}</span>
                                      <span>{lead.nextFollowUpDate}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Separate Operational & Payment Status Badges */}
                                {(lead.operationalBookingStatus || lead.paymentStatus || linkedTourist) && (
                                  <div className="pt-1.5 border-t border-slate-100 flex flex-wrap gap-1">
                                    {lead.operationalBookingStatus && lead.operationalBookingStatus !== 'Unbooked' && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[9px] font-mono font-bold">
                                        Ops: {lead.operationalBookingStatus}
                                      </span>
                                    )}
                                    {lead.paymentStatus && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-mono font-bold">
                                        Pay: {lead.paymentStatus}
                                      </span>
                                    )}
                                    {linkedTourist && (
                                      <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[9px] font-mono font-bold flex items-center gap-0.5">
                                        <Link2 className="w-2.5 h-2.5" /> Linked Tourist
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Stage Selector & Convert/Link Button */}
                                <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                                  <select
                                    disabled={!canEdit}
                                    value={colStage}
                                    onChange={(e) => handleStageChange(lead, e.target.value as CrmPipelineStage)}
                                    className="w-full text-[10px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-800 cursor-pointer"
                                  >
                                    {CRM_STAGES.map((s) => (
                                      <option key={s} value={s}>
                                        Stage: {s}
                                      </option>
                                    ))}
                                  </select>

                                  {(colStage === 'Booked' || colStage === 'Negotiation' || colStage === 'Completed') && (
                                    <button
                                      type="button"
                                      disabled={!canEdit}
                                      onClick={() => openBookingConversionModal(lead)}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                                    >
                                      <Link2 className="w-3 h-3" />
                                      {lead.linkedBookingId ? 'Update Linked Booking' : 'Create / Link Booking'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* TABLE VIEW */
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-mono text-[10px] uppercase">
                    <th className="py-3 px-3.5">Lead / Client</th>
                    <th className="py-3 px-3.5">Source &amp; Service</th>
                    <th className="py-3 px-3.5">Expected Travel</th>
                    <th className="py-3 px-3.5">Assigned Agent</th>
                    <th className="py-3 px-3.5 text-right">Quotation</th>
                    <th className="py-3 px-3.5">Next Follow-Up</th>
                    <th className="py-3 px-3.5">CRM Stage</th>
                    <th className="py-3 px-3.5">Ops / Payment Status</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredEnquiries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No leads match your current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredEnquiries.map((lead) => {
                      const st = resolveLeadStage(lead);
                      const overdue = isLeadOverdue(lead);
                      return (
                        <tr key={lead.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-3.5">
                            <div className="font-bold text-slate-900">{lead.fullName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {userIsAdmin && lead.email ? `${lead.email} · ` : ''}
                              {lead.phone || 'No phone'}
                              {lead.country ? ` (${lead.country})` : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-slate-800">
                              {lead.interestedService || lead.tourTitle || 'General Inquiry'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Source: {lead.leadSource || lead.source || BRAND.website}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 font-mono text-[11px]">
                            <div>{lead.expectedTravelDate || lead.preferredDate || 'TBD'}</div>
                            {lead.partySize ? (
                              <span className="text-[10px] text-slate-500">{lead.partySize} Pax</span>
                            ) : null}
                          </td>
                          <td className="py-3 px-3.5 font-medium text-slate-800">
                            {lead.assignedAgent || lead.assignedTo || 'Unassigned'}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-700">
                            {lead.quotationValue
                              ? `${lead.quotationValue.toLocaleString()} ${lead.quotationCurrency || 'USD'}`
                              : '—'}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-[11px]">
                            {lead.nextFollowUpDate ? (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  overdue
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {overdue ? 'OVERDUE: ' : ''}
                                {lead.nextFollowUpDate}
                              </span>
                            ) : (
                              <span className="text-slate-400">Not set</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            <select
                              disabled={!canEdit}
                              value={st}
                              onChange={(e) => handleStageChange(lead, e.target.value as CrmPipelineStage)}
                              className={`text-[11px] rounded-lg border px-2 py-1 font-bold cursor-pointer ${STAGE_STYLES[st]}`}
                            >
                              {CRM_STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="flex flex-col gap-1 text-[10px] font-mono">
                              <span className="text-blue-800 font-semibold">
                                Ops: {lead.operationalBookingStatus || (lead.linkedBookingId ? 'Confirmed' : 'Unbooked')}
                              </span>
                              <span className="text-emerald-800 font-semibold">
                                Pay: {lead.paymentStatus || 'Pending'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap space-x-1.5">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => openEditLeadModal(lead)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => openBookingConversionModal(lead)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                            >
                              {lead.linkedBookingId ? 'Linked' : 'Book / Link'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT LEAD MODAL */}
      {isLeadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-serif italic font-bold">
                  {editingLead ? 'Edit CRM Sales Lead' : 'Register New CRM Sales Lead'}
                </h3>
                <p className="text-[11px] text-slate-300">
                  Track lead source, interested service, quotation, follow-up schedule, and pipeline stage
                </p>
              </div>
              <div className="flex items-center gap-2">
                {userIsAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsOmnichannelModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Bot className="w-3.5 h-3.5" /> Auto-Fill from Email / Calendar / WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsLeadModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveLead} className="p-6 space-y-4 text-xs text-slate-900 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Client Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Marco Bellini"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Country / Nationality</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. Italy"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                {userIsAdmin && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Email Address (Admin Only)</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="client@example.com"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone / WhatsApp</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+39 02 555 0192"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Lead Source *</label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                  >
                    <option value="Website Contact Form">Website Contact Form</option>
                    <option value="WhatsApp Line (+2917190374)">WhatsApp Line (+2917190374)</option>
                    <option value="Direct Inquiry / Phone">Direct Inquiry / Phone</option>
                    <option value="Walk-In (Asmara Office)">Walk-In (Asmara Office)</option>
                    <option value="Partner Tour Operator">Partner Tour Operator</option>
                    <option value="Past Traveler Referral">Past Traveler Referral</option>
                    <option value="Diaspora Referral">Diaspora Referral</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Interested Service *</label>
                  <select
                    value={interestedService}
                    onChange={(e) => setInterestedService(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                  >
                    <option value="Guided Tour Package">Guided Tour Package</option>
                    <option value="Custom Private Expedition">Custom Private Expedition</option>
                    <option value="International Flight Ticketing">International Flight Ticketing</option>
                    <option value="Hotel Accommodation">Hotel Accommodation</option>
                    <option value="Vehicle Rent-Out (4WD / Bus)">Vehicle Rent-Out (4WD / Bus)</option>
                    <option value="Dahlak Marine Boat Charter">Dahlak Marine Boat Charter</option>
                    <option value="Visa on Arrival (VoA) & Permits">Visa on Arrival (VoA) &amp; Permits</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assigned Sales Agent</label>
                  <input
                    type="text"
                    value={assignedAgent}
                    onChange={(e) => setAssignedAgent(e.target.value)}
                    placeholder="Agent Name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Specific Package / Route</label>
                  <input
                    type="text"
                    value={tourTitle}
                    onChange={(e) => setTourTitle(e.target.value)}
                    placeholder="e.g. 8-Day Asmara, Massawa & Dahlak"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expected Arrival</label>
                  <input
                    type="date"
                    value={expectedTravelDate}
                    onChange={(e) => setExpectedTravelDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expected Return</label>
                  <input
                    type="date"
                    min={expectedTravelDate || undefined}
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Party Size (Pax)</label>
                  <input
                    type="number"
                    min={1}
                    value={partySize}
                    onChange={(e) => setPartySize(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total party quote</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={quotationValue}
                    onChange={(e) => setQuotationValue(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Currency</label>
                  <select
                    value={quotationCurrency}
                    onChange={(e) =>
                      setQuotationCurrency(e.target.value as 'USD' | 'EUR' | 'GBP' | 'CHF' | 'ERN')
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold"
                  >
                    <option value="USD">USD ($ — Tours / Tickets / Visa)</option>
                    <option value="EUR">EUR (€ — Tours / Tickets)</option>
                    <option value="GBP">GBP (£ — Tours)</option>
                    <option value="CHF">CHF (Swiss Francs — Tours)</option>
                    <option value="ERN">ERN (Nakfa — Local Rentals)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Next Follow-Up Date</label>
                  <input
                    type="date"
                    value={nextFollowUpDate}
                    onChange={(e) => setNextFollowUpDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* Separate Status Controls */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-amber-900 mb-1">1. CRM Sales Stage</label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value as CrmPipelineStage)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 font-bold text-slate-900"
                  >
                    {CRM_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-blue-900 mb-1">2. Operational Booking Status</label>
                  <select
                    value={operationalBookingStatus}
                    onChange={(e) => setOperationalBookingStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-blue-200 font-semibold text-slate-900"
                  >
                    <option value="Unbooked">Unbooked (Lead Only)</option>
                    <option value="Planned">Planned Itinerary</option>
                    <option value="Confirmed">Confirmed Operations</option>
                    <option value="In Progress">In Progress (On Tour)</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-emerald-900 mb-1">3. Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-200 font-semibold text-slate-900"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Partial">Partial / Deposit</option>
                    <option value="Paid">Paid in Full</option>
                    <option value="Refunded">Refunded</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Client Inquiry Message</label>
                  <textarea
                    rows={2}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Original request from traveler..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Agent Follow-Up &amp; Negotiation Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal CRM notes, special requirements, quote breakdown..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLeadModalOpen(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-wider cursor-pointer shadow-xs"
                >
                  Save CRM Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONVERT / LINK BOOKED LEAD MODAL (WITH DUPLICATE PREVENTION) */}
      {userIsAdmin && canEdit && isOmnichannelModalOpen && (
        <OmnichannelClientImportModal isOpen onClose={() => setIsOmnichannelModalOpen(false)}
          isAdmin={userIsAdmin} conversations={conversations} calendarEvents={calendarEvents} employees={employees}
          packages={packages} targetFormLabel="CRM lead" onInsertIntoForm={applyOmnichannelClientToLeadForm}
          onBatchInsertClients={onBatchInsertOmnichannelClients} />
      )}
      {convertingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-emerald-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-emerald-300" />
                <div>
                  <h3 className="text-base font-serif italic font-bold">
                    Convert or Link Booked Lead to Tourist &amp; Booking
                  </h3>
                  <p className="text-[11px] text-emerald-200">
                    Prevents duplicate customer profiles and duplicate bookings
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConvertingLead(null)}
                className="p-1.5 rounded-lg hover:bg-emerald-800 text-emerald-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmConversion} className="p-6 space-y-4 text-xs text-slate-900">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 text-sm">{convertingLead.fullName}</div>
                <div className="text-slate-600">
                  Service: <strong>{convertingLead.interestedService || convertingLead.tourTitle || 'Tour Package'}</strong> · Quote:{' '}
                  <strong className="font-mono text-emerald-700">
                    {convertingLead.quotationValue ? `${convertingLead.quotationValue} ${convertingLead.quotationCurrency || 'USD'}` : 'Awaiting quote'}
                  </strong>
                </div>
              </div>

              {/* Step 1: Link existing tourist or create new */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  1. Customer / Tourist Dossier (Duplicate Check)
                </label>
                <select
                  value={selectedExistingTouristId}
                  onChange={(e) => setSelectedExistingTouristId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                >
                  <option value="">+ Create New Tourist Profile for {convertingLead.fullName}</option>
                  {tourists.map((t) => (
                    <option key={t.id} value={t.id}>
                      Link Existing: {t.fullName} (Passport: {t.passportNumber || 'On File'} · {t.nationality})
                    </option>
                  ))}
                </select>
                {selectedExistingTouristId && (
                  <p className="text-[11px] text-emerald-700 font-medium mt-1">
                    ✓ Will link to existing tourist dossier without creating a duplicate customer record.
                  </p>
                )}
              </div>

              {/* Step 2: Link existing booking or create new */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  2. Operational Booking Record
                </label>
                <select
                  value={selectedExistingBookingId}
                  onChange={(e) => setSelectedExistingBookingId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                >
                  <option value="">+ Create New Operational Booking from Lead Quotation</option>
                  {tourBookings.map((tb) => (
                    <option key={tb.id} value={tb.id}>
                      Link Existing Tour Booking: {tb.touristName} — {tb.region} ({tb.startDate})
                    </option>
                  ))}
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      Link Existing Departure Booking: {b.bookingRef} — {b.touristName} ({b.tourTitle})
                    </option>
                  ))}
                </select>
              </div>

              {conversionIssue && <p role="status" className="text-sm text-amber-900">{conversionIssue}</p>}
              {/* Step 3: Separate Operational & Payment Statuses */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block font-bold text-blue-900 mb-1">Operational Booking Status</label>
                  <select
                    value={convOperationalStatus}
                    onChange={(e) => setConvOperationalStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-blue-50/60 border border-blue-200 font-bold text-slate-900"
                  >
                    <option value="Planned">Planned</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-emerald-900 mb-1">Payment Status</label>
                  <select
                    value={convPaymentStatus}
                    onChange={(e) => setConvPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-emerald-50/60 border border-emerald-200 font-bold text-slate-900"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Partial">Partial (Deposit Paid)</option>
                    <option value="Paid">Paid in Full</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConvertingLead(null)}
                  className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={Boolean(conversionIssue)}
                  className="disabled:opacity-50 px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirm &amp; Link Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
