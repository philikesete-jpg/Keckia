import React, { useState } from 'react';
import {
  CalendarDays,
  MessageSquare,
  Layers,
  PhoneCall,
  Image as ImageIcon,
  CheckSquare,
  Bot,
  Sparkles,
} from 'lucide-react';
import {
  Employee,
  TourSchedule,
  TourBooking,
  TourPackage,
  TouristProfile,
  Booking,
  Ticket as TicketRecord,
  VisaOnArrivalDoc,
  RegionalPermitDoc,
  ActiveTab,
  FeedEvent,
  FeedTraveler,
  FeedConversation,
  FeedDraft,
  ColorLegendMapping,
  Hotel,
  HotelLetterDoc,
  HotelReservation,
  Vehicle,
} from '../../types';
import { CalendarWorkspace } from '../calendar/CalendarWorkspace';
import { UnifiedInboxView } from '../inbox/UnifiedInboxView';
import { DailyReviewFeedPanel } from '../admin/DailyReviewFeedPanel';
import { EmailChatGptAutomationPanel } from '../admin/EmailChatGptAutomationPanel';
import { SecretaryActionQueue } from '../calendar/SecretaryActionQueue';
import { TouristDestinationSlideshow } from './TouristDestinationSlideshow';
import { DashboardPhoneBook } from './DashboardPhoneBook';
import { DataSyncHubModal } from '../admin/DataSyncHubModal';
import { GoogleCalendarImportModal } from '../calendar/GoogleCalendarImportModal';
import { OmnichannelClientImportModal } from '../common/OmnichannelClientImportModal';
import { OmnichannelExtractedClient } from '../../lib/omnichannelClientImport';

import { useWorkspace } from '../../lib/workspace';
import { canWriteCollection } from '../../../shared/roles';
import { eritreaDateString } from '../../../shared/feedSchema';

