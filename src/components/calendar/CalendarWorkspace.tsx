import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  PlaneLanding,
  PlaneTakeoff,
  HelpCircle,
  Clock,
  Compass,
  Building,
  Truck,
  ExternalLink,
  AlertTriangle,
  MapPin,
  User,
  Sliders,
  CheckCircle2,
  X,
  Plus,
  Layers,
  ArrowRight,
  Sparkles,
  Users,
  Award,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  FeedEvent,
  FeedTraveler,
  TourSchedule,
  Ticket as TicketRecord,
  HotelReservation,
  ColorLegendMapping,
} from '../../types';
import {
  AUTHENTIC_GOOGLE_COLORS,
  CATEGORY_COLORS,
  CategoryMapping,
  DEFAULT_CATEGORY_MAPPINGS,
  parseFeedDate,
  getEventUniqueKey,
  getCityForDate,
} from '../../utils/feedParser';

import { eritreaDateString, formatEritreaDateTime } from '../../../shared/feedSchema';

function calendarToday() {
  return new Date(eritreaDateString() + 'T12:00:00');
}

interface CalendarWorkspaceProps {
  feedEvents?: FeedEvent[];
  feedTravelers?: FeedTraveler[];
  schedules?: TourSchedule[];
  tickets?: TicketRecord[];
  reservations?: HotelReservation[];
  categoryMappings?: (CategoryMapping | ColorLegendMapping)[];
  colorMappings?: (CategoryMapping | ColorLegendMapping)[];
  onUpdateCategoryMappings?: (mappings: any[]) => void;
  onUpdateColorMappings?: (mappings: any[]) => void;
  onOpenTravelerDossier?: (travelerId: string, travelerName?: string) => void;
  onOpenFeedImport?: () => void;
  onOpenDataSync?: () => void;
  onOpenGoogleCalendarImport?: () => void;
  lastSuccessfulFeedTime?: string;
  isAdminUser?: boolean;
}

export type CalendarViewMode = 'month' | 'week' | 'agenda' | 'lanes';

