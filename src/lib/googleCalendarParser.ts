/**
 * Google Calendar Parser & Importer Utility
 * Supports:
 * 1. Direct Google Calendar API v3 JSON format
 * 2. Standard Google Calendar .ics / iCalendar format (RFC 5545)
 * 3. Exact matching colors, dates, times, timezones, locations, attendees, and categories
 */

import { FeedEvent, TourSchedule } from '../types';
import { AUTHENTIC_GOOGLE_COLORS, CATEGORY_COLORS } from '../../shared/feedSchema';

export const GOOGLE_CALENDAR_COLORS: Record<string, { name: string; hex: string }> = {
  '1': { name: 'Lavender', hex: '#7986cb' },
  '2': { name: 'Sage', hex: '#33b679' },
  '3': { name: 'Grape', hex: '#8e24aa' },
  '4': { name: 'Flamingo', hex: '#e67c73' },
  '5': { name: 'Banana', hex: '#f6bf26' },
  '6': { name: 'Tangerine', hex: '#f4511e' },
  '7': { name: 'Peacock', hex: '#039be5' },
  '8': { name: 'Graphite', hex: '#616161' },
  '9': { name: 'Blueberry', hex: '#3f51b5' },
  '10': { name: 'Basil', hex: '#0b8043' },
  '11': { name: 'Tomato', hex: '#d50000' },
};

export interface GoogleCalendarParsedEvent {
  id: string;
  uid?: string;
  summary: string;
  description: string;
  location: string;
  start: string; // ISO string or YYYY-MM-DD
  end: string;   // ISO string or YYYY-MM-DD
  allDay: boolean;
  colorHex: string;
  colorId?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  category: string;
  isMovement?: 'arrival' | 'departure';
  organizer?: string;
  attendees?: string[];
  raw?: any;
}

/**
 * Infer category and authentic color from event text and location
 */
export function inferCategoryAndColor(
  summary: string = '',
  description: string = '',
  colorId?: string
): { category: string; colorHex: string; isMovement?: 'arrival' | 'departure' } {
  // If exact colorId exists in Google Calendar palette
  if (colorId && GOOGLE_CALENDAR_COLORS[colorId]) {
    const hex = GOOGLE_CALENDAR_COLORS[colorId].hex;
    const text = `${summary} ${description}`.toLowerCase();
    if (text.includes('arrival') || text.includes('landing') || text.includes('flight in')) {
      return { category: 'arrival', colorHex: hex, isMovement: 'arrival' };
    }
    if (text.includes('departure') || text.includes('takeoff') || text.includes('flight out')) {
      return { category: 'departure', colorHex: hex, isMovement: 'departure' };
    }
    return { category: 'google_calendar', colorHex: hex };
  }

  const text = `${summary} ${description}`.toLowerCase();

  if (text.includes('arrival') || text.includes('landing') || text.includes('flight in') || text.includes('asmara arrival')) {
    return { category: 'arrival', colorHex: AUTHENTIC_GOOGLE_COLORS.arrival, isMovement: 'arrival' };
  }
  if (text.includes('departure') || text.includes('takeoff') || text.includes('flight out') || text.includes('asmara departure')) {
    return { category: 'departure', colorHex: AUTHENTIC_GOOGLE_COLORS.departure, isMovement: 'departure' };
  }
  if (text.includes('luxury') || text.includes('vip') || text.includes('yacht') || text.includes('catamaran')) {
    return { category: 'luxury', colorHex: CATEGORY_COLORS.luxury };
  }
  if (text.includes('steam') || text.includes('railway') || text.includes('archaeolog') || text.includes('photo')) {
    return { category: 'special_interest', colorHex: CATEGORY_COLORS.special_interest };
  }
  if (text.includes('hotel') || text.includes('palace') || text.includes('checkin') || text.includes('check-in')) {
    return { category: 'hotel', colorHex: '#4285F4' };
  }
  if (text.includes('group') || text.includes('tour') || text.includes('expedition') || text.includes('convoy')) {
    return { category: 'groups', colorHex: CATEGORY_COLORS.groups };
  }

  return { category: 'tour', colorHex: '#039be5' };
}

