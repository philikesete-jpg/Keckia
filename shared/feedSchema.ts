/**
 * Feed Schema Version 1, Google Calendar color mappings, client categories,
 * date parser, and validation engine.
 * Shared across the server API and client components.
 */

export const AUTHENTIC_GOOGLE_COLORS = {
  arrival: '#0b8043', // Green
  departure: '#d50000', // Red
  tentative: '#f6bf26', // Yellow
  superseded: '#616161', // Gray
} as const;

export const CATEGORY_COLORS = {
  groups: '#8e24aa', // Purple - Group Expeditions & Delegations
  tour_operators: '#039be5', // Ocean Blue - Wholesale / B2B Tour Operators
  special_interest: '#f57c00', // Amber/Orange - Photography, Steam Railway, Archaeology
  luxury: '#c2185b', // Ruby / Deep Rose - Luxury Requests & VIP Charters
} as const;

export interface CategoryMapping {
  id: string;
  type: 'category' | 'movement';
  colorHex: string;
  label: string;
  iconName: string;
  description: string;
  isSystemDefault: boolean;
}

export const DEFAULT_CATEGORY_MAPPINGS: CategoryMapping[] = [
  // 1. Client & Booking Categories (Owner's Category System)
  {
    id: 'cat_groups',
    type: 'category',
    colorHex: CATEGORY_COLORS.groups,
    label: 'Group Expeditions & Delegations',
    iconName: 'Users',
    description: 'Scheduled group departures and organized institutional delegations.',
    isSystemDefault: true,
  },
  {
    id: 'cat_tour_operators',
    type: 'category',
    colorHex: CATEGORY_COLORS.tour_operators,
    label: 'Tour Operators & Wholesale Partners',
    iconName: 'Layers',
    description: 'International travel agents, B2B wholesale tour operators.',
    isSystemDefault: true,
  },
  {
    id: 'cat_special_interest',
    type: 'category',
    colorHex: CATEGORY_COLORS.special_interest,
    label: 'Special-Interest Clients',
    iconName: 'Sparkles',
    description: 'Architectural photography, 1938 steam railway charters, archaeological research.',
    isSystemDefault: true,
  },
  {
    id: 'cat_luxury',
    type: 'category',
    colorHex: CATEGORY_COLORS.luxury,
    label: 'Luxury Requests & VIP Charters',
    iconName: 'Award',
    description: 'High-end custom charters, luxury suites, private marine catamarans.',
    isSystemDefault: true,
  },

  // 2. Operational Movement Markers (Requires Explicit Evidence)
  {
    id: 'mov_arrival',
    type: 'movement',
    colorHex: AUTHENTIC_GOOGLE_COLORS.arrival,
    label: 'Arrival (Flight / Port)',
    iconName: 'PlaneLanding',
    description: 'Inbound flight landing or port disembarkation (requires explicit text evidence).',
    isSystemDefault: true,
  },
  {
    id: 'mov_departure',
    type: 'movement',
    colorHex: AUTHENTIC_GOOGLE_COLORS.departure,
    label: 'Departure (Flight / Port)',
    iconName: 'PlaneTakeoff',
    description: 'Outbound flight departure or port embarkation (requires explicit text evidence).',
    isSystemDefault: true,
  },
  {
    id: 'mov_overnight_transfer',
    type: 'movement',
    colorHex: '#3f51b5',
    label: 'Overnight Transfer / Convoy',
    iconName: 'Truck',
    description: 'Night transit between cities (distinct from flight arrivals).',
    isSystemDefault: true,
  },
  {
    id: 'mov_tentative',
    type: 'movement',
    colorHex: AUTHENTIC_GOOGLE_COLORS.tentative,
    label: 'Tentative / Pending Confirmation',
    iconName: 'HelpCircle',
    description: 'Provisional dates or pending government permits (requires explicit text evidence).',
    isSystemDefault: true,
  },
  {
    id: 'mov_superseded',
    type: 'movement',
    colorHex: AUTHENTIC_GOOGLE_COLORS.superseded,
    label: 'Superseded / Rescheduled / Historic',
    iconName: 'Clock',
    description: 'Cancelled or historic schedules replaced by new dates (requires explicit text evidence).',
    isSystemDefault: true,
  },
];

export type FeedDateOrString =
  | string
  | {
      date?: string;
      dateTime?: string;
      timeZone?: string;
    };

export interface FeedSource {
  id: string;
  type: string;
  name: string;
  checkedAt?: string;
  coverage?: string;
  status: 'ok' | 'partial' | 'error' | 'pending';
  error?: string;
  missingAuth?: boolean;
}

export interface DayItineraryStop {
  date: string; // YYYY-MM-DD
  city: string; // Specific city visited on this date
  hotelName?: string;
  guideName?: string;
  driverName?: string;
  activityNotes?: string;
}

export interface FeedEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  description?: string;
  start: FeedDateOrString;
  end?: FeedDateOrString;
  allDay?: boolean;
  timeZone?: string;
  colorId?: string;
  colorHex?: string;
  label?: string;
  categoryKey?: 'groups' | 'tour_operators' | 'special_interest' | 'luxury' | string;
  location?: string;
  sourceUrl?: string;
  status?: string;
  cities?: string[]; // All cities across the event
  dailyCityMap?: Record<string, string>; // Maps YYYY-MM-DD -> specific city on that actual date
  itineraryStops?: DayItineraryStop[];
  travelerId?: string;

  // Operational linkages
  flightNumber?: string;
  airportCode?: string;
  isOvernightTransfer?: boolean;
  hotelName?: string;
  guideName?: string;
  driverName?: string;
  recurrence?: string[];
  isTentative?: boolean;
  isConflict?: boolean;
  isNeedsReview?: boolean; // Set when mapping is unknown or historical color overlaps without explicit evidence
  reviewReason?: string;
  missingFields?: string[];
  rawMetadata?: Record<string, any>;
}

export interface FeedTraveler {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  nationality?: string;
  bookingStage?: 'Inquiry' | 'Proposal' | 'Confirmed' | 'In Trip' | 'Completed' | 'Cancelled';
  confirmedStatus?: 'Confirmed' | 'Tentative' | 'Pending Deposit' | 'On Hold';
  itinerarySummary?: string;
  interests?: string[];
  price?: number;
  currency?: string;
  paymentStatus?: 'Paid' | 'Deposit Paid' | 'Pending' | 'Overdue';
  amountPaid?: number;
  flightDetails?: {
    arrivalFlight?: string;
    arrivalAirport?: string;
    arrivalTime?: string;
    departureFlight?: string;
    departureAirport?: string;
    departureTime?: string;
  };
  hotelDetails?: {
    hotelName?: string;
    roomType?: string;
    checkIn?: string;
    checkOut?: string;
  };
  mealRequirements?: string;
  visaStatus?: 'Issued' | 'Pending Approval' | 'Documents Needed' | 'Visa on Arrival' | 'Not Required';
  guideAssignment?: {
    name?: string;
    phone?: string;
    lodging?: string;
  };
  driverAssignment?: {
    name?: string;
    phone?: string;
    vehicle?: string;
    lodging?: string;
  };
  notes?: string;
  avatar?: string;
}

