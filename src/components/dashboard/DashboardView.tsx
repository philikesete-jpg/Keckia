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
  const [activeSection, setActiveSection] = useState<'calendar' | 'inbox' | 'queue' | 'feed' | 'automation' | 'directory' | 'destinations'>(
    isAdminUser ? 'automation' : 'calendar'
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