interface DashboardViewProps {
  employees?: Employee[];
  schedules?: TourSchedule[];
  packages?: TourPackage[];
  tourists?: TouristProfile[];
  bookings?: Booking[];
  tickets?: TicketRecord[];
  reservations?: HotelReservation[];
  hotelLetters?: HotelLetterDoc[];
  hotels?: Hotel[];
  vehicles?: Vehicle[];
  visaDocs?: VisaOnArrivalDoc[];
  permits?: RegionalPermitDoc[];
  feedEvents?: FeedEvent[];
  feedTravelers?: FeedTraveler[];
  feedConversations?: FeedConversation[];
  feedDrafts?: FeedDraft[];
  feedTasks?: any[];
  feedConflicts?: any[];
  lastSuccessfulFeedTime?: string;
  colorMappings?: ColorLegendMapping[];
  onUpdateColorMappings?: (mappings: ColorLegendMapping[]) => void;
  onOpenTravelerDossier?: (travelerId: string, travelerName?: string) => void;
  onApproveDraft?: (draftId: string) => void;
  onFeedIngested?: () => void;
  onBatchInsertOmnichannelClients?: (clients: OmnichannelExtractedClient[]) => void;
  onSaveTourist?: (tourist: TouristProfile) => void;
  onAddReservation?: (res: HotelReservation) => void;
  onSaveHotelLetter?: (letter: HotelLetterDoc) => void;
  onSaveVoADoc?: (doc: VisaOnArrivalDoc) => void;
  onSavePermitDoc?: (permit: RegionalPermitDoc) => void;
  onNotify?: (title: string, message: string, linkTab?: ActiveTab) => void;
  onImportGoogleCalendar?: (feedEvents: FeedEvent[], schedules: TourSchedule[]) => void;
  isAdminUser?: boolean;
  setActiveTab?: (tab: ActiveTab) => void;
  onNavigate?: (tab: ActiveTab) => void;
  onOpenQuickAction?: () => void;
  onSelectSchedule?: (schedule: TourSchedule) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  employees = [],
  schedules = [],
  packages = [],
  tourists = [],
  bookings = [],
  tickets = [],
  reservations = [],
  hotelLetters = [],
  hotels = [],
  vehicles = [],
  visaDocs = [],
  permits = [],
  feedEvents = [],
  feedTravelers = [],
  feedConversations = [],
  feedDrafts = [],
  feedTasks = [],
  feedConflicts = [],
  lastSuccessfulFeedTime,
  colorMappings,
  onUpdateColorMappings,
  onOpenTravelerDossier,
  onApproveDraft,
  onFeedIngested,
  onBatchInsertOmnichannelClients,
  onSaveTourist,
  onAddReservation,
  onSaveHotelLetter,
  onSaveVoADoc,
  onSavePermitDoc,
  onNotify,
  onImportGoogleCalendar,
  isAdminUser = false,
  setActiveTab,
  onNavigate,
}) => {
  const [activeSection, setActiveSection] = useState<'operations' | 'calendar' | 'inbox' | 'queue' | 'feed' | 'automation' | 'directory' | 'destinations'>(
    isAdminUser ? 'operations' : 'calendar'
  );
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isGoogleCalendarModalOpen, setIsGoogleCalendarModalOpen] = useState(false);
  const [isOmnichannelModalOpen, setIsOmnichannelModalOpen] = useState(false);

  const handleNavigate = (tab: ActiveTab) => {
    if (onNavigate) {
      onNavigate(tab);
    } else if (setActiveTab) {
      setActiveTab(tab);
    }
  };

  const pendingTasksCount = (feedTasks || []).filter((t: any) => t.status !== 'completed').length;
  const unansweredCount = (feedConversations || []).filter((c) => c.status === 'unanswered').length;
  const emailInquiriesCount = (feedConversations || []).filter((c) => c.channel === 'email').length;

  return (
    <div id="dashboard-view-container" className="space-y-4 pb-12 font-sans text-slate-900">
      {/* Editorial View Header & Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl text-xs font-semibold">
          <button onClick={() => setActiveSection('operations')} className={`rounded-lg px-3 py-1.5 ${activeSection === 'operations' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>Daily operations</button>
          <button
            onClick={() => setActiveSection('calendar')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSection === 'calendar'
                ? 'bg-slate-900 text-white font-bold'
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5 text-brand-400" />
            <span>Operations Calendar</span>
          </button>

          <button
            onClick={() => setActiveSection('queue')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSection === 'queue'
                ? 'bg-slate-900 text-white font-bold'
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
            <span>Secretary Queue</span>
            {pendingTasksCount > 0 && (
              <span className="font-mono tabular-nums text-[11px] opacity-80">
                {pendingTasksCount}
              </span>
            )}
          </button>

          {isAdminUser && (
            <button
              onClick={() => setActiveSection('inbox')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSection === 'inbox'
                  ? 'bg-slate-900 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              <span>Inbox &amp; Drafts</span>
              {unansweredCount > 0 && (
                <span className="font-mono tabular-nums text-[11px] text-rose-500 font-bold">
                  {unansweredCount}
                </span>
              )}
            </button>
          )}

          {isAdminUser && (
            <button
              onClick={() => setActiveSection('automation')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSection === 'automation'
                  ? 'bg-slate-900 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Auto-Book Pipeline</span>
              {emailInquiriesCount > 0 && (
                <span className="font-mono tabular-nums text-[11px] opacity-80">
                  {emailInquiriesCount}
                </span>
              )}
            </button>
          )}

          {isAdminUser && (
            <button
              onClick={() => setActiveSection('feed')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSection === 'feed'
                  ? 'bg-slate-900 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Daily Feed</span>
            </button>
          )}

          <button
            onClick={() => setActiveSection('directory')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSection === 'directory'
                ? 'bg-slate-900 text-white font-bold'
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5 text-slate-500" />
            <span>Staff Directory</span>
          </button>

          <button
            onClick={() => setActiveSection('destinations')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSection === 'destinations'
                ? 'bg-slate-900 text-white font-bold'
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
            <span>Destinations</span>
          </button>
        </div>

        {isAdminUser && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Sync Channels
            </button>
            <button
              type="button"
              onClick={() => setIsGoogleCalendarModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
              title="Import events from Google Calendar"
            >
              <CalendarDays className="w-4 h-4 text-white" />
              <span>Import Google Calendar</span>
            </button>
          </div>
        )}
      </div>

      {/* SECTION 1: HERO CALENDAR WORKSPACE */}
      {activeSection === 'operations' && <BusinessDesk navigate={handleNavigate} />}
      {activeSection === 'calendar' && (
        <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-xs bg-white min-h-[750px]">
          <CalendarWorkspace
            feedEvents={feedEvents}
            feedTravelers={feedTravelers}
            schedules={schedules}
            tickets={tickets}
            reservations={reservations}
            colorMappings={colorMappings}
            onUpdateColorMappings={onUpdateColorMappings}
            onOpenTravelerDossier={onOpenTravelerDossier}
            onOpenFeedImport={isAdminUser ? () => setActiveSection('feed') : undefined}
            onOpenDataSync={isAdminUser ? () => setIsSyncModalOpen(true) : undefined}
            onOpenGoogleCalendarImport={() => setIsGoogleCalendarModalOpen(true)}
            lastSuccessfulFeedTime={isAdminUser ? lastSuccessfulFeedTime : undefined}
            isAdminUser={isAdminUser}
          />
        </div>
      )}

      {/* SECTION 2: TODAY / SECRETARY ACTION QUEUE */}
      {activeSection === 'queue' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <SecretaryActionQueue
            tasks={feedTasks}
            conversations={isAdminUser ? feedConversations : []}
            conflicts={feedConflicts}
            events={feedEvents}
            travelers={feedTravelers}
            onOpenTravelerDossier={onOpenTravelerDossier}
            isAdminUser={isAdminUser}
          />
        </div>
      )}

      {/* SECTION 3: UNIFIED INBOX & DRAFTS (ADMIN ONLY) */}
      {activeSection === 'inbox' && isAdminUser && (
        <UnifiedInboxView
          conversations={feedConversations}
          calendarEvents={feedEvents}
          employees={employees}
          packages={packages}
          drafts={feedDrafts}
          travelers={feedTravelers}
          onApproveDraft={onApproveDraft}
          onOpenTravelerDossier={(travId) => onOpenTravelerDossier && onOpenTravelerDossier(travId)}
          onOpenDataSync={() => setIsSyncModalOpen(true)}
          onBatchInsertOmnichannelClients={onBatchInsertOmnichannelClients}
          onOpenAutomationPipeline={() => setActiveSection('automation')}
        />
      )}

      {/* SECTION 3B: EMAIL & CHATGPT SEQUENTIAL BOOKING PIPELINE (ADMIN ONLY) */}
      {activeSection === 'automation' && isAdminUser && (
        <EmailChatGptAutomationPanel
          hotels={hotels}
          packages={packages}
          employees={employees}
          vehicles={vehicles}
          feedConversations={feedConversations}
          reservations={reservations}
          hotelLetters={hotelLetters}
          visaDocs={visaDocs}
          permits={permits}
          onSaveTourist={onSaveTourist || (() => undefined)}
          onAddReservation={onAddReservation || (() => undefined)}
          onSaveHotelLetter={onSaveHotelLetter || (() => undefined)}
          onSaveVoADoc={onSaveVoADoc || (() => undefined)}
          onSavePermitDoc={onSavePermitDoc || (() => undefined)}
          onNotify={onNotify}
          onNavigate={handleNavigate}
        />
      )}

      {/* SECTION 4: DAILY REVIEW FEED INGESTION (ADMIN ONLY) */}
      {activeSection === 'feed' && isAdminUser && (
        <DailyReviewFeedPanel
          onFeedIngested={onFeedIngested}
          onOpenDataSync={() => setIsSyncModalOpen(true)}
        />
      )}

      {/* SECTION 5: OPERATIONAL PHONE BOOK */}
      {activeSection === 'directory' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <DashboardPhoneBook employees={employees} isAdminUser={isAdminUser} />
        </div>
      )}

      {/* SECTION 6: DESTINATIONS SLIDESHOW */}
      {activeSection === 'destinations' && (
        <div className="space-y-6">
          <TouristDestinationSlideshow onNavigate={handleNavigate} />
        </div>
      )}

      {/* MODAL: LIVE DATA FETCH & SYNC (Google Calendar, Gmail, WhatsApp — ADMIN ONLY) */}
      {isAdminUser && (
        <DataSyncHubModal
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          onSyncCompleted={() => {
            if (onFeedIngested) {
              onFeedIngested();
            }
          }}
        />
      )}

      {/* MODAL: GOOGLE CALENDAR IMPORTER */}
      <GoogleCalendarImportModal
        isOpen={isGoogleCalendarModalOpen}
        onClose={() => setIsGoogleCalendarModalOpen(false)}
        onImportCompleted={(importedFeedEvents, importedSchedules) => {
          if (onImportGoogleCalendar) {
            onImportGoogleCalendar(importedFeedEvents, importedSchedules);
          }
          if (onFeedIngested) {
            onFeedIngested();
          }
        }}
      />
    </div>
  );
};