export interface ConversationMessage {
  id: string;
  sender: 'client' | 'agent' | 'bot';
  senderName?: string;
  content: string;
  timestamp: string;
}

export interface FeedConversation {
  id: string;
  travelerId?: string;
  travelerName?: string;
  channel: 'email' | 'whatsapp' | 'uchat';
  status: 'unanswered' | 'bot-only' | 'waiting-for-client';
  lastMessageAt: string;
  subject?: string;
  messages: ConversationMessage[];
}

export interface FeedDraft {
  id: string;
  travelerId?: string;
  conversationId?: string;
  type: 'reply' | 'calendar_edit' | 'booking_action';
  title: string;
  proposedAction: string;
  details: Record<string, any>;
  requiresApproval: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
}

export interface FeedConflict {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  eventIds?: string[];
  travelerId?: string;
  detectedAt: string;
}

export interface FeedTask {
  id: string;
  title: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  due?: string; // ISO string or YYYY-MM-DD
  status?: 'pending' | 'in_progress' | 'snoozed' | 'completed';
  travelerId?: string;
  travelerName?: string;
  sourceUrl?: string;
  evidence?: string;
  assignedTo?: string;
  category?: 'flight' | 'visa' | 'hotel' | 'conversation' | 'conflict' | 'general';
  snoozedUntil?: string;
  completedAt?: string;
  completedBy?: string;
}

export interface FeedSchemaV1 {
  generatedAt: string;
  timezone: string;
  sources?: FeedSource[];
  events?: FeedEvent[];
  travelers?: FeedTraveler[];
  conversations?: FeedConversation[];
  drafts?: FeedDraft[];
  conflicts?: FeedConflict[];
  tasks?: FeedTask[];
  rawMetadata?: Record<string, any>;
}

export interface ParsedDateInfo {
  iso: string;
  dateString: string;
  timeString: string;
  isAllDay: boolean;
  isMidnight: boolean;
  timeZone: string;
  raw: any;
}

export const ERITREA_TIME_ZONE = 'Africa/Asmara';

const eritreaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: ERITREA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const eritreaClock = new Intl.DateTimeFormat('en-US', {
  timeZone: ERITREA_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
});

export function eritreaDateString(date = new Date()): string {
  const parts = Object.fromEntries(eritreaDay.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Resolve an ISO wall time using its calendar's zone, independently of the device's zone.
export function calendarInstant(value: string, zone = ERITREA_TIME_ZONE): Date {
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/i.test(value)) {
    return new Date(value);
  }
  const wall = Date.parse(value + 'Z');
  if (!Number.isFinite(wall)) return new Date(NaN);
  const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' });
  const offsetAt = (instant: number) => {
    const offset = offsetFormat.formatToParts(instant).find(p => p.type === 'timeZoneName')?.value;
    const match = offset?.match(/^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return 0;
    const seconds = Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] || 0);
    return (match[1] === '-' ? -1 : 1) * seconds * 1000;
  };
  // At a DST overlap use the earlier occurrence. In a gap advance by the skipped hour.
  const before = offsetAt(wall - 86400000);
  const candidate = wall - before;
  if (offsetAt(candidate) === before) return new Date(candidate);
  const after = offsetAt(wall + 86400000);
  const laterOffsetCandidate = wall - after;
  return new Date(offsetAt(laterOffsetCandidate) === after ? laterOffsetCandidate : candidate);
}

export function parseFeedDate(
  raw: FeedDateOrString | undefined | null,
  fallbackTimezone = ERITREA_TIME_ZONE,
): ParsedDateInfo {
  const timeZone = (raw && typeof raw === 'object' && raw.timeZone) || fallbackTimezone;
  const value = (typeof raw === 'string' ? raw : raw?.dateTime || raw?.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { iso: `${value}T00:00:00.000Z`, dateString: value, timeString: 'All Day',
      isAllDay: true, isMidnight: false, timeZone, raw };
  }
  let instant: Date;
  try {
    instant = calendarInstant(value, timeZone);
  } catch {
    // Older feed records may carry a label instead of an IANA timezone.
    instant = calendarInstant(value, ERITREA_TIME_ZONE);
  }
  const valid = Number.isFinite(instant.getTime());
  const date = valid ? instant : new Date();
  const timeString = valid ? eritreaClock.format(date).replace(/\s+/g, ' ') : '—';
  return { iso: date.toISOString(), dateString: eritreaDateString(date), timeString,
    isAllDay: false, isMidnight: /^12:\d{2} AM$/.test(timeString), timeZone, raw };
}

export function formatEritreaDateTime(value: string): string {
  const parsed = parseFeedDate(value);
  return parsed.isAllDay ? parsed.dateString : `${parsed.dateString} · ${parsed.timeString} EAT`;
}

export function getEventUniqueKey(event: { id: string; calendarId?: string }): string {
  const cal = event.calendarId || 'default_calendar';
  return `${cal}__${event.id}`;
}

/**
 * Strict textual evidence check for operational movement roles.
 * Prevents treating historical red/green/yellow/gray as arrival/departure/tentative/superseded
 * unless explicit title/description evidence proves it.
 */
export function detectExplicitOperationalEvidence(text: string): {
  isArrival: boolean;
  isDeparture: boolean;
  isOvernight: boolean;
  isTentative: boolean;
  isSuperseded: boolean;
} {
  const lower = text.toLowerCase();
  return {
    isArrival: /\b(arrival|arriving|flight\s+in|landing|inbound\s+flight|touches\s+down)\b/i.test(lower),
    isDeparture: /\b(departure|departing|flight\s+out|takeoff|take-off|outbound\s+flight|departs)\b/i.test(lower),
    isOvernight: /\b(overnight\s+transfer|overnight\s+convoy|night\s+drive|night\s+transit|overnight\s+ferry)\b/i.test(lower),
    isTentative: /\b(tentative|provisional|tbd|pending\s+confirm|to\s+be\s+confirmed)\b/i.test(lower),
    isSuperseded: /\b(superseded|cancelled|canceled|void|rescheduled\s+from|historic\s+schedule)\b/i.test(lower),
  };
}

/**
 * Normalizes an event, enforcing:
 * 1. Preservation of original colors.
 * 2. Editable category mappings (groups, tour operators, special-interest, luxury).
 * 3. Never treating red as departure, green as arrival, gray as superseded, yellow as tentative without explicit evidence.
 * 4. Assigning "Needs review" when mapping is unknown or lacks evidence.
 * 5. Date-specific city mapping without inventing itineraries.
 */