/**
 * Format RFC 5545 date string (e.g. 20261105T093000Z or 20261105) into ISO or YYYY-MM-DD
 */
function parseIcsDateString(val: string): { dateStr: string; allDay: boolean } {
  const clean = val.trim();
  if (clean.length === 8 && /^\d{8}$/.test(clean)) {
    // All day date YYYYMMDD
    const y = clean.substring(0, 4);
    const m = clean.substring(4, 6);
    const d = clean.substring(6, 8);
    return { dateStr: `${y}-${m}-${d}`, allDay: true };
  }

  // Timed date e.g. 20261105T093000Z or 20261105T093000
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
  if (match) {
    const [, y, m, d, hh, mm, ss, isUtc] = match;
    if (isUtc) {
      return {
        dateStr: `${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`,
        allDay: false,
      };
    }
    return {
      dateStr: `${y}-${m}-${d}T${hh}:${mm}:${ss}`,
      allDay: false,
    };
  }

  // Fallback if already ISO
  if (clean.includes('-')) {
    return {
      dateStr: clean,
      allDay: !clean.includes('T'),
    };
  }

  return { dateStr: new Date().toISOString(), allDay: false };
}

/**
 * Parse an iCalendar (.ics) string (as exported by Google Calendar) into GoogleCalendarParsedEvent items
 */
export function parseGoogleCalendarIcs(icsText: string): GoogleCalendarParsedEvent[] {
  if (!icsText || !icsText.trim()) return [];

  // 1. Unfold lines (RFC 5545 specifies that lines starting with space or tab continue the previous line)
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events: GoogleCalendarParsedEvent[] = [];
  let inEvent = false;
  let currentEvent: Record<string, string> = {};
  let attendees: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
      attendees = [];
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      inEvent = false;
      if (currentEvent.DTSTART || currentEvent.SUMMARY) {
        const summary = unescapeIcs(currentEvent.SUMMARY || 'Google Calendar Event');
        const description = unescapeIcs(currentEvent.DESCRIPTION || '');
        const location = unescapeIcs(currentEvent.LOCATION || '');
        const colorId = currentEvent['COLOR'] || currentEvent['X-GOOGLE-COLOR'];

        const startParsed = parseIcsDateString(currentEvent.DTSTART || new Date().toISOString());
        const endParsed = currentEvent.DTEND
          ? parseIcsDateString(currentEvent.DTEND)
          : startParsed;

        const cat = inferCategoryAndColor(summary, description, colorId);

        let status: 'confirmed' | 'tentative' | 'cancelled' = 'confirmed';
        if (currentEvent.STATUS?.toUpperCase() === 'TENTATIVE') status = 'tentative';
        if (currentEvent.STATUS?.toUpperCase() === 'CANCELLED') status = 'cancelled';

        const uid = currentEvent.UID || `ics_${Math.random().toString(36).substring(2, 9)}`;

        events.push({
          id: uid.replace(/[^a-zA-Z0-9_-]/g, '_'),
          uid,
          summary,
          description,
          location,
          start: startParsed.dateStr,
          end: endParsed.dateStr,
          allDay: startParsed.allDay,
          colorHex: cat.colorHex,
          colorId,
          status,
          category: cat.category,
          isMovement: cat.isMovement,
          organizer: currentEvent.ORGANIZER ? unescapeIcs(currentEvent.ORGANIZER) : undefined,
          attendees: attendees.length > 0 ? attendees : undefined,
        });
      }
      continue;
    }

    if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const propFull = line.substring(0, colonIdx);
        const value = line.substring(colonIdx + 1);
        const propKey = propFull.split(';')[0].toUpperCase();

        if (propKey === 'ATTENDEE') {
          // Extract email or CN from attendee property
          const cnMatch = propFull.match(/CN=([^;:]+)/i);
          const name = cnMatch ? cnMatch[1].replace(/^"|"$/g, '') : value.replace(/^mailto:/i, '');
          attendees.push(name);
        } else if (!currentEvent[propKey]) {
          currentEvent[propKey] = value;
        }
      }
    }
  }

  return events;
}