function BusinessDesk({ navigate }: { navigate: (tab: ActiveTab) => void }) {
  const { collections, readable, user, setCollection } = useWorkspace();
  const [date, setDate] = useState(eritreaDateString);
  const [filter, setFilter] = useState('');
  const [meal, setMeal] = useState('Breakfast');
  const day = (value?: string) => (value || '').slice(0, 10);
  const matches = (...values: unknown[]) => values.join(' ').toLowerCase().includes(filter.trim().toLowerCase());
  const rows = (key: string) => readable.includes(key) ? (collections[key] || []) : [];
  const stays = (rows('reservations') as HotelReservation[]).filter(r =>
    r.paymentStatus !== 'Cancelled' && day(r.checkInDate) <= date && day(r.checkOutDate) >= date &&
    matches(r.touristName, r.hotelName, r.hotelCity, r.confirmationCode));
  const tickets = (rows('tickets') as TicketRecord[]).filter(t => !['Cancelled','Refunded'].includes(t.status) &&
    (day(t.departureDate) === date || day(t.returnDate) === date) &&
    matches(t.passengerName, t.touristName, t.pnr, t.airline, t.route));
  const departures = (rows('schedules') as TourSchedule[]).filter(t =>
    t.status !== 'Cancelled' && day(t.startDate) <= date && day(t.endDate || t.startDate) >= date);
  const tourBookings = (rows('tourBookings') as TourBooking[]).filter(t =>
    t.status !== 'Cancelled' && day(t.startDate) <= date && day(t.endDate || t.startDate) >= date);
  const staff = rows('employees') as Employee[];
  const fleet = rows('vehicles') as Vehicle[];
  const person = (id?: string) => staff.find(p => p.id === id)?.name;
  const vehicle = (id?: string) => fleet.find(v => v.id === id)?.name;
  const assignments = [
    ...departures.map(t => ({ id: 'schedule-' + t.id, title: t.tourTitle || t.packageTitle || 'Tour departure', guide: t.leadGuideName || person(t.leadGuideId || t.guideId) || t.assignedGuide,
      driver: person(t.driverId), vehicle: vehicle(t.vehicleId) || t.assignedVehicle, seats: t.bookedSeats, tab: 'tours' as ActiveTab })),
    ...tourBookings.map(t => ({ id: 'booking-' + t.id, title: [t.packageTitle || 'Tour booking', t.touristName || t.clientName].filter(Boolean).join(' · '),
      guide: t.assignedGuideName || t.guideName || person(t.assignedGuideId || t.guideId),
      driver: t.assignedDriverName || t.driverName || person(t.assignedDriverId || t.driverId),
      vehicle: t.assignedVehicleName || t.vehicleName || vehicle(t.assignedVehicleId || t.vehicleId),
      seats: t.travelersCount, tab: 'packages' as ActiveTab }))
  ].filter(t => matches(t.title, t.guide, t.driver, t.vehicle));
  const flags: { id: string; text: string; tab: ActiveTab }[] = [];
  function flag(id: string, text: string, tab: ActiveTab) {
    if (matches(text)) flags.push({id, text, tab});
  }
  for (const lead of rows('websiteEnquiries')) {
    if (lead.nextFollowUpDate && day(lead.nextFollowUpDate) <= date && !['Completed','Booked'].includes(lead.stage || lead.crmStage) && !['Closed','Converted'].includes(lead.status))
      flag('lead-'+lead.id, [lead.fullName, 'Sales follow-up due', day(lead.nextFollowUpDate)].join(' · '), 'tourists');
  }
  const allocations = new Map<string, Set<string>>();
  for (const t of departures) {
    for (const [key, label] of [[t.leadGuideId || t.guideId, 'staff'],[t.driverId,'staff'],[t.vehicleId,'vehicle']]) {
      if (!key) continue;
      const resource = label+'|'+key;
      const ids = allocations.get(resource) || new Set<string>();
      ids.add(t.id);
      allocations.set(resource, ids);
    }
    const assigned = fleet.find(v=>v.id === t.vehicleId);
    if (assigned && assigned.capacity > 0 && t.bookedSeats > assigned.capacity)
      flag('capacity-'+t.id, t.tourTitle+' · '+t.bookedSeats+' booked seats exceed '+assigned.name+' capacity of '+assigned.capacity, 'tours');
  }
  for (const [key, ids] of allocations) {
    if (ids.size < 2) continue;
    const [kind, id] = key.split('|');
    const label = kind==='vehicle' ? vehicle(id) : person(id);
    flag(key, (label || 'Assigned resource')+' · Check timing across '+ids.size+' departures on this date', 'tours');
  }
  for (const v of fleet) {
    if (v.insuranceExpiry && day(v.insuranceExpiry)<date) flag('insurance-'+v.id, v.name+' · Insurance expired '+day(v.insuranceExpiry), 'transport');
    if (v.technicalInspectionExpiry && day(v.technicalInspectionExpiry)<date) flag('inspection-'+v.id, v.name+' · Inspection expired '+day(v.technicalInspectionExpiry), 'transport');
  }
  const modules: [ActiveTab, string, string][] = [
    ['tourists','Clients & sales','websiteEnquiries'], ['tickets','Ticketing','tickets'], ['tours','Tour departures','schedules'],
    ['packages','Tour bookings','tourBookings'], ['hr','Staff & HR','employees'], ['transport','Fleet','vehicles'],
    ['hotels','Hotels & lodging','reservations'], ['finance','Finance','financialTransactions'], ['documents','Visas & permits','visaDocs']
  ];
  const mealLogs = rows('touristActivities');
  const canLog = readable.includes('touristActivities') && canWriteCollection(user.role, 'touristActivities');
  const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50';
  const panel = 'rounded-2xl border border-slate-200 bg-white p-5';
  const empty = (message: string) => <p className="py-3 text-sm text-slate-500">{message}</p>;
  function logMeal(r: HotelReservation) {
    const id = ['meal', r.id, date, meal.toLowerCase()].join('/');
    const record = { id, touristId:r.touristId, touristName:r.touristName, hotelReservationId:r.id, hotelName:r.hotelName,
      activityType:'Meal', title:meal, date, location:r.hotelName, status:'Completed', createdAt:new Date().toISOString(),
      notes:'Hotel service recorded by ' + user.fullName + (r.numberOfGuests ? ' for a reservation of ' + r.numberOfGuests + ' guests.' : '.') };
    setCollection('touristActivities', prev => prev.some(a => a.id === id) ? prev : [...prev, record]);
  }
  return <section className="space-y-4" aria-label="Business operations">
    <div className="rounded-2xl bg-slate-900 p-5 text-white sm:p-7">
      <h2 className="text-2xl font-bold">Daily operations</h2>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Service date · Asmara<input type="date" value={date} onChange={e=>e.target.value && setDate(e.target.value)} className="rounded-lg bg-white px-3 py-2 text-slate-900"/></label>
        <label className="grid gap-1 text-sm">Find a traveler or service<input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Traveler, tour, hotel or flight" className="rounded-lg bg-white px-3 py-2 text-slate-900"/></label>
      </div>
    </div>
    <nav className="flex flex-wrap gap-2" aria-label="Business departments">{modules.filter(([, ,key])=>readable.includes(key)).map(([tab,label])=><button key={tab} className={button} onClick={()=>navigate(tab)}>{label}</button>)}</nav>
    <article className={panel}><h3 className="font-bold">Follow-ups and operational checks</h3>
      {flags.length ? <ul className="max-h-72 divide-y overflow-y-auto">{flags.map(f=><li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{f.text}</span><button className={button} onClick={()=>navigate(f.tab)}>Review</button></li>)}</ul> : empty('No matching follow-ups or alerts for this date.')}</article>
    {(readable.includes('schedules') || readable.includes('tourBookings')) && <article className={panel}><h3 className="font-bold">Tours and field assignments</h3>
      {assignments.length ? <ul className="divide-y">{assignments.map(t=><li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div><b>{t.title}</b><p className="text-sm text-slate-600">{t.seats ?? '—'} travelers · Guide {t.guide || 'unassigned'} · Driver {t.driver || 'unassigned'} · Vehicle {t.vehicle || 'unassigned'}</p></div>
        <button className={button} onClick={()=>navigate(t.tab)}>Open {t.tab==='tours'?'departures':'bookings'}</button></li>)}</ul> : empty('No matching tours for this date.')}</article>}
    {readable.includes('tickets') && <article className={panel}><h3 className="font-bold">Flight departures and returns</h3>
      {tickets.length ? <ul className="divide-y">{tickets.map(t=><li key={t.id} className="py-3 text-sm"><b>{t.passengerName || t.touristName || t.clientName}</b> · {t.route || [t.origin,t.destination].filter(Boolean).join(' – ') || t.tourTitle} · {t.airline} {t.flightNumber} · {day(t.returnDate)===date?'Return':'Departure'} · {t.status}</li>)}</ul> : empty('No matching tickets for this date.')}</article>}
    {readable.includes('reservations') && <article className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Hotel stays and meal service</h3>
      <label className="text-sm">Service <select className={button} value={meal} onChange={e=>setMeal(e.target.value)}>{['Breakfast','Lunch','Dinner'].map(m=><option key={m}>{m}</option>)}</select></label></div>
      {stays.length ? <ul className="divide-y">{stays.map(r=>{
        const logged=mealLogs.some(a=>a.id===['meal',r.id,date,meal.toLowerCase()].join('/'));
        return <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><b>{r.hotelName} · {r.touristName}</b><p className="text-sm text-slate-600">{day(r.checkInDate)===date?'Check-in':day(r.checkOutDate)===date?'Check-out':'In house'} · {r.numberOfRooms} rooms · {r.numberOfGuests} guests · {r.mealPlan || 'Board unspecified'}</p></div>
          {logged ? <span className="text-sm font-semibold text-emerald-700">{meal} served</span> : canLog && r.touristId && <button className={button} disabled={date>eritreaDateString()} onClick={()=>logMeal(r)}>Record {meal.toLowerCase()} served</button>}</li>})}</ul>:empty('No matching hotel stays for this date.')}</article>}
  </section>;
}