export function normalizeFeedEvent(
  rawEvent: any,
  fallbackCalendarId: string = 'imported_calendar',
  fallbackCalendarName: string = 'Imported Operations Feed'
): FeedEvent {
  const id = String(rawEvent?.id || `evt_${Math.random().toString(36).substring(2, 9)}`);
  const calendarId = String(rawEvent?.calendarId || fallbackCalendarId);
  const calendarName = String(rawEvent?.calendarName || fallbackCalendarName);
  const title = String(rawEvent?.title || 'Untitled Operational Event').trim();
  const description = rawEvent?.description ? String(rawEvent.description) : '';
  const start = rawEvent?.start || new Date().toISOString();
  const end = rawEvent?.end || rawEvent?.start;
  const location = rawEvent?.location ? String(rawEvent.location) : '';
  const sourceUrl = rawEvent?.sourceUrl ? String(rawEvent.sourceUrl) : undefined;
  const status = rawEvent?.status ? String(rawEvent.status) : 'confirmed';

  const parsedStart = parseFeedDate(start, rawEvent?.timeZone);
  const allDay = Boolean(rawEvent?.allDay ?? parsedStart.isAllDay);

  // Preserve original color hex
  const colorHex = rawEvent?.colorHex ? String(rawEvent.colorHex).toLowerCase() : undefined;
  let label = rawEvent?.label;
  let categoryKey = rawEvent?.categoryKey;
  let isNeedsReview = false;
  let reviewReason = '';

  const fullText = `${title} ${description}`;
  const evidence = detectExplicitOperationalEvidence(fullText);

  // Check explicit evidence first
  let isOvernightTransfer = Boolean(rawEvent?.isOvernightTransfer || evidence.isOvernight);
  let isTentative = Boolean(rawEvent?.isTentative || evidence.isTentative);

  // Guard against naive color assumptions!
  if (colorHex === AUTHENTIC_GOOGLE_COLORS.arrival.toLowerCase()) {
    if (evidence.isArrival) {
      label = label || 'Arrival (Flight / Port)';
    } else {
      // Historical color overlap - does NOT mean arrival
      isNeedsReview = true;
      reviewReason = 'Green event without explicit arrival flight/port text evidence.';
      label = label || 'Operational Event';
    }
  } else if (colorHex === AUTHENTIC_GOOGLE_COLORS.departure.toLowerCase()) {
    if (evidence.isDeparture) {
      label = label || 'Departure (Flight / Port)';
    } else {
      // Historical color overlap - does NOT mean departure
      isNeedsReview = true;
      reviewReason = 'Red event without explicit departure flight/port text evidence.';
      label = label || 'Operational Event';
    }
  } else if (colorHex === AUTHENTIC_GOOGLE_COLORS.tentative.toLowerCase()) {
    if (evidence.isTentative) {
      label = label || 'Tentative / Pending Confirmation';
      isTentative = true;
    } else {
      isNeedsReview = true;
      reviewReason = 'Yellow event without explicit tentative text evidence.';
      label = label || 'Operational Event';
    }
  } else if (colorHex === AUTHENTIC_GOOGLE_COLORS.superseded.toLowerCase()) {
    if (evidence.isSuperseded) {
      label = label || 'Superseded / Rescheduled / Historic';
    } else {
      isNeedsReview = true;
      reviewReason = 'Gray event without explicit superseded/cancelled text evidence.';
      label = label || 'Operational Event';
    }
  } else if (colorHex === CATEGORY_COLORS.groups.toLowerCase()) {
    categoryKey = 'groups';
    label = label || 'Group Expedition / Delegation';
  } else if (colorHex === CATEGORY_COLORS.tour_operators.toLowerCase()) {
    categoryKey = 'tour_operators';
    label = label || 'Tour Operator Partner';
  } else if (colorHex === CATEGORY_COLORS.special_interest.toLowerCase()) {
    categoryKey = 'special_interest';
    label = label || 'Special-Interest Client';
  } else if (colorHex === CATEGORY_COLORS.luxury.toLowerCase()) {
    categoryKey = 'luxury';
    label = label || 'Luxury VIP Charter';
  } else if (colorHex) {
    // Preserve custom color without guessing
    label = label || 'Operational Event';
  } else {
    // No color provided: check if title provides explicit evidence
    if (evidence.isArrival) {
      label = 'Arrival (Flight / Port)';
    } else if (evidence.isDeparture) {
      label = 'Departure (Flight / Port)';
    } else if (evidence.isOvernight) {
      label = 'Overnight Transfer';
    } else {
      isNeedsReview = true;
      reviewReason = 'Unmapped event color and category.';
      label = 'Needs review';
    }
  }

  // Detect flights
  let flightNumber = rawEvent?.flightNumber;
  let airportCode = rawEvent?.airportCode;

  if (!flightNumber && !isOvernightTransfer && (evidence.isArrival || evidence.isDeparture)) {
    const flightMatch = title.match(/\b([A-Z0-9]{2}\s?\d{3,4})\b/i);
    if (flightMatch) {
      flightNumber = flightMatch[1].toUpperCase().replace(/\s+/, '');
    }
  }

  if (!airportCode) {
    if (lowerIncludes(fullText, 'asm') || lowerIncludes(fullText, 'asmara')) {
      airportCode = 'ASM';
    } else if (lowerIncludes(fullText, 'msw') || lowerIncludes(fullText, 'massawa')) {
      airportCode = 'MSW';
    }
  }

  // Date-specific city mapping:
  // "Show each itinerary city on its actual date; do not assign every mentioned city to every day."
  const cities: string[] = Array.isArray(rawEvent?.cities)
    ? rawEvent.cities.filter(Boolean).map(String)
    : [];

  const dailyCityMap: Record<string, string> =
    rawEvent?.dailyCityMap && typeof rawEvent.dailyCityMap === 'object'
      ? { ...rawEvent.dailyCityMap }
      : {};

  // If dailyCityMap is not provided, populate only if single-day or explicit day breakdown
  const parsedStartStr = parsedStart.dateString;
  const parsedEnd = rawEvent?.end ? parseFeedDate(rawEvent.end, rawEvent.timeZone) : parsedStart;
  const isSingleDay = parsedStartStr === parsedEnd.dateString;

  if (isSingleDay && cities.length === 1 && !dailyCityMap[parsedStartStr]) {
    dailyCityMap[parsedStartStr] = cities[0];
  }

  // If multi-day event with multiple cities without a daily map, do NOT assign every city to every day!
  const missingFields: string[] = [];
  if (cities.length === 0 && !evidence.isArrival && !evidence.isDeparture) {
    missingFields.push('City not yet confirmed');
  }
  if (!rawEvent?.hotelName && !isOvernightTransfer && !evidence.isArrival && !evidence.isDeparture) {
    missingFields.push('Hotel unassigned');
  }
  if (!rawEvent?.guideName && (categoryKey === 'groups' || categoryKey === 'special_interest')) {
    missingFields.push('Guide unassigned');
  }

  return {
    id,
    calendarId,
    calendarName,
    title,
    description,
    start,
    end,
    allDay,
    timeZone: rawEvent?.timeZone || parsedStart.timeZone,
    colorId: rawEvent?.colorId,
    colorHex: rawEvent?.colorHex, // Preserve original color untouched
    label,
    categoryKey,
    location,
    sourceUrl,
    status,
    cities,
    dailyCityMap,
    itineraryStops: Array.isArray(rawEvent?.itineraryStops) ? rawEvent.itineraryStops : undefined,
    travelerId: rawEvent?.travelerId ? String(rawEvent.travelerId) : undefined,
    flightNumber,
    airportCode,
    isOvernightTransfer,
    hotelName: rawEvent?.hotelName ? String(rawEvent.hotelName) : undefined,
    guideName: rawEvent?.guideName ? String(rawEvent.guideName) : undefined,
    driverName: rawEvent?.driverName ? String(rawEvent.driverName) : undefined,
    recurrence: Array.isArray(rawEvent?.recurrence) ? rawEvent.recurrence : undefined,
    isTentative,
    isConflict: Boolean(rawEvent?.isConflict),
    isNeedsReview: Boolean(rawEvent?.isNeedsReview || isNeedsReview),
    reviewReason: rawEvent?.reviewReason || reviewReason || undefined,
    missingFields,
    rawMetadata: rawEvent?.rawMetadata || rawEvent,
  };
}