function unescapeIcs(val: string): string {
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Parse Google Calendar API JSON (e.g. from Google Calendar v3 events list endpoint)
 */
export function parseGoogleCalendarJson(jsonData: any): GoogleCalendarParsedEvent[] {
  let items: any[] = [];
  if (Array.isArray(jsonData)) {
    items = jsonData;
  } else if (jsonData && Array.isArray(jsonData.items)) {
    items = jsonData.items;
  } else if (typeof jsonData === 'string') {
    try {
      const parsed = JSON.parse(jsonData);
      return parseGoogleCalendarJson(parsed);
    } catch {
      return [];
    }
  }

  return items.map((item: any) => {
    const summary = item.summary || 'Google Calendar Event';
    const description = item.description || '';
    const location = item.location || '';
    const colorId = item.colorId ? String(item.colorId) : undefined;

    const startObj = item.start || {};
    const endObj = item.end || {};

    const allDay = Boolean(startObj.date && !startObj.dateTime);
    const start = startObj.dateTime || startObj.date || new Date().toISOString();
    const end = endObj.dateTime || endObj.date || start;

    const cat = inferCategoryAndColor(summary, description, colorId);

    let status: 'confirmed' | 'tentative' | 'cancelled' = 'confirmed';
    if (item.status === 'tentative') status = 'tentative';
    if (item.status === 'cancelled') status = 'cancelled';

    const attendees = (item.attendees || []).map((a: any) => a.displayName || a.email).filter(Boolean);

    return {
      id: item.id || `gcal_${Math.random().toString(36).substring(2, 9)}`,
      uid: item.iCalUID || item.id,
      summary,
      description,
      location,
      start,
      end,
      allDay,
      colorHex: cat.colorHex,
      colorId,
      status,
      category: cat.category,
      isMovement: cat.isMovement,
      organizer: item.organizer?.displayName || item.organizer?.email,
      attendees: attendees.length > 0 ? attendees : undefined,
      raw: item,
    };
  });
}

/**
 * Convert a Google Calendar event into a FeedEvent for CalendarWorkspace
 */
export function toFeedEvent(event: GoogleCalendarParsedEvent): FeedEvent {
  const isArrival = event.isMovement === 'arrival';
  const isDeparture = event.isMovement === 'departure';

  return {
    id: event.id.startsWith('gcal_') ? event.id : `gcal_${event.id}`,
    calendarId: 'google_calendar_philikesete',
    calendarName: 'Google Calendar (philikesete@gmail.com)',
    title: event.summary,
    description: event.description,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    colorHex: event.colorHex,
    colorId: event.colorId,
    label: isArrival ? 'Flight Arrival' : isDeparture ? 'Flight Departure' : 'Google Calendar Event',
    location: event.location || 'Asmara, Eritrea',
    cities: event.location ? [event.location] : ['Asmara'],
    categoryKey: event.category,
    status: event.status,
  };
}

/**
 * Convert a Google Calendar event into a TourSchedule for TourCalendarView
 */
export function toTourSchedule(event: GoogleCalendarParsedEvent): TourSchedule {
  const startDate = event.start.includes('T') ? event.start.split('T')[0] : event.start;
  const endDate = event.end ? (event.end.includes('T') ? event.end.split('T')[0] : event.end) : startDate;
  const booked = event.attendees?.length || 1;

  return {
    id: `sch_gcal_${event.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    tourPackageId: 'pkg-custom',
    tourTitle: event.summary,
    packageTitle: event.summary,
    destination: event.location || 'Asmara, Eritrea',
    startDate,
    endDate,
    status: 'Upcoming',
    leadGuideId: 'emp-unassigned',
    leadGuideName: 'Unassigned Guide',
    supportStaffIds: [],
    supportStaffNames: [],
    totalSeats: Math.max(12, booked),
    bookedSeats: booked,
    ticketClasses: {
      vip: { price: 250, totalSeats: 4, bookedSeats: 0 },
      standard: { price: 150, totalSeats: 8, bookedSeats: booked },
      group: { price: 120, totalSeats: 0, bookedSeats: 0 },
    },
    notes: event.description || `Imported from Google Calendar on ${new Date().toISOString().split('T')[0]}`,
  };
}