export const CalendarWorkspace: React.FC<CalendarWorkspaceProps> = ({
  feedEvents = [],
  feedTravelers = [],
  schedules = [],
  tickets = [],
  reservations = [],
  categoryMappings,
  colorMappings,
  onUpdateCategoryMappings,
  onUpdateColorMappings,
  onOpenTravelerDossier,
  onOpenFeedImport,
  onOpenDataSync,
  onOpenGoogleCalendarImport,
  lastSuccessfulFeedTime,
  isAdminUser = false,
}) => {
  const propCategoryMappings = categoryMappings || colorMappings;
  const handleUpdateMappings = onUpdateCategoryMappings || onUpdateColorMappings;
  // Navigation & View state
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(calendarToday);
  const [todayStr, setTodayStr] = useState(() => eritreaDateString());
  useEffect(() => {
    const update = () => setTodayStr(eritreaDateString());
    const timer = window.setInterval(update, 15000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showNeedsReviewOnly, setShowNeedsReviewOnly] = useState(false);

  // Active drawer & modal state
  const [selectedDayString, setSelectedDayString] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<FeedEvent | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  // Category & Color mappings state (Owner's categories + movements)
  const [activeMappings, setActiveMappings] = useState<CategoryMapping[]>(() => {
    if (propCategoryMappings && propCategoryMappings.length > 0) {
      return propCategoryMappings.map((m: any): CategoryMapping => ({
        id: m.id,
        colorHex: m.colorHex,
        label: m.label,
        type: m.type || 'category',
        description: m.description || '',
        iconName: m.iconName || 'Tag',
        isSystemDefault: m.isSystemDefault ?? false,
      }));
    }
    return DEFAULT_CATEGORY_MAPPINGS;
  });

  // Source calendar toggles state
  const [enabledCalendars, setEnabledCalendars] = useState<Record<string, boolean>>({
    'gcal_master': true,
    'flight_feed': true,
    'schedules_system': true,
    'ticketing_system': true,
    'hotels_system': true,
  });

  // Combine and normalize all operational events
  const allEvents = useMemo<FeedEvent[]>(() => {
    const list: FeedEvent[] = [];
    const seen = new Set<string>();

    // 1. Imported Feed Events
    feedEvents.forEach((evt) => {
      const key = getEventUniqueKey(evt);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(evt);
      }
    });

    // 2. Tour Departures / Schedules
    schedules.forEach((sch: any) => {
      const key = `schedules_system__${sch.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        const isTentative = sch.status === 'Tentative' || sch.status === 'Draft';
        list.push({
          id: sch.id,
          calendarId: 'schedules_system',
          calendarName: 'Tour Operations System',
          title: `${sch.packageTitle || sch.tourTitle || 'Expedition'} (${sch.guideName || sch.leadGuideName || 'Guide Assigned'})`,
          description: `Group size: ${sch.confirmedTravelers || sch.bookedSeats || 0} pax. Vehicle: ${sch.vehicleName || 'Fleet Assigned'}`,
          start: sch.startDate,
          end: sch.endDate,
          allDay: true,
          colorHex: isTentative ? AUTHENTIC_GOOGLE_COLORS.tentative : CATEGORY_COLORS.groups,
          categoryKey: 'groups',
          label: isTentative ? 'Tentative Expedition' : 'Group Expedition',
          status: isTentative ? 'tentative' : 'confirmed',
          location: sch.destination || 'Eritrea Route',
          cities: sch.destination ? [sch.destination] : [],
          hotelName: sch.hotelName,
          guideName: sch.guideName || sch.leadGuideName,
          driverName: sch.driverName,
          isTentative,
        });
      }
    });

    // 3. Flight Tickets (Arrivals & Departures - Explicit evidence built-in)
    tickets.forEach((tkt: any) => {
      if (tkt.departureDate) {
        const depKey = `ticketing_system__dep_${tkt.id}`;
        if (!seen.has(depKey)) {
          seen.add(depKey);
          list.push({
            id: `dep_${tkt.id}`,
            calendarId: 'ticketing_system',
            calendarName: 'Flight Ticketing Operations',
            title: `Departure ${tkt.flightNumber || 'FLT'}: ${tkt.passengerName || tkt.touristName || 'Client'} (${tkt.departureAirport || tkt.fromAirport || 'ASM'})`,
            description: `PNR: ${tkt.pnrNumber || tkt.pnr || tkt.ticketNumber}. Route: ${tkt.departureAirport || tkt.fromAirport} outbound departure to ${tkt.arrivalAirport || tkt.toAirport}. Class: ${tkt.class || tkt.ticketClass}`,
            start: `${tkt.departureDate}T${tkt.departureTime || '12:00'}:00`,
            allDay: false,
            colorHex: AUTHENTIC_GOOGLE_COLORS.departure,
            label: 'Departure (Flight / Port)',
            flightNumber: tkt.flightNumber,
            airportCode: tkt.departureAirport || tkt.fromAirport || 'ASM',
            location: `${tkt.departureAirport || tkt.fromAirport || 'ASM'} Airport`,
            status: 'confirmed',
            cities: ['Asmara'],
            dailyCityMap: { [tkt.departureDate]: 'Asmara' },
            travelerId: tkt.clientId || tkt.touristId,
          });
        }
      }
      if (tkt.returnFlightDate) {
        const retKey = `ticketing_system__ret_${tkt.id}`;
        if (!seen.has(retKey)) {
          seen.add(retKey);
          list.push({
            id: `ret_${tkt.id}`,
            calendarId: 'ticketing_system',
            calendarName: 'Flight Ticketing Operations',
            title: `Arrival ${tkt.returnFlightNumber || 'FLT'}: ${tkt.passengerName || tkt.touristName || 'Client'} (landing ${tkt.returnTo || 'ASM'})`,
            description: `Inbound flight landing from ${tkt.returnFrom || 'Airport'}. Seat: ${tkt.returnSeat || 'Assigned'}`,
            start: `${tkt.returnFlightDate}T${tkt.returnDepartureTime || '14:00'}:00`,
            allDay: false,
            colorHex: AUTHENTIC_GOOGLE_COLORS.arrival,
            label: 'Arrival (Flight / Port)',
            flightNumber: tkt.returnFlightNumber,
            airportCode: tkt.returnTo || 'ASM',
            location: `${tkt.returnTo || 'ASM'} Airport`,
            status: 'confirmed',
            cities: ['Asmara'],
            dailyCityMap: { [tkt.returnFlightDate]: 'Asmara' },
            travelerId: tkt.clientId || tkt.touristId,
          });
        }
      }
    });

    // 4. Hotel Check-ins
    reservations.forEach((res: any) => {
      const key = `hotels_system__${res.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        const city = res.hotelName?.toLowerCase().includes('massawa')
          ? 'Massawa'
          : res.hotelName?.toLowerCase().includes('keren')
          ? 'Keren'
          : 'Asmara';
        list.push({
          id: res.id,
          calendarId: 'hotels_system',
          calendarName: 'Hotel & Lodging Desk',
          title: `Hotel Check-in: ${res.hotelName} (${res.guestName || res.touristName || 'Guest'})`,
          description: `Room type: ${res.roomType || res.roomTypeName}. Nights: ${res.nightsCount || res.numberOfNights}. Confirmation: ${res.confirmationNumber || res.confirmationCode || res.id}`,
          start: res.checkInDate,
          end: res.checkOutDate,
          allDay: true,
          colorHex: '#8e24aa',
          categoryKey: 'groups',
          label: 'Hotel Lodging',
          location: res.hotelName,
          hotelName: res.hotelName,
          status: 'confirmed',
          cities: [city],
          dailyCityMap: { [res.checkInDate]: city },
          travelerId: res.touristId,
        });
      }
    });

    return list;
  }, [feedEvents, schedules, tickets, reservations]);

  // Extract distinct calendar sources for source toggles
  const sourceCalendars = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    allEvents.forEach((e) => {
      const calId = e.calendarId || 'default';
      const existing = map.get(calId);
      if (existing) {
        existing.count++;
      } else {
        map.set(calId, { id: calId, name: e.calendarName || calId, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [allEvents]);

  // Filtered events
  const visibleEvents = useMemo(() => {
    return allEvents.filter((evt) => {
      const calId = evt.calendarId || 'default';
      // Holiday filter
      const isHoliday =
        evt.calendarId === 'holidays_feed' ||
        evt.categoryKey === 'holiday' ||
        /holiday|public holiday/i.test(`${evt.label || ''} ${evt.calendarName || ''} ${evt.title || ''}`);
      if (isHoliday && enabledCalendars.holidays_feed === false) return false;

      // Category filter
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'needs_review' && !evt.isNeedsReview) return false;
        if (categoryFilter === 'groups' && evt.categoryKey !== 'groups') return false;
        if (categoryFilter === 'tour_operators' && evt.categoryKey !== 'tour_operators') return false;
        if (categoryFilter === 'special_interest' && evt.categoryKey !== 'special_interest') return false;
        if (categoryFilter === 'luxury' && evt.categoryKey !== 'luxury') return false;
        if (categoryFilter === 'arrival' && evt.colorHex !== AUTHENTIC_GOOGLE_COLORS.arrival) return false;
        if (categoryFilter === 'departure' && evt.colorHex !== AUTHENTIC_GOOGLE_COLORS.departure) return false;
      }

      if (showNeedsReviewOnly && !evt.isNeedsReview) return false;

      // Search text
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const matchesTitle = evt.title.toLowerCase().includes(q);
        const matchesDesc = (evt.description || '').toLowerCase().includes(q);
        const matchesLoc = (evt.location || '').toLowerCase().includes(q);
        const matchesCity = (evt.cities || []).some((c) => c.toLowerCase().includes(q));
        const matchesStaff =
          (evt.guideName || '').toLowerCase().includes(q) ||
          (evt.driverName || '').toLowerCase().includes(q) ||
          (evt.hotelName || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesLoc && !matchesCity && !matchesStaff) return false;
      }

      return true;
    });
  }, [allEvents, enabledCalendars, categoryFilter, showNeedsReviewOnly, searchFilter]);

  // Navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrev = () => {
    if (viewMode === 'month' || viewMode === 'lanes') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else {
      setCurrentDate(new Date(year, month, currentDate.getDate() - 7, 12));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month' || viewMode === 'lanes') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else {
      setCurrentDate(new Date(year, month, currentDate.getDate() + 7, 12));
    }
  };

  const handleToday = () => {
    setCurrentDate(calendarToday());
  };

  // Timezone-safe local YYYY-MM-DD formatter
  const formatYmd = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // Month days builder (immune to UTC midnight offsets & duplicate day keys)
  const monthDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: Array<{
      id: string;
      date: Date;
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    const prevMonthDays = new Date(year, month, 0).getDate();
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthDays - i;
      const d = new Date(prevYear, prevMonth, dNum);
      const str = formatYmd(prevYear, prevMonth, dNum);
      days.push({
        id: `prev-${str}`,
        date: d,
        dateString: str,
        dayNumber: dNum,
        isCurrentMonth: false,
        isToday: false,
      });
    }


    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const str = formatYmd(year, month, day);
      days.push({
        id: `curr-${str}`,
        date: d,
        dateString: str,
        dayNumber: day,
        isCurrentMonth: true,
        isToday: str === todayStr,
      });
    }

    const remaining = (7 - (days.length % 7)) % 7;
    const nextYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;

    for (let i = 1; i <= remaining; i++) {
      const d = new Date(nextYear, nextMonth, i);
      const str = formatYmd(nextYear, nextMonth, i);
      days.push({
        id: `next-${str}`,
        date: d,
        dateString: str,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return days;
  }, [year, month, todayStr]);

  // Week days builder (immune to UTC offset shifts)
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const dayOfWeek = curr.getDay();
    const sunday = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() - dayOfWeek);

    const days: Array<{ id: string; date: Date; dateString: string; label: string }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
      const str = formatYmd(d.getFullYear(), d.getMonth(), d.getDate());
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      days.push({ id: `week-${str}-${i}`, date: d, dateString: str, label });
    }
    return days;
  }, [currentDate]);

  // Group events by date string
  const eventsByDate = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    visibleEvents.forEach((evt) => {
      const parsedStart = parseFeedDate(evt.start, evt.timeZone);
      const parsedEnd = evt.end ? parseFeedDate(evt.end, evt.timeZone) : parsedStart;

      const startD = new Date(parsedStart.dateString);
      const endD = new Date(parsedEnd.dateString);
      const dayDiff = Math.max(0, Math.round((endD.getTime() - startD.getTime()) / 86400000));

      if (dayDiff > 0 && dayDiff <= 30) {
        for (let i = 0; i <= dayDiff; i++) {
          const temp = new Date(startD);
          temp.setUTCDate(startD.getUTCDate() + i);
          const tempStr = temp.toISOString().split('T')[0];
          const arr = map.get(tempStr) || [];
          arr.push(evt);
          map.set(tempStr, arr);
        }
      } else {
        const arr = map.get(parsedStart.dateString) || [];
        arr.push(evt);
        map.set(parsedStart.dateString, arr);
      }
    });
    return map;
  }, [visibleEvents]);

  // Render appropriate category or movement icon
  const renderEventIcon = (evt: FeedEvent) => {
    if (evt.isNeedsReview) return <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />;
    if (evt.isOvernightTransfer) return <Truck className="w-3 h-3 shrink-0" />;
    if (evt.colorHex === AUTHENTIC_GOOGLE_COLORS.arrival || evt.label?.includes('Arrival')) {
      return <PlaneLanding className="w-3 h-3 shrink-0" />;
    }
    if (evt.colorHex === AUTHENTIC_GOOGLE_COLORS.departure || evt.label?.includes('Departure')) {
      return <PlaneTakeoff className="w-3 h-3 shrink-0" />;
    }
    if (evt.categoryKey === 'special_interest') return <Sparkles className="w-3 h-3 shrink-0" />;
    if (evt.categoryKey === 'groups') return <Users className="w-3 h-3 shrink-0" />;
    if (evt.categoryKey === 'luxury') return <Award className="w-3 h-3 shrink-0" />;
    if (evt.categoryKey === 'tour_operators') return <Layers className="w-3 h-3 shrink-0" />;
    if (evt.isTentative) return <HelpCircle className="w-3 h-3 shrink-0" />;
    if (evt.status === 'superseded') return <Clock className="w-3 h-3 shrink-0" />;
    if (evt.hotelName) return <Building className="w-3 h-3 shrink-0" />;
    return <Compass className="w-3 h-3 shrink-0" />;
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col h-full bg-white text-slate-900 font-sans select-none">
      {/* 1. Review Schedule & Feed Status Banner (Admin Only) */}
      {isAdminUser && (
        <div className="px-6 py-2 bg-slate-900 text-white text-xs flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-amber-300 font-bold uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Planned Review Schedule: 7:00 AM & 10:00 PM EAT
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 text-[11px]">
              Actual Last Feed:{' '}
              <span className="font-mono text-white font-bold">
                {lastSuccessfulFeedTime
                  ? formatEritreaDateTime(lastSuccessfulFeedTime)
                  : 'No review imported'}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {allEvents.some((e) => e.isNeedsReview) && (
              <button
                onClick={() => setShowNeedsReviewOnly((prev) => !prev)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition flex items-center gap-1 cursor-pointer ${
                  showNeedsReviewOnly
                    ? 'bg-amber-400 text-slate-950 ring-1 ring-white'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                }`}
              >
                <AlertCircle className="w-3 h-3 text-amber-400" />
                <span>
                  {allEvents.filter((e) => e.isNeedsReview).length} Needs review
                </span>
              </button>
            )}

            <span className="text-[10px] font-mono text-slate-400">
              Deduplicated: source + eventId
            </span>
          </div>
        </div>
      )}

      {/* 2. Hero Workspace Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono tracking-widest text-slate-500 uppercase font-bold">
                EritreaVisit Operations Companion
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 text-[10px] font-mono font-medium border border-slate-200">
                Africa/Asmara (UTC+3)
              </span>
            </div>
            <h1 className="text-2xl font-serif font-bold text-slate-950 italic mt-0.5 tracking-tight flex items-center gap-2">
              Operational Timeline & Calendar
            </h1>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block" />

          {/* Month / Period Navigation */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-950 transition cursor-pointer"
              title="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-serif font-bold text-slate-900 px-2 min-w-[140px] text-center">
              {monthName}
            </span>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-950 transition cursor-pointer"
              title="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50 text-slate-700 hover:text-slate-950 transition cursor-pointer ml-1"
            >
              Today
            </button>
          </div>
        </div>

        {/* View Switcher & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                viewMode === 'month' ? 'bg-white text-slate-950 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                viewMode === 'week' ? 'bg-white text-slate-950 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                viewMode === 'agenda' ? 'bg-white text-slate-950 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agenda
            </button>
            <button
              onClick={() => setViewMode('lanes')}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                viewMode === 'lanes' ? 'bg-white text-slate-950 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Traveler Lanes
            </button>
          </div>

          {/* Editable Category & Color Legend */}
          <button
            onClick={() => setIsLegendOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 transition cursor-pointer"
            title="Edit category and Google Calendar color mappings"
          >
            <div className="flex items-center -space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#8e24aa] ring-1 ring-white" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#039be5] ring-1 ring-white" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#f57c00] ring-1 ring-white" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#c2185b] ring-1 ring-white" />
            </div>
            Category Mappings
          </button>

          {onOpenGoogleCalendarImport && (
            <button
              onClick={onOpenGoogleCalendarImport}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Import Google Calendar events (.ics, API, or JSON)"
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Import Google Calendar
            </button>
          )}

          {isAdminUser && onOpenFeedImport && (
            <button
              onClick={onOpenFeedImport}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Layers className="w-3.5 h-3.5 text-brand-400" /> Daily Review Feed
            </button>
          )}

          {isAdminUser && onOpenDataSync && (
            <button
              onClick={onOpenDataSync}
              className="px-3.5 py-1.5 rounded-lg brand-gradient text-white text-xs font-bold transition shadow-brand hover:brightness-105 flex items-center gap-1.5 cursor-pointer"
              title="Fetch and sync live data from Google Calendar, Gmail, and WhatsApp"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Fetch Live Channels
            </button>
          )}
        </div>
      </div>

      {/* 3. Sub-Toolbar: Category Filter & Calendar Toggles */}
      <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Category filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mr-1">
            Categories:
          </span>
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-slate-900 text-white font-bold'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setCategoryFilter('groups')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer border ${
              categoryFilter === 'groups'
                ? 'bg-[#8e24aa] text-white font-bold border-transparent'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Groups
          </button>
          <button
            onClick={() => setCategoryFilter('tour_operators')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer border ${
              categoryFilter === 'tour_operators'
                ? 'bg-[#039be5] text-white font-bold border-transparent'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Tour Operators
          </button>
          <button
            onClick={() => setCategoryFilter('special_interest')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer border ${
              categoryFilter === 'special_interest'
                ? 'bg-[#f57c00] text-white font-bold border-transparent'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Special-Interest
          </button>
          <button
            onClick={() => setCategoryFilter('luxury')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer border ${
              categoryFilter === 'luxury'
                ? 'bg-[#c2185b] text-white font-bold border-transparent'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Luxury VIP
          </button>
          <button
            onClick={() => setCategoryFilter('arrival')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer border ${
              categoryFilter === 'arrival'
                ? 'bg-[#0b8043] text-white font-bold border-transparent'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Arrivals
          </button>
          <button
            onClick={() => setCategoryFilter('departure')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer border ${
              categoryFilter === 'departure'
                ? 'bg-[#d50000] text-white font-bold border-transparent'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Departures
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search flights, cities, guides..."
            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 w-48 focus:outline-hidden focus:ring-1 focus:ring-slate-400"
          />
        </div>
      </div>

      {/* 4. Main Calendar Body by View Mode */}
      <div className="flex-1 overflow-auto bg-slate-100/50 p-4 relative">
        {/* VIEW 1: MONTH VIEW */}
        {viewMode === 'month' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-full min-h-[720px]">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-widest font-mono text-center py-2.5">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            <div className="grid grid-cols-7 flex-1 divide-x divide-y divide-slate-100 bg-white">
              {monthDays.map((day) => {
                const dayEvts = eventsByDate.get(day.dateString) || [];
                const isSelected = selectedDayString === day.dateString;

                return (
                  <div
                    key={day.id}
                    onClick={() => setSelectedDayString(day.dateString)}
                    className={`min-h-[110px] p-2 flex flex-col justify-between transition cursor-pointer relative group ${
                      !day.isCurrentMonth
                        ? 'bg-slate-50/70 text-slate-400'
                        : isSelected
                        ? 'bg-amber-50/50 ring-2 ring-inset ring-amber-400'
                        : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                          day.isToday
                            ? 'bg-slate-900 text-white font-bold'
                            : day.isCurrentMonth
                            ? 'text-slate-800'
                            : 'text-slate-400'
                        }`}
                      >
                        {day.dayNumber}
                      </span>
                      {dayEvts.length > 0 && (
                        <span className="text-[10px] font-mono text-slate-500">
                          {dayEvts.length} {dayEvts.length === 1 ? 'evt' : 'evts'}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 space-y-1 flex-1 overflow-y-auto max-h-[90px] pr-0.5">
                      {dayEvts.slice(0, 3).map((evt) => {
                        const parsed = parseFeedDate(evt.start, evt.timeZone);
                        const bgColor = evt.colorHex || '#039be5';
                        const cityOnThisDate = getCityForDate(evt, day.dateString);

                        return (
                          <div
                            key={evt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(evt);
                            }}
                            style={{ borderLeftColor: bgColor }}
                            className="text-[11px] p-1 rounded-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 border-l-[3px] text-slate-800 flex items-center justify-between gap-1 shadow-2xs group/evt truncate transition"
                            title={`${evt.title} (${evt.calendarName}) - ${cityOnThisDate}`}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <span style={{ color: bgColor }}>{renderEventIcon(evt)}</span>
                              <span className="truncate font-medium text-slate-900">
                                {evt.title}
                              </span>
                            </div>
                            {evt.isNeedsReview ? (
                              <span className="text-[9px] font-mono px-1 rounded bg-amber-100 text-amber-900 font-bold shrink-0">
                                Review
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono text-slate-500 shrink-0">
                                {parsed.isAllDay ? 'All Day' : parsed.timeString}
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {dayEvts.length > 3 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDayString(day.dateString);
                          }}
                          className="w-full text-left text-[10px] text-slate-600 hover:text-slate-900 font-mono pl-1 pt-0.5 hover:underline font-semibold cursor-pointer"
                        >
                          +{dayEvts.length - 3} more items
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: WEEK VIEW */}
        {viewMode === 'week' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-full min-h-[700px]">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 divide-x divide-slate-200">
              {weekDays.map((wd) => (
                <div
                  key={`head-${wd.id}`}
                  onClick={() => setSelectedDayString(wd.dateString)}
                  className="py-3 px-2 text-center cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="text-xs font-mono font-bold text-slate-700">{wd.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {(eventsByDate.get(wd.dateString) || []).length} items
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 flex-1 divide-x divide-slate-200 overflow-y-auto">
              {weekDays.map((wd) => {
                const dayEvts = eventsByDate.get(wd.dateString) || [];
                return (
                  <div key={wd.id} className="p-2.5 space-y-2 bg-white">
                    {dayEvts.map((evt) => {
                      const p = parseFeedDate(evt.start, evt.timeZone);
                      const bgColor = evt.colorHex || '#039be5';
                      const cityOnThisDate = getCityForDate(evt, wd.dateString);

                      return (
                        <div
                          key={evt.id}
                          onClick={() => setSelectedEvent(evt)}
                          style={{ borderLeftColor: bgColor }}
                          className="p-2 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 border-l-[3px] text-xs cursor-pointer transition shadow-2xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span
                              style={{ color: bgColor }}
                              className="font-mono text-[10px] font-bold flex items-center gap-1"
                            >
                              {renderEventIcon(evt)} {evt.label || 'Event'}
                            </span>
                            {evt.isNeedsReview && (
                              <span className="text-[9px] font-mono px-1 rounded bg-amber-100 text-amber-900 font-bold">
                                Needs review
                              </span>
                            )}
                          </div>

                          <div className="font-bold text-slate-900 leading-snug">{evt.title}</div>
                          <div className="text-[11px] text-slate-600">
                            {p.isAllDay ? 'All Day' : p.timeString + ' EAT'}
                          </div>

                          <div className="text-[11px] text-slate-600 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{cityOnThisDate}</span>
                          </div>
                        </div>
                      );
                    })}

                    {dayEvts.length === 0 && (
                      <div className="text-center py-12 text-slate-400 text-xs italic">
                        No operations scheduled
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: AGENDA VIEW */}
        {viewMode === 'agenda' && (
          <div className="max-w-4xl mx-auto space-y-6 pb-12">
            {monthDays
              .filter((d) => d.isCurrentMonth && (eventsByDate.get(d.dateString) || []).length > 0)
              .map((day) => {
                const dayEvts = eventsByDate.get(day.dateString) || [];
                return (
                  <div
                    key={day.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"
                  >
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-serif font-bold text-slate-950">
                          {day.date.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {dayEvts.length} {dayEvts.length === 1 ? 'operation' : 'operations'}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedDayString(day.dateString)}
                        className="text-xs text-brand-600 hover:text-brand-800 font-semibold cursor-pointer"
                      >
                        Open Day Drawer &rarr;
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {dayEvts.map((evt) => {
                        const parsed = parseFeedDate(evt.start, evt.timeZone);
                        const isMidnight = parsed.isMidnight;
                        const isOvernight = evt.isOvernightTransfer;
                        const color = evt.colorHex || '#039be5';
                        const cityOnThisDate = getCityForDate(evt, day.dateString);

                        return (
                          <div
                            key={evt.id}
                            onClick={() => setSelectedEvent(evt)}
                            className="p-5 hover:bg-slate-50 transition cursor-pointer flex flex-col md:flex-row md:items-start justify-between gap-4"
                          >
                            <div className="flex items-start gap-3.5 min-w-0">
                              <div
                                style={{ backgroundColor: `${color}15`, color: color }}
                                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border border-slate-200"
                              >
                                {renderEventIcon(evt)}
                              </div>
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-bold text-slate-950 font-serif">
                                    {evt.title}
                                  </h4>
                                  <span
                                    style={{ color: color }}
                                    className="text-[10px] font-mono uppercase tracking-wider font-bold"
                                  >
                                    [{evt.label || 'Event'}]
                                  </span>
                                  {evt.isNeedsReview && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-mono font-bold flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3 text-amber-600" /> Needs review
                                    </span>
                                  )}
                                  {isMidnight && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 font-mono font-bold">
                                      MIDNIGHT SLOT
                                    </span>
                                  )}
                                  {isOvernight && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900 text-indigo-100 font-mono font-bold">
                                      OVERNIGHT CONVOY
                                    </span>
                                  )}
                                </div>

                                {evt.description && (
                                  <p className="text-xs text-slate-600 line-clamp-2">
                                    {evt.description}
                                  </p>
                                )}

                                {/* Date-specific city rendering */}
                                <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                                  <span className="flex items-center gap-1 text-slate-700 font-medium">
                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{cityOnThisDate}</span>
                                  </span>

                                  {evt.hotelName && (
                                    <span className="flex items-center gap-1 text-slate-700">
                                      <Building className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Hotel: {evt.hotelName}</span>
                                    </span>
                                  )}

                                  {evt.guideName && (
                                    <span className="flex items-center gap-1 text-slate-700">
                                      <User className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Guide: {evt.guideName}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="md:text-right shrink-0 space-y-1 text-xs">
                              <div className="font-mono font-bold text-slate-900">
                                {parsed.isAllDay ? 'All Day' : `${parsed.timeString} EAT`}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                Source: {evt.calendarName}
                              </div>
                              {evt.sourceUrl && (
                                <a
                                  href={evt.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-800 font-medium"
                                >
                                  Original Link <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* VIEW 4: TRAVELER LANES */}
        {viewMode === 'lanes' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div>
              <h3 className="text-lg font-serif font-bold text-slate-950">
                Traveler Operational Swimlanes
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Multi-day timeline view per client covering flight connections, hotel stays, guided days, and visa status.
              </p>
            </div>

            <div className="space-y-4">
              {feedTravelers.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs italic bg-slate-50 rounded-lg">
                  No traveler profiles currently linked in the feed. Import the daily review feed to populate lanes.
                </div>
              ) : (
                feedTravelers.map((traveler) => {
                  const travelerEvts = visibleEvents.filter((e) => e.travelerId === traveler.id);

                  return (
                    <div
                      key={traveler.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              traveler.avatar ||
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
                            }
                            alt={traveler.name}
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900 font-serif">
                                {traveler.name}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                                {traveler.bookingStage || 'Confirmed'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {traveler.nationality || 'International'} · {traveler.visaStatus || 'Visa OK'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onOpenTravelerDossier && onOpenTravelerDossier(traveler.id, traveler.name)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition cursor-pointer"
                          >
                            View Full Dossier &rarr;
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 overflow-x-auto pb-1 pt-1">
                        {travelerEvts.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">
                            No explicit calendar events mapped for this traveler.
                          </span>
                        ) : (
                          travelerEvts.map((e) => {
                            const p = parseFeedDate(e.start, e.timeZone);
                            const color = e.colorHex || '#039be5';
                            const cityOnThisDate = getCityForDate(e, p.dateString);
                            return (
                              <div
                                key={e.id}
                                onClick={() => setSelectedEvent(e)}
                                style={{ borderLeftColor: color }}
                                className="min-w-[210px] p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 border-l-[3px] text-xs cursor-pointer transition shadow-2xs space-y-1 shrink-0"
                              >
                                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                                  <span>{p.dateString}</span>
                                  <span style={{ color: color }} className="font-bold">
                                    {p.isAllDay ? 'All Day' : p.timeString}
                                  </span>
                                </div>
                                <div className="font-bold text-slate-900 line-clamp-1">{e.title}</div>
                                <div className="text-[10px] text-slate-600 truncate">
                                  {cityOnThisDate}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. DAY-DETAIL DRAWER */}
      {selectedDayString && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col font-sans text-slate-900 animate-in slide-in-from-right duration-200">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
                Day Operational Dossier
              </span>
              <h3 className="text-xl font-serif font-bold text-slate-950 mt-0.5">
                {new Date(selectedDayString).toLocaleDateString('en-US', {
                  timeZone: 'UTC',
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h3>
            </div>
            <button
              onClick={() => setSelectedDayString(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-bold">
              Scheduled Movements & Events ({(eventsByDate.get(selectedDayString) || []).length}):
            </span>

            {(eventsByDate.get(selectedDayString) || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-lg border border-slate-200">
                No events on this calendar date.
              </div>
            ) : (
              (eventsByDate.get(selectedDayString) || []).map((evt) => {
                const p = parseFeedDate(evt.start, evt.timeZone);
                const color = evt.colorHex || '#039be5';
                const cityOnThisDate = getCityForDate(evt, selectedDayString);

                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    style={{ borderLeftColor: color }}
                    className="p-3.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 border-l-[4px] cursor-pointer transition space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        style={{ color: color }}
                        className="text-[10px] font-mono font-bold flex items-center gap-1 uppercase"
                      >
                        {renderEventIcon(evt)} {evt.label || 'Event'}
                      </span>
                      <div className="flex items-center gap-2">
                        {evt.isNeedsReview && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                            Needs review
                          </span>
                        )}
                        <span className="text-[11px] font-mono font-bold text-slate-700">
                          {p.isAllDay ? 'All Day' : `${p.timeString} EAT`}
                        </span>
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-slate-950 leading-snug font-serif">
                      {evt.title}
                    </h4>

                    {evt.description && (
                      <p className="text-xs text-slate-600 line-clamp-2">{evt.description}</p>
                    )}

                    <div className="pt-1 text-xs text-slate-600 space-y-1">
                      <div className="flex items-center gap-1 font-medium text-slate-900">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{cityOnThisDate}</span>
                      </div>
                      {evt.hotelName && (
                        <div className="flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>Hotel: {evt.hotelName}</span>
                        </div>
                      )}
                      {evt.guideName && (
                        <div className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>Guide: {evt.guideName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 6. EVENT DETAIL MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 text-slate-900 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    style={{ color: selectedEvent.colorHex || '#039be5' }}
                    className="text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1"
                  >
                    {renderEventIcon(selectedEvent)} {selectedEvent.label || 'Event'}
                  </span>
                  {selectedEvent.isNeedsReview && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-mono font-bold">
                      Needs review
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-serif font-bold text-slate-950 mt-1">
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedEvent.isNeedsReview && selectedEvent.reviewReason && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <span className="font-bold">Classification Note: </span>
                {selectedEvent.reviewReason}
              </div>
            )}

            <div className="space-y-3 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Source Calendar:</span>
                <span className="font-mono font-bold text-slate-900">
                  {selectedEvent.calendarName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Source ID:</span>
                <span className="font-mono text-slate-700">{selectedEvent.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Time & Timezone:</span>
                <span className="font-mono text-slate-900">
                  {parseFeedDate(selectedEvent.start, selectedEvent.timeZone).timeString} {selectedEvent.allDay ? '' : 'EAT'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Actual Date City:</span>
                <span className="font-medium text-slate-900">
                  {getCityForDate(selectedEvent, parseFeedDate(selectedEvent.start, selectedEvent.timeZone).dateString)}
                </span>
              </div>
            </div>

            {selectedEvent.description && (
              <div className="text-xs text-slate-700 leading-relaxed">
                <span className="font-bold text-slate-900 block mb-1">Description:</span>
                {selectedEvent.description}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              {isAdminUser && selectedEvent.sourceUrl ? (
                <a
                  href={selectedEvent.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-950 flex items-center gap-1"
                >
                  Open in Google Calendar <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <span className="text-[11px] text-slate-400 italic">Internal agency calendar record</span>
              )}

              {selectedEvent.travelerId && onOpenTravelerDossier && (
                <button
                  onClick={() => {
                    const tId = selectedEvent.travelerId!;
                    setSelectedEvent(null);
                    onOpenTravelerDossier(tId);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
                >
                  View Traveler Dossier &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. EDITABLE CATEGORY MAPPINGS MODAL */}
      {isLegendOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full p-6 text-slate-900 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-serif font-bold text-slate-950">
                  Client Category & Calendar Color Mappings
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  The owner's distinct colors for groups, tour operators, special-interest, and luxury.
                </p>
              </div>
              <button
                onClick={() => setIsLegendOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 block mb-2">
                  Client & Booking Categories (Owner's Palette)
                </span>
                <div className="space-y-2">
                  {activeMappings
                    .filter((m) => m.type === 'category')
                    .map((mapping, idx) => (
                      <div
                        key={mapping.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            style={{ backgroundColor: mapping.colorHex }}
                            className="w-4 h-4 rounded-full shrink-0 ring-2 ring-white shadow-xs"
                          />
                          <div>
                            <input
                              type="text"
                              value={mapping.label}
                              onChange={(e) => {
                                const updated = [...activeMappings];
                                const targetIdx = updated.findIndex((x) => x.id === mapping.id);
                                if (targetIdx >= 0) {
                                  updated[targetIdx] = { ...mapping, label: e.target.value };
                                  setActiveMappings(updated);
                                }
                              }}
                              className="font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-800 focus:outline-hidden"
                            />
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              {mapping.description}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">{mapping.colorHex}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 block mb-2">
                  Operational Movement Markers (Explicit Evidence Required)
                </span>
                <div className="space-y-2">
                  {activeMappings
                    .filter((m) => m.type === 'movement')
                    .map((mapping) => (
                      <div
                        key={mapping.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            style={{ backgroundColor: mapping.colorHex }}
                            className="w-4 h-4 rounded-full shrink-0 ring-2 ring-white shadow-xs"
                          />
                          <div>
                            <span className="font-bold text-slate-900 block">{mapping.label}</span>
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              {mapping.description}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">{mapping.colorHex}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => {
                  setActiveMappings(DEFAULT_CATEGORY_MAPPINGS);
                  if (handleUpdateMappings) handleUpdateMappings(DEFAULT_CATEGORY_MAPPINGS);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Reset to Defaults
              </button>
              <button
                onClick={() => {
                  if (handleUpdateMappings) handleUpdateMappings(activeMappings);
                  setIsLegendOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
              >
                Save Category Mappings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