function lowerIncludes(str: string, target: string): boolean {
  return str.toLowerCase().includes(target.toLowerCase());
}

/**
 * Returns the exact city for a specific date, adhering strictly to:
 * "Show each itinerary city on its actual date; do not assign every mentioned city to every day.
 * If unknown say City not yet confirmed; never invent itinerary."
 */
export function getCityForDate(event: FeedEvent, dateString: string): string {
  // 1. Direct date map lookup
  if (event.dailyCityMap && event.dailyCityMap[dateString]) {
    return event.dailyCityMap[dateString];
  }

  // 2. Day itinerary stops lookup
  if (event.itineraryStops && event.itineraryStops.length > 0) {
    const match = event.itineraryStops.find((s) => s.date === dateString);
    if (match && match.city) return match.city;
  }

  // 3. Single-day event with a single city
  const pStart = parseFeedDate(event.start, event.timeZone);
  const pEnd = event.end ? parseFeedDate(event.end, event.timeZone) : pStart;
  if (pStart.dateString === pEnd.dateString && event.cities && event.cities.length === 1) {
    if (pStart.dateString === dateString) {
      return event.cities[0];
    }
  }

  // 4. Multi-day trip without date assignment must NOT assign every city to every day
  return 'City not yet confirmed';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  feed?: FeedSchemaV1;
  counts: {
    sources: number;
    events: number;
    travelers: number;
    conversations: number;
    drafts: number;
    conflicts: number;
    tasks: number;
  };
}

export function validateFeedSchemaV1(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts = {
    sources: 0,
    events: 0,
    travelers: 0,
    conversations: 0,
    drafts: 0,
    conflicts: 0,
    tasks: 0,
  };

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      errors: ['The feed payload must be a JSON object conforming to Feed Schema Version 1.'],
      warnings: [],
      counts,
    };
  }

  const obj = data as Record<string, any>;

  if (!obj.generatedAt || typeof obj.generatedAt !== 'string') {
    errors.push('Missing required field "generatedAt": must be an ISO timestamp (e.g. "2026-10-31T08:00:00Z").');
  } else {
    const testDate = new Date(obj.generatedAt);
    if (isNaN(testDate.getTime())) {
      errors.push(`Invalid timestamp in "generatedAt": "${obj.generatedAt}" is not a parseable date.`);
    }
  }

  const timezone = typeof obj.timezone === 'string' && obj.timezone.trim() ? obj.timezone.trim() : 'Africa/Asmara';

  const sources: FeedSource[] = [];
  if (obj.sources !== undefined) {
    if (!Array.isArray(obj.sources)) {
      errors.push('Field "sources" must be an array of FeedSource objects.');
    } else {
      obj.sources.forEach((src, idx) => {
        if (!src || typeof src !== 'object' || !src.id || !src.name) {
          warnings.push(`Source at index ${idx} is missing required "id" or "name".`);
        } else {
          sources.push({
            id: String(src.id),
            type: String(src.type || 'generic_source'),
            name: String(src.name),
            checkedAt: src.checkedAt ? String(src.checkedAt) : undefined,
            coverage: src.coverage ? String(src.coverage) : undefined,
            status: ['ok', 'partial', 'error', 'pending'].includes(src.status) ? src.status : 'ok',
            error: src.error ? String(src.error) : undefined,
            missingAuth: Boolean(src.missingAuth),
          });
        }
      });
      counts.sources = sources.length;
    }
  }

  const events: FeedEvent[] = [];
  const seenEventKeys = new Set<string>();

  if (obj.events !== undefined) {
    if (!Array.isArray(obj.events)) {
      errors.push('Field "events" must be an array of FeedEvent objects.');
    } else {
      obj.events.forEach((rawEvt, idx) => {
        if (!rawEvt || typeof rawEvt !== 'object') {
          warnings.push(`Event at index ${idx} is not an object and was skipped.`);
          return;
        }
        if (!rawEvt.id) {
          warnings.push(`Event at index ${idx} has no "id"; an operational identifier was generated.`);
        }
        if (!rawEvt.title) {
          warnings.push(`Event at index ${idx} has no "title".`);
        }

        const normalized = normalizeFeedEvent(
          rawEvt,
          rawEvt.calendarId || 'feed_master',
          rawEvt.calendarName || 'Operational Calendar Feed'
        );

        const key = getEventUniqueKey(normalized);
        if (seenEventKeys.has(key)) {
          warnings.push(`Duplicate event detected and deduplicated by source calendar and event ID: "${key}"`);
        } else {
          seenEventKeys.add(key);
          events.push(normalized);
        }
      });
      counts.events = events.length;
    }
  }

  const travelers: FeedTraveler[] = [];
  if (obj.travelers !== undefined) {
    if (!Array.isArray(obj.travelers)) {
      errors.push('Field "travelers" must be an array of FeedTraveler objects.');
    } else {
      obj.travelers.forEach((t, idx) => {
        if (!t || typeof t !== 'object' || !t.id || !t.name) {
          warnings.push(`Traveler at index ${idx} is missing "id" or "name".`);
        } else {
          travelers.push(t as FeedTraveler);
        }
      });
      counts.travelers = travelers.length;
    }
  }

  const conversations: FeedConversation[] = [];
  if (obj.conversations !== undefined) {
    if (!Array.isArray(obj.conversations)) {
      errors.push('Field "conversations" must be an array of FeedConversation objects.');
    } else {
      obj.conversations.forEach((c) => {
        if (c && typeof c === 'object' && c.id) {
          conversations.push(c as FeedConversation);
        }
      });
      counts.conversations = conversations.length;
    }
  }

  const drafts: FeedDraft[] = [];
  if (obj.drafts !== undefined) {
    if (!Array.isArray(obj.drafts)) {
      errors.push('Field "drafts" must be an array of FeedDraft objects.');
    } else {
      obj.drafts.forEach((d) => {
        if (d && typeof d === 'object' && d.id) {
          drafts.push({
            ...d,
            requiresApproval: true,
            status: d.status || 'pending',
          } as FeedDraft);
        }
      });
      counts.drafts = drafts.length;
    }
  }

  const conflicts: FeedConflict[] = [];
  if (obj.conflicts !== undefined) {
    if (!Array.isArray(obj.conflicts)) {
      errors.push('Field "conflicts" must be an array of FeedConflict objects.');
    } else {
      obj.conflicts.forEach((cf) => {
        if (cf && typeof cf === 'object' && cf.id) {
          conflicts.push(cf as FeedConflict);
        }
      });
      counts.conflicts = conflicts.length;
    }
  }

  const tasks: FeedTask[] = [];
  if (obj.tasks !== undefined) {
    if (!Array.isArray(obj.tasks)) {
      errors.push('Field "tasks" must be an array of FeedTask objects.');
    } else {
      obj.tasks.forEach((tsk, idx) => {
        if (!tsk || typeof tsk !== 'object' || !tsk.id || !tsk.title) {
          warnings.push(`Task at index ${idx} is missing required "id" or "title".`);
        } else {
          tasks.push({
            id: String(tsk.id),
            title: String(tsk.title),
            priority: (tsk.priority || 'medium') as any,
            due: tsk.due ? String(tsk.due) : undefined,
            status: (tsk.status || 'pending') as any,
            travelerId: tsk.travelerId ? String(tsk.travelerId) : undefined,
            travelerName: tsk.travelerName ? String(tsk.travelerName) : undefined,
            sourceUrl: tsk.sourceUrl ? String(tsk.sourceUrl) : undefined,
            evidence: tsk.evidence ? String(tsk.evidence) : undefined,
            assignedTo: tsk.assignedTo ? String(tsk.assignedTo) : undefined,
            category: tsk.category ? (String(tsk.category) as any) : undefined,
            snoozedUntil: tsk.snoozedUntil ? String(tsk.snoozedUntil) : undefined,
            completedAt: tsk.completedAt ? String(tsk.completedAt) : undefined,
            completedBy: tsk.completedBy ? String(tsk.completedBy) : undefined,
          });
        }
      });
      counts.tasks = tasks.length;
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    feed: valid
      ? {
          generatedAt: obj.generatedAt,
          timezone,
          sources: obj.sources !== undefined ? sources : undefined,
          events: obj.events !== undefined ? events : undefined,
          travelers: obj.travelers !== undefined ? travelers : undefined,
          conversations: obj.conversations !== undefined ? conversations : undefined,
          drafts: obj.drafts !== undefined ? drafts : undefined,
          conflicts: obj.conflicts !== undefined ? conflicts : undefined,
          tasks: obj.tasks !== undefined ? tasks : undefined,
          rawMetadata: obj.rawMetadata || {},
        }
      : undefined,
    counts,
  };
}

/**
 * Fictional sample feed showcasing:
 * 1. Owner's distinct colors for groups, tour operators, special-interest, and luxury.
 * 2. Explicit evidence for flight arrival & departure.
 * 3. An overlapping historical color event requiring review ("Needs review").
 * 4. Day-specific itinerary cities (Asmara on Nov 7, Massawa on Nov 8, Dahlak on Nov 9).
 * 5. Review schedule metadata (07:00 and 22:00 Africa/Asmara).
 */
export const SAMPLE_FICTIONAL_FEED_V1: FeedSchemaV1 & {
  notice: string;
  reviewSchedule: { plannedHours: string[]; timezone: string };
} = {
  notice: 'FICTIONAL SAMPLE DATA FOR TESTING FEED SCHEMA VERSION 1 - ERITREAVISIT OPERATIONS',
  generatedAt: '2026-10-31T07:55:00.000Z',
  timezone: 'Africa/Asmara',
  reviewSchedule: {
    plannedHours: ['07:00', '22:00'],
    timezone: 'Africa/Asmara',
  },
  sources: [
    {
      id: 'gcal_master',
      type: 'google_calendar',
      name: 'Eritrea Tours Master Calendar',
      checkedAt: '2026-10-31T07:55:00.000Z',
      coverage: '2026-10-25..2026-11-25',
      status: 'ok',
    },
    {
      id: 'flight_feed',
      type: 'aviation_api',
      name: 'Asmara International Airport (ASM) Ops',
      checkedAt: '2026-10-31T07:58:00.000Z',
      coverage: '2026-10-31..2026-11-10',
      status: 'ok',
    },
    {
      id: 'whatsapp_uchat',
      type: 'multichannel_inbox',
      name: 'WhatsApp & UChat Gateway',
      checkedAt: '2026-10-31T07:50:00.000Z',
      coverage: 'Real-time sync',
      status: 'partial',
      error: 'UChat webhook token renewal required within 48h; WhatsApp active',
      missingAuth: false,
    },
  ],
  events: [
    // 1. Explicit Flight Arrival (Green #0b8043)
    {
      id: 'evt_tk651_arrival',
      calendarId: 'flight_feed',
      calendarName: 'Asmara Airport (ASM) Flight Ops',
      title: 'Arrival TK651: Selam Tesfay (ASM landing)',
      description: 'Turkish Airlines flight TK651 from Istanbul (IST). Landing at Asmara Airport at 01:25 EAT midnight slot. Driver Yemane with Land Cruiser ER-2-18492.',
      start: {
        dateTime: '2026-11-05T01:25:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      end: {
        dateTime: '2026-11-05T02:15:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      allDay: false,
      colorHex: '#0b8043',
      label: 'Arrival (Flight / Port)',
      flightNumber: 'TK651',
      airportCode: 'ASM',
      location: 'Asmara International Airport (ASM), Terminal 1',
      sourceUrl: 'https://calendar.google.com/calendar/u/0/r/eventedit/sample_tk651',
      status: 'confirmed',
      cities: ['Asmara'],
      dailyCityMap: {
        '2026-11-05': 'Asmara',
      },
      hotelName: 'Hotel Asmara Palace',
      driverName: 'Yemane Berhe',
      guideName: 'Habtom Ghebre',
      travelerId: 'trav_selam_01',
    },
    // 2. Special-Interest Client (Orange #f57c00): Steam Train Photography
    {
      id: 'evt_steam_charter',
      calendarId: 'gcal_master',
      calendarName: 'Eritrea Tours Master Calendar',
      title: 'Special-Interest: Vintage 1938 Ansaldo Steam Train Charter (Asmara -> Nefasit)',
      description: 'Chartered 1938 Ansaldo 442 steam locomotive photography run on escarpment viaducts with photographer Marcus Vance.',
      start: {
        dateTime: '2026-11-06T08:30:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      end: {
        dateTime: '2026-11-06T15:00:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      allDay: false,
      colorHex: '#f57c00',
      categoryKey: 'special_interest',
      label: 'Special-Interest Client',
      location: 'Asmara Railway Station & Nefasit Escarpment',
      sourceUrl: 'https://calendar.google.com/calendar/u/0/r/eventedit/sample_train',
      status: 'confirmed',
      cities: ['Asmara', 'Nefasit'],
      dailyCityMap: {
        '2026-11-06': 'Asmara (Nefasit Viaduct)',
      },
      guideName: 'Filmon Kidane',
      driverName: 'Tekle Haile',
      travelerId: 'trav_marcus_02',
    },
    // 3. Multi-day Expedition with Date-Specific City Breakdown:
    // Nov 7: Asmara, Nov 8: Massawa, Nov 9: Dahlak Kebir
    {
      id: 'evt_dahlak_multiday',
      calendarId: 'gcal_master',
      calendarName: 'Eritrea Tours Master Calendar',
      title: 'Red Sea Coastal & Dahlak Marine Expedition',
      description: 'Escarpment descent to Massawa and private catamaran transit to Dahlak Archipelago.',
      start: {
        date: '2026-11-07',
      },
      end: {
        date: '2026-11-09',
      },
      allDay: true,
      colorHex: '#039be5',
      categoryKey: 'tour_operators',
      label: 'Tour Operator Partner',
      location: 'Massawa & Dahlak Marine National Park',
      sourceUrl: 'https://calendar.google.com/calendar/u/0/r/eventedit/sample_dahlak',
      status: 'confirmed',
      cities: ['Asmara', 'Massawa', 'Dahlak Kebir'],
      dailyCityMap: {
        '2026-11-07': 'Asmara',
        '2026-11-08': 'Massawa',
        '2026-11-09': 'Dahlak Kebir',
      },
      hotelName: 'Grand Dahlak Hotel & Dissei Camp',
      guideName: 'Captain Amanuel',
      travelerId: 'trav_selam_01',
    },
    // 4. Luxury Request (Ruby #c2185b): Private VIP Dahlak Villa
    {
      id: 'evt_luxury_villa',
      calendarId: 'gcal_master',
      calendarName: 'Eritrea Tours Master Calendar',
      title: 'Luxury Request: Private Island Villa & Speedboat Transfer',
      description: 'Exclusive beachfront eco-villa charter with private chef and diving instructor.',
      start: {
        dateTime: '2026-11-10T11:00:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      end: {
        dateTime: '2026-11-10T20:00:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      allDay: false,
      colorHex: '#c2185b',
      categoryKey: 'luxury',
      label: 'Luxury VIP Charter',
      location: 'Dissei Island Private Station, Massawa',
      sourceUrl: 'https://calendar.google.com/calendar/u/0/r/eventedit/sample_luxury',
      status: 'confirmed',
      cities: ['Dissei Island'],
      dailyCityMap: {
        '2026-11-10': 'Dissei Island',
      },
      hotelName: 'Dissei Royal Eco-Villa',
      travelerId: 'trav_selam_01',
    },
    // 5. Explicit Flight Departure (Red #d50000)
    {
      id: 'evt_et322_departure',
      calendarId: 'flight_feed',
      calendarName: 'Asmara Airport (ASM) Flight Ops',
      title: 'Departure ET322: Marcus Vance (ASM departs to ADD)',
      description: 'Ethiopian Airlines flight ET322 outbound departure connecting to London Heathrow. Check-in 17:00.',
      start: {
        dateTime: '2026-11-12T19:40:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      end: {
        dateTime: '2026-11-12T21:10:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      allDay: false,
      colorHex: '#d50000',
      label: 'Departure (Flight / Port)',
      flightNumber: 'ET322',
      airportCode: 'ASM',
      location: 'Asmara International Airport (ASM), International Departures',
      sourceUrl: 'https://calendar.google.com/calendar/u/0/r/eventedit/sample_et322',
      status: 'confirmed',
      cities: ['Asmara'],
      dailyCityMap: {
        '2026-11-12': 'Asmara',
      },
      driverName: 'Yemane Berhe',
      travelerId: 'trav_marcus_02',
    },
    // 6. Overlapping Historical Color (Red event WITHOUT explicit departure evidence -> Must show "Needs review")
    {
      id: 'evt_ambiguous_red_meeting',
      calendarId: 'gcal_master',
      calendarName: 'Eritrea Tours Master Calendar',
      title: 'Italian Escarpment Viaduct Walk & Technical Safety Check',
      description: 'Historical red color used in legacy calendar. Inspection of Arbaroba bridges with Ministry engineers. Lacks departure text evidence.',
      start: {
        dateTime: '2026-11-13T09:00:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      end: {
        dateTime: '2026-11-13T12:00:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      allDay: false,
      colorHex: '#d50000', // Red color, but NO departure evidence! Must trigger "Needs review"!
      location: 'Arbaroba Bridge #14, Route P-1',
      sourceUrl: 'https://calendar.google.com/calendar/u/0/r/eventedit/sample_viaduct',
      status: 'confirmed',
      cities: ['Arbaroba'],
      dailyCityMap: {
        '2026-11-13': 'Arbaroba',
      },
    },
    // 7. Event with Undetermined City (Must display "City not yet confirmed")
    {
      id: 'evt_undetermined_city_briefing',
      calendarId: 'gcal_master',
      calendarName: 'Eritrea Tours Master Calendar',
      title: 'Antiquities Research Briefing: Dr. Elena Rostova',
      description: 'Site selection pending archaeological division clearance. No city assigned yet.',
      start: {
        dateTime: '2026-11-14T10:00:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      end: {
        dateTime: '2026-11-14T12:00:00+03:00',
        timeZone: 'Africa/Asmara',
      },
      allDay: false,
      colorHex: '#8e24aa',
      categoryKey: 'groups',
      label: 'Group Expedition / Delegation',
      // Cities and dailyCityMap intentionally omitted to verify "City not yet confirmed" rendering
      travelerId: 'trav_elena_03',
    },
  ],
  travelers: [
    {
      id: 'trav_selam_01',
      name: 'Selam Tesfay',
      email: 'selam.tesfay@diaspora-uk.org',
      phone: '+44 7700 900142',
      whatsapp: '+447700900142',
      nationality: 'British-Eritrean',
      bookingStage: 'Confirmed',
      confirmedStatus: 'Confirmed',
      itinerarySummary: 'Asmara Art Deco Heritage, Massawa Red Sea Port & Dahlak Marine Diving',
      interests: ['Art Deco Architecture', 'Red Sea Scuba Diving', 'Diaspora Roots & Heritage'],
      price: 2450,
      currency: 'USD',
      paymentStatus: 'Paid',
      amountPaid: 2450,
      flightDetails: {
        arrivalFlight: 'TK651',
        arrivalAirport: 'ASM',
        arrivalTime: '01:25 AM EAT (Nov 5)',
        departureFlight: 'TK652',
        departureAirport: 'ASM',
        departureTime: '02:30 AM EAT (Nov 15)',
      },
      hotelDetails: {
        hotelName: 'Hotel Asmara Palace & Grand Dahlak',
        roomType: 'Deluxe Suite',
        checkIn: '2026-11-05',
        checkOut: '2026-11-15',
      },
      mealRequirements: 'Traditional Eritrean fasting cuisine on Wednesdays/Fridays (Vegan Alicha & Shiro)',
      visaStatus: 'Visa on Arrival',
      guideAssignment: {
        name: 'Habtom Ghebre',
        phone: '+291 7 124981',
        lodging: 'Guide quarters reserved at Dahlak Camp & Sarina Hotel',
      },
      driverAssignment: {
        name: 'Yemane Berhe',
        phone: '+291 7 439012',
        vehicle: 'Toyota Land Cruiser (ER-2-18492)',
        lodging: 'Driver annex reserved at Grand Dahlak Massawa',
      },
      notes: 'VIP Diaspora guest celebrating family jubilee. High priority customer care.',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    },
    {
      id: 'trav_marcus_02',
      name: 'Marcus Vance',
      email: 'm.vance@geotours-explorer.com',
      phone: '+1 415 555 0198',
      whatsapp: '+14155550198',
      nationality: 'American',
      bookingStage: 'In Trip',
      confirmedStatus: 'Confirmed',
      itinerarySummary: 'Highland Highlands & Anseba Escarpment Photography Tour',
      interests: ['Historic Steam Railway', 'High-altitude Treks', 'Landscape Photography'],
      price: 1890,
      currency: 'USD',
      paymentStatus: 'Paid',
      amountPaid: 1890,
      flightDetails: {
        arrivalFlight: 'ET323',
        arrivalAirport: 'ASM',
        arrivalTime: '11:45 AM EAT (Nov 2)',
        departureFlight: 'ET322',
        departureAirport: 'ASM',
        departureTime: '19:40 PM EAT (Nov 12)',
      },
      hotelDetails: {
        hotelName: 'Albergo Italia (Asmara)',
        roomType: 'Heritage Balcony Single',
        checkIn: '2026-11-02',
        checkOut: '2026-11-12',
      },
      mealRequirements: 'Gluten-free preferences noted; prefers fresh fish and fruits',
      visaStatus: 'Issued',
      guideAssignment: {
        name: 'Filmon Kidane',
        phone: '+291 7 882103',
        lodging: 'Staff room at Albergo Italia',
      },
      driverAssignment: {
        name: 'Tekle Haile',
        phone: '+291 7 554219',
        vehicle: 'Nissan Patrol 4WD (ER-2-44102)',
        lodging: 'Local staff lodge in Keren & Massawa',
      },
      notes: 'Travel photographer publishing feature on Asmara Italian rationalist architecture.',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    },
    {
      id: 'trav_elena_03',
      name: 'Dr. Elena Rostova',
      email: 'elena.rostova@archaeo-inst.org',
      phone: '+49 171 2345678',
      nationality: 'German',
      bookingStage: 'Proposal',
      confirmedStatus: 'Tentative',
      itinerarySummary: 'Southern Red Sea & Kohaito Axumite Archaeological Route',
      interests: ['Axumite Relics', 'Rock Art of Adi Keih', 'Southern Escarpment'],
      price: 3200,
      currency: 'USD',
      paymentStatus: 'Pending',
      amountPaid: 0,
      visaStatus: 'Documents Needed',
      notes: 'Requires antiquities research permit and 4WD escort convoy.',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    },
  ],
  conversations: [
    {
      id: 'conv_selam_wa',
      travelerId: 'trav_selam_01',
      travelerName: 'Selam Tesfay',
      channel: 'whatsapp',
      status: 'waiting-for-client',
      lastMessageAt: '2026-10-31T06:15:00.000Z',
      subject: 'Arrival Transfer & Midnight Landing Briefing',
      messages: [
        {
          id: 'msg_01',
          sender: 'client',
          content: 'Hello EritreaVisit team! Just verifying that our driver Yemane will meet us at the arrivals exit gate at 01:25 AM on Nov 5?',
          timestamp: '2026-10-31T05:30:00.000Z',
        },
        {
          id: 'msg_02',
          sender: 'agent',
          senderName: 'Michael (Operations)',
          content: 'Dearest Selam, absolutely yes! Yemane will be right outside the arrivals hall with an EritreaVisit name badge, fresh chilled mineral water, and Land Cruiser ER-2-18492. We have also notified Hotel Asmara Palace for late night check-in.',
          timestamp: '2026-10-31T06:15:00.000Z',
        },
      ],
    },
    {
      id: 'conv_marcus_email',
      travelerId: 'trav_marcus_02',
      travelerName: 'Marcus Vance',
      channel: 'email',
      status: 'unanswered',
      lastMessageAt: '2026-10-31T07:10:00.000Z',
      subject: 'Albergo Italia Booking, Visa & 1938 Steam Railway Permit (2026-11-02 to 2026-11-08)',
      messages: [
        {
          id: 'msg_03',
          sender: 'client',
          senderName: 'Marcus Vance <m.vance@geotours-explorer.com>',
          content: 'Hi EritreaVisit desk (tours@eritreavisit.com), please book 1 room at Albergo Italia in Asmara from 2026-11-02 to 2026-11-08 (1 adult, American nationality, Passport: US88492011, Tel: +1 415 555 0198), issue my Visa on Arrival sponsorship, and arrange the 1938 Ansaldo Steam Railway & Keren Highland travel permit.',
          timestamp: '2026-10-31T07:10:00.000Z',
        },
      ],
    },
    {
      id: 'conv_selam_email',
      travelerId: 'trav_selam_01',
      travelerName: 'Selam Tesfay',
      channel: 'email',
      status: 'unanswered',
      lastMessageAt: '2026-10-31T07:25:00.000Z',
      subject: 'Hotel Asmara Palace Deluxe Suite, VoA & Dahlak Marine Permit (2026-11-05 to 2026-11-12)',
      messages: [
        {
          id: 'msg_selam_em_01',
          sender: 'client',
          senderName: 'Selam Tesfay <selam.tesfay@diaspora-uk.co.uk>',
          content: 'Dear tours@eritreavisit.com team, please reserve a Deluxe Suite at Hotel Asmara Palace from 2026-11-05 to 2026-11-12 for 2 guests (British nationality, Passport: GB94021844, Tel: +44 7700 900142), prepare our Visa on Arrival clearance for flight TK651, and issue our Massawa & Dahlak Archipelago travel permit.',
          timestamp: '2026-10-31T07:25:00.000Z',
        },
      ],
    },
    {
      id: 'conv_elena_email',
      travelerId: 'trav_elena_03',
      travelerName: 'Dr. Elena Rostova',
      channel: 'email',
      status: 'unanswered',
      lastMessageAt: '2026-10-31T07:40:00.000Z',
      subject: 'Crystal Hotel Asmara, German VoA Sponsorship & Qohaito Permit (2026-11-10 to 2026-11-18)',
      messages: [
        {
          id: 'msg_elena_em_01',
          sender: 'client',
          senderName: 'Dr. Elena Rostova <elena.rostova@archaeo-inst.org>',
          content: 'Guten Tag EritreaVisit (tours@eritreavisit.com), kindly book Crystal Hotel in Asmara from 2026-11-10 to 2026-11-18 for 1 guest (German nationality, Passport: C01X99482, Tel: +49 171 2345678), file my Department of Immigration Visa on Arrival letter, and prepare the Qohaito & Debub Archaeological regional travel permit.',
          timestamp: '2026-10-31T07:40:00.000Z',
        },
      ],
    },
    {
      id: 'conv_rossi_email',
      travelerId: 'trav_rossi_04',
      travelerName: 'Marco Rossi',
      channel: 'email',
      status: 'unanswered',
      lastMessageAt: '2026-10-31T07:50:00.000Z',
      subject: 'Grand Hotel Dahlak Massawa & Asmara Heritage Tour for 2 Guests (2026-11-14 to 2026-11-20)',
      messages: [
        {
          id: 'msg_rossi_em_01',
          sender: 'client',
          senderName: 'Marco Rossi <marco.rossi@milano-architettura.it>',
          content: 'Buongiorno tours@eritreavisit.com! My wife Giulia and I (2 guests, Italian nationality, Passport: YA4481920, Tel: +39 348 9912034) need hotel reservation at Grand Hotel Dahlak in Massawa from 2026-11-14 to 2026-11-20, our Visa on Arrival sponsorship letter, and regional travel permits for Massawa and Asmara.',
          timestamp: '2026-10-31T07:50:00.000Z',
        },
      ],
    },
    {
      id: 'conv_elena_uchat',
      travelerId: 'trav_elena_03',
      travelerName: 'Dr. Elena Rostova',
      channel: 'uchat',
      status: 'bot-only',
      lastMessageAt: '2026-10-31T07:45:00.000Z',
      subject: 'Visa on Arrival requirements for German passport holders',
      messages: [
        {
          id: 'msg_04',
          sender: 'client',
          content: 'Hello, what documents are needed for expedited Visa on Arrival to visit the Kohaito ruins?',
          timestamp: '2026-10-31T07:44:00.000Z',
        },
        {
          id: 'msg_05',
          sender: 'bot',
          senderName: 'EritreaVisit Virtual Concierge',
          content: 'Welcome Dr. Elena! For German nationals, Visa on Arrival requires a formal invitation letter from EritreaVisit, valid passport (min 6 months), 2 biometric passport photos, and $50 USD consular fee upon landing at Asmara Airport.',
          timestamp: '2026-10-31T07:45:00.000Z',
        },
      ],
    },
  ],
  drafts: [
    {
      id: 'draft_marcus_steam_train',
      travelerId: 'trav_marcus_02',
      conversationId: 'conv_marcus_email',
      type: 'reply',
      title: 'Suggested Email Reply to Marcus Vance re: Steam Train',
      proposedAction: 'Send email confirmation for Steam Locomotive Ansaldo 442 excursion to Nefasit',
      details: {
        to: 'm.vance@geotours-explorer.com',
        subject: 'Re: Steam Train Railway Excursion permit on Sunday?',
        body: 'Dear Marcus, yes! The Eritrean Railway Authority has authorized the 1938 Ansaldo 442 steam engine charter departing Asmara Station at 08:30 AM on Sunday. Your guide Filmon and two tripod spots in the open observation car are reserved.',
      },
      requiresApproval: true,
      status: 'pending',
    },
  ],
  conflicts: [
    {
      id: 'conflict_driver_overlap',
      severity: 'medium',
      title: 'Potential Driver Schedule Overlap: Yemane Berhe',
      description: 'Driver Yemane Berhe is assigned to midnight airport arrival TK651 (01:25 AM Nov 5) and an early morning city art-deco transfer at 07:30 AM. Verify driver rest period compliance.',
      eventIds: ['evt_tk651_arrival'],
      travelerId: 'trav_selam_01',
      detectedAt: '2026-10-31T07:55:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task_tk651_pickup',
      title: 'Confirm 01:25 AM Airport Pickup Sign & Chilled Water for Selam Tesfay (TK651)',
      priority: 'urgent',
      due: '2026-11-04',
      status: 'pending',
      travelerId: 'trav_selam_01',
      travelerName: 'Selam Tesfay',
      assignedTo: 'Yemane Berhe',
      category: 'flight',
      evidence: 'Arriving Nov 5 at 01:25 AM EAT on Turkish Airlines TK651.',
    },
    {
      id: 'task_steam_train_coal',
      title: 'Verify Ansaldo 442 Steam Locomotive Charter Clearance for Marcus Vance',
      priority: 'high',
      due: '2026-11-05',
      status: 'in_progress',
      travelerId: 'trav_marcus_02',
      travelerName: 'Marcus Vance',
      assignedTo: 'Filmon Kidane',
      category: 'general',
      evidence: 'Asmara -> Nefasit charter scheduled for Nov 6 at 08:30 AM.',
    },
    {
      id: 'task_elena_voa_docs',
      title: 'Collect Passport Bio-Page & Antiquities Research Permit Application from Dr. Elena Rostova',
      priority: 'high',
      due: '2026-11-05',
      status: 'pending',
      travelerId: 'trav_elena_03',
      travelerName: 'Dr. Elena Rostova',
      assignedTo: 'Helen Berhe',
      category: 'visa',
      evidence: 'Visa status is Documents Needed for Kohaito & Adulis route.',
    },
  ],
};
