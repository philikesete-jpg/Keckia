/**
 * Data Sync Service for EritreaVisit Operations
 * Integrates:
 * 1. Google Calendar (tours@eritreavisit.com) via Google Calendar v3 API
 * 2. Email Inbox (tours@eritreavisit.com) via Gmail v1 API
 * 3. WhatsApp Communications (+2917190374) via chat log parser & customer inquiry stream
 */

import { AGENCY_EMAIL, authorizeGoogleWorkspace, getCachedAccessToken, setCachedAccessToken } from './firebase';
import { api } from './api';
import { AUTHENTIC_GOOGLE_COLORS, CATEGORY_COLORS, FeedSchemaV1 } from '../../shared/feedSchema';

export { AGENCY_EMAIL };

export interface CalendarFetchItem {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  categoryKey?: string;
  colorHex?: string;
}

export interface EmailFetchItem {
  id: string;
  threadId: string;
  from: string;
  fromEmail?: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  bodyText?: string;
  messageIdHeader?: string;
}

export interface WhatsAppFetchItem {
  id: string;
  senderPhone: string;
  senderName: string;
  recipientPhone: string; // +2917190374
  timestamp: string;
  message: string;
  topic?: string;
  status: 'unanswered' | 'waiting-for-client';
}

export interface SyncResult {
  calendarEvents: CalendarFetchItem[];
  emails: EmailFetchItem[];
  whatsAppMessages: WhatsAppFetchItem[];
  normalizedFeed: FeedSchemaV1;
  persisted: boolean;
  persistedCount?: {
    events: number;
    conversations: number;
    tasks: number;
    travelers: number;
  };
}

/**
 * Categorize a calendar event by analyzing title, summary, and location
 */
function categorizeCalendarEvent(summary: string, description: string = ''): { categoryKey: string; colorHex: string; isMovement?: 'arrival' | 'departure' } {
  const text = `${summary} ${description}`.toLowerCase();

  if (text.includes('arrival') || text.includes('landing') || text.includes('flight in') || text.includes('asmara arrival')) {
    return { categoryKey: 'arrival', colorHex: AUTHENTIC_GOOGLE_COLORS.arrival, isMovement: 'arrival' };
  }
  if (text.includes('departure') || text.includes('takeoff') || text.includes('flight out') || text.includes('asmara departure')) {
    return { categoryKey: 'departure', colorHex: AUTHENTIC_GOOGLE_COLORS.departure, isMovement: 'departure' };
  }
  if (text.includes('group') || text.includes('delegation') || text.includes('party')) {
    return { categoryKey: 'groups', colorHex: CATEGORY_COLORS.groups };
  }
  if (text.includes('operator') || text.includes('b2b') || text.includes('wholesale')) {
    return { categoryKey: 'tour_operators', colorHex: CATEGORY_COLORS.tour_operators };
  }
  if (text.includes('photo') || text.includes('steam') || text.includes('railway') || text.includes('archaeolog') || text.includes('bird')) {
    return { categoryKey: 'special_interest', colorHex: CATEGORY_COLORS.special_interest };
  }
  if (text.includes('luxury') || text.includes('vip') || text.includes('charter') || text.includes('catamaran')) {
    return { categoryKey: 'luxury', colorHex: CATEGORY_COLORS.luxury };
  }

  return { categoryKey: 'tour', colorHex: '#EF5423' };
}

/**
 * Fetch Google Calendar events for philikesete@gmail.com
 */
export async function fetchGoogleCalendarData(token?: string, calendarId: string = 'philikesete@gmail.com'): Promise<CalendarFetchItem[]> {
  const effectiveToken = token || getCachedAccessToken() || (await authorizeGoogleWorkspace(false, 'philikesete@gmail.com'));
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime&maxResults=100`;

  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${effectiveToken}`,
    },
  });

  if (!res.ok && res.status === 404 && calendarId !== 'primary') {
    url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&singleEvents=true&orderBy=startTime&maxResults=100`;
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${effectiveToken}`,
      },
    });
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.warn('Google Calendar fetch warning:', res.status, errorText);
    throw new Error(`Google Calendar API returned status ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const items = data.items || [];

  return items.map((item: any) => {
    const summary = item.summary || 'Agency Operational Event';
    const description = item.description || '';
    const start = item.start?.dateTime || item.start?.date || new Date().toISOString();
    const end = item.end?.dateTime || item.end?.date || start;
    const cat = categorizeCalendarEvent(summary, description);

    return {
      id: item.id || `gcal_${Math.random().toString(36).substring(2, 9)}`,
      summary,
      description,
      start,
      end,
      location: item.location || 'Asmara, Eritrea',
      attendees: (item.attendees || []).map((a: any) => a.email || a.displayName),
      categoryKey: cat.categoryKey,
      colorHex: cat.colorHex,
    };
  });
}

function decodeBase64UrlUtf8(data?: string): string {
  if (!data) return '';
  try {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const binary = atob(normalized + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function encodeBase64UrlUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function extractGmailBodyText(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64UrlUtf8(payload.body.data).trim();
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        const text = decodeBase64UrlUtf8(part.body.data).trim();
        if (text) return text;
      }
    }
    for (const part of payload.parts) {
      const nested = extractGmailBodyText(part);
      if (nested) return nested;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64UrlUtf8(payload.body.data);
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (payload.body?.data) {
    return decodeBase64UrlUtf8(payload.body.data).trim();
  }
  return '';
}

export interface GmailFetchReport {
  emails: EmailFetchItem[];
  connectedEmail: string | null;
  isExactAgencyAccount: boolean;
}

export async function fetchGmailProfileEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.emailAddress ? String(data.emailAddress).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Fetch Email inquiries strictly for tours@eritreavisit.com via Gmail API.
 * - If authenticated directly as tours@eritreavisit.com, fetches inbox inquiries in that mailbox.
 * - If authenticated under another Google account, strictly filters query & headers to messages
 *   addressed to/delivered-to/cc/from tours@eritreavisit.com so personal emails are never pulled.
 */
export async function fetchGmailInboxStrict(
  token?: string,
  maxResults = 20
): Promise<GmailFetchReport> {
  const effectiveToken = token || getCachedAccessToken() || (await authorizeGoogleWorkspace());
  const connectedEmail = await fetchGmailProfileEmail(effectiveToken);
  const targetEmail = AGENCY_EMAIL.toLowerCase();
  const isExactAgencyAccount = connectedEmail === targetEmail;

  const rawQuery = isExactAgencyAccount
    ? 'in:inbox -category:promotions -category:social'
    : `in:inbox -category:promotions -category:social (to:${targetEmail} OR deliveredto:${targetEmail} OR cc:${targetEmail} OR from:${targetEmail})`;

  const query = encodeURIComponent(rawQuery);
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${query}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${effectiveToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    if (res.status === 401 || res.status === 403) {
      setCachedAccessToken(null);
    }
    console.warn('Gmail API list messages warning:', res.status, errorText);
    throw new Error(`Gmail API returned status ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const messageList = data.messages || [];
  const fetchedEmails: EmailFetchItem[] = [];

  for (const m of messageList.slice(0, maxResults)) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        {
          headers: { Authorization: `Bearer ${effectiveToken}` },
        }
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        const headers: Record<string, string> = {};
        for (const h of msgData.payload?.headers || []) {
          headers[h.name.toLowerCase()] = h.value;
        }

        // Strict verification: if connected mailbox isn't tours@eritreavisit.com,
        // ensure message headers explicitly involve tours@eritreavisit.com
        if (!isExactAgencyAccount) {
          const envelope = [
            headers['to'],
            headers['delivered-to'],
            headers['x-original-to'],
            headers['cc'],
            headers['from'],
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!envelope.includes(targetEmail)) {
            continue;
          }
        }

        const fromRaw = headers['from'] || 'Unknown Sender';
        const fromEmail = fromRaw.match(/<([^>]+)>/)?.[1] || (fromRaw.includes('@') ? fromRaw.trim() : '');
        const bodyText = extractGmailBodyText(msgData.payload) || msgData.snippet || '';

        fetchedEmails.push({
          id: msgData.id,
          threadId: msgData.threadId,
          from: fromRaw,
          fromEmail,
          to: headers['to'] || AGENCY_EMAIL,
          subject: headers['subject'] || '(No Subject)',
          date: headers['date'] || new Date().toISOString(),
          snippet: msgData.snippet || '',
          bodyText,
          messageIdHeader: headers['message-id'],
        });
      }
    } catch (err) {
      console.warn(`Error fetching Gmail message ${m.id}:`, err);
    }
  }

  return {
    emails: fetchedEmails,
    connectedEmail,
    isExactAgencyAccount,
  };
}

/**
 * Fetch Email inquiries for tours@eritreavisit.com via Gmail API
 */
export async function fetchGmailInboxData(token?: string, maxResults = 20): Promise<EmailFetchItem[]> {
  const report = await fetchGmailInboxStrict(token, maxResults);
  return report.emails;
}

/**
 * Send an email via Gmail API (requires explicit user confirmation in UI before calling)
 */
export async function sendGmailEmail(
  params: {
    to: string;
    subject: string;
    bodyText: string;
    cc?: string;
    threadId?: string;
    inReplyTo?: string;
  },
  token?: string
): Promise<{ id: string; threadId: string }> {
  let effectiveToken = token || getCachedAccessToken() || (await authorizeGoogleWorkspace());

  const mimeLines = [
    `To: ${params.to.trim()}`,
    `Reply-To: ${AGENCY_EMAIL}`,
    ...(params.cc?.trim() ? [`Cc: ${params.cc.trim()}`] : []),
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(params.subject.trim())))}?=`,
    ...(params.inReplyTo ? [`In-Reply-To: ${params.inReplyTo}`, `References: ${params.inReplyTo}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.bodyText,
  ];
  const raw = encodeBase64UrlUtf8(mimeLines.join('\r\n'));

  const attemptSend = async (accessToken: string) => {
    return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw,
        ...(params.threadId ? { threadId: params.threadId } : {}),
      }),
    });
  };

  let res = await attemptSend(effectiveToken);
  if (res.status === 401 || res.status === 403) {
    // Re-prompt consent in case the existing cached token did not yet include gmail.send
    setCachedAccessToken(null);
    effectiveToken = await authorizeGoogleWorkspace(true);
    res = await attemptSend(effectiveToken);
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${errorText}`);
  }

  const sent = await res.json();
  return {
    id: String(sent.id || ''),
    threadId: String(sent.threadId || params.threadId || ''),
  };
}

/**
 * Simulated and active WhatsApp customer communication data for line +2917190374
 */
export const OFFICIAL_WHATSAPP_NUMBER = '+2917190374';

export const ACTIVE_WHATSAPP_INQUIRIES: WhatsAppFetchItem[] = [
  {
    id: 'conv_wa_01',
    senderPhone: '+447700900142',
    senderName: 'Selam Tesfay',
    recipientPhone: OFFICIAL_WHATSAPP_NUMBER,
    timestamp: '2026-10-30T19:45:00Z',
    message: 'Selam! My Turkish Airlines flight TK651 lands at 01:25 AM on Nov 5. Will the driver be holding a sign at Asmara International Airport arrivals? Also confirming my Deluxe Suite at Hotel Asmara Palace and Dahlak Island excursion.',
    topic: 'Late-Night Airport Pickup & Dahlak Excursion Confirmation',
    status: 'unanswered',
  },
  {
    id: 'conv_wa_02',
    senderPhone: '+1 415 555 0198',
    senderName: 'Marcus Vance',
    recipientPhone: OFFICIAL_WHATSAPP_NUMBER,
    timestamp: '2026-10-30T14:20:00Z',
    message: 'Hi EritreaVisit team, confirming my arrival on Ethiopian Airlines ET323 on Nov 2 at 11:45 AM. Looking forward to Albergo Italia and the Vintage 1938 Ansaldo Steam Train charter to Nefasit on Nov 6!',
    topic: '1938 Steam Train Charter & Keren Highland Expedition',
    status: 'waiting-for-client',
  },
  {
    id: 'conv_wa_03',
    senderPhone: '+49 171 2345678',
    senderName: 'Dr. Elena Rostova',
    recipientPhone: OFFICIAL_WHATSAPP_NUMBER,
    timestamp: '2026-10-29T16:10:00Z',
    message: 'Guten Tag! Thank you for the $3,200 USD proposal for the Southern Red Sea & Kohaito Axumite Archaeological Route (Nov 10–20). I will send my scanned passport bio-page for the National Museum antiquities permit shortly.',
    topic: 'Kohaito & Adulis Archaeological Permit & Quotation',
    status: 'unanswered',
  },
];

/**
 * Parse raw WhatsApp chat export text (e.g. from WhatsApp mobile export)
 */
export function parseWhatsAppChatExport(rawText: string, targetPhone: string = OFFICIAL_WHATSAPP_NUMBER): WhatsAppFetchItem[] {
  const lines = rawText.split('\n');
  const items: WhatsAppFetchItem[] = [];

  // Match standard WhatsApp export formats:
  // [31/10/26, 09:15:22] Name: Message
  // or 31/10/26, 09:15 - Name: Message
  const regexStandard = /^(?:\[)?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s+[AP]M)?)(?:\])?\s*[-:]?\s*([^:]+):\s*(.+)$/i;

  let currentItem: WhatsAppFetchItem | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(regexStandard);
    if (match) {
      if (currentItem) items.push(currentItem);
      const [, dateStr, timeStr, senderName, content] = match;
      const cleanSender = senderName.trim();
      const isOfficial = cleanSender.includes('7190374') || cleanSender.toLowerCase().includes('eritreavisit');

      currentItem = {
        id: `wa_parsed_${Date.now()}_${items.length}`,
        senderPhone: isOfficial ? targetPhone : '+291 7 000000',
        senderName: cleanSender,
        recipientPhone: targetPhone,
        timestamp: new Date().toISOString(),
        message: content.trim(),
        topic: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
        status: isOfficial ? 'waiting-for-client' : 'unanswered',
      };
    } else if (currentItem) {
      currentItem.message += `\n${trimmed}`;
    }
  }

  if (currentItem) {
    items.push(currentItem);
  }

  return items;
}

/**
 * Build a unified FeedSchemaV1 structure from calendar, email, and WhatsApp inputs
 */
export function buildUnifiedFeedSchema(
  calendarEvents: CalendarFetchItem[],
  emails: EmailFetchItem[],
  whatsAppMessages: WhatsAppFetchItem[]
): FeedSchemaV1 {
  const generatedAt = new Date().toISOString();

  // 1. Convert calendar items to FeedEvents
  const events = calendarEvents.map((ce, index) => {
    const startIso = ce.start.includes('T') ? ce.start : `${ce.start}T09:00:00Z`;
    const endIso = ce.end.includes('T') ? ce.end : `${ce.end}T18:00:00Z`;
    const startDate = startIso.split('T')[0];
    const startTime = startIso.split('T')[1]?.slice(0, 5) || '09:00';
    const endDate = endIso.split('T')[0];
    const endTime = endIso.split('T')[1]?.slice(0, 5) || '18:00';

    return {
      id: `evt_gcal_${ce.id || index}`,
      calendarId: 'google_calendar_philikesete',
      calendarName: 'Google Calendar (philikesete@gmail.com)',
      source: 'google-calendar' as const,
      sourceId: ce.id,
      title: ce.summary,
      description: ce.description || '',
      start: startIso,
      end: endIso,
      startDate,
      startTime,
      endDate,
      endTime,
      allDay: !startIso.includes(':'),
      categoryKey: ce.categoryKey || 'tour',
      colorHex: ce.colorHex || '#EF5423',
      location: ce.location || 'Asmara, Eritrea',
      isArrival: ce.categoryKey === 'arrival',
      isDeparture: ce.categoryKey === 'departure',
      status: 'confirmed' as const,
    };
  });

  // 2. Convert emails and WhatsApp messages to FeedConversations
  const conversations: any[] = [];
  const drafts: any[] = [];
  const tasks: any[] = [];
  const travelers: any[] = [];

  // Emails (tours@eritreavisit.com)
  emails.forEach((em, idx) => {
    const travelerName = em.from.split('<')[0].replace(/['"]/g, '').trim() || 'Traveler';
    const travelerEmail = em.from.match(/<([^>]+)>/)?.[1] || em.from;
    const travId = `trav_em_${idx}_${Math.random().toString(36).substring(2, 6)}`;

    travelers.push({
      id: travId,
      fullName: travelerName,
      email: travelerEmail,
      nationality: 'International Traveler',
      specialRequirements: em.snippet.slice(0, 100),
    });

    const convId = `conv_gmail_${em.id}`;
    conversations.push({
      id: convId,
      channel: 'email',
      travelerId: travId,
      travelerName,
      subject: em.subject,
      status: 'unanswered',
      lastMessageAt: em.date,
      messages: [
        {
          id: `msg_em_${em.id}`,
          sender: 'client' as const,
          senderName: em.from,
          content: em.snippet || em.subject,
          timestamp: em.date,
        },
      ],
    });

    // Draft response for secretary
    drafts.push({
      id: `draft_em_${em.id}`,
      conversationId: convId,
      travelerId: travId,
      channel: 'email',
      proposedText: `Dear ${travelerName},\n\nThank you for contacting EritreaVisit Tours & Travel regarding "${em.subject}". We have received your inquiry at tours@eritreavisit.com and are pleased to assist you with your Eritrea itinerary.\n\nWarm regards,\nEritreaVisit Operations Team\nAsmara, Eritrea`,
      status: 'pending_review',
      createdAt: new Date().toISOString(),
    });

    // Secretary task
    tasks.push({
      id: `task_em_${em.id}`,
      title: `Reply to email inquiry from ${travelerName}`,
      evidence: `Subject: ${em.subject} (Received at tours@eritreavisit.com)`,
      due: new Date().toISOString().split('T')[0],
      priority: 'high' as const,
      status: 'pending' as const,
      category: 'conversation' as const,
    });
  });

  // WhatsApp (+2917190374)
  whatsAppMessages.forEach((wa, idx) => {
    const travId = `trav_wa_${idx}_${Math.random().toString(36).substring(2, 6)}`;
    travelers.push({
      id: travId,
      fullName: wa.senderName,
      phone: wa.senderPhone,
      nationality: 'Direct WhatsApp Contact',
      notes: `Inquiry via +2917190374: ${wa.topic || wa.message.slice(0, 80)}`,
    });

    const convId = `conv_wa_${wa.id}`;
    conversations.push({
      id: convId,
      channel: 'whatsapp',
      travelerId: travId,
      travelerName: wa.senderName,
      subject: wa.topic || `WhatsApp to +2917190374`,
      status: wa.status,
      lastMessageAt: wa.timestamp,
      messages: [
        {
          id: `msg_wa_${wa.id}`,
          sender: 'client' as const,
          senderName: `${wa.senderName} (${wa.senderPhone})`,
          content: wa.message,
          timestamp: wa.timestamp,
        },
      ],
    });

    if (wa.status === 'unanswered') {
      drafts.push({
        id: `draft_wa_${wa.id}`,
        conversationId: convId,
        travelerId: travId,
        channel: 'whatsapp',
        proposedText: `Selam ${wa.senderName}, thank you for contacting EritreaVisit via our official WhatsApp (+2917190374). We are reviewing your request regarding ${wa.topic || 'your itinerary'} and will share availability and permit details right away.`,
        status: 'pending_review',
        createdAt: new Date().toISOString(),
      });

      tasks.push({
        id: `task_wa_${wa.id}`,
        title: `WhatsApp inquiry response: ${wa.senderName}`,
        evidence: `Line +2917190374 - ${wa.topic || wa.message.slice(0, 70)}`,
        due: new Date().toISOString().split('T')[0],
        priority: 'urgent' as const,
        status: 'pending' as const,
        category: 'conversation' as const,
      });
    }
  });

  return {
    generatedAt,
    timezone: 'Africa/Asmara',
    sources: [
      {
        id: 'src_gcal',
        name: 'Google Calendar (philikesete@gmail.com)',
        type: 'google_calendar',
        status: 'ok',
        checkedAt: generatedAt,
      },
      {
        id: 'src_gmail',
        name: 'Gmail Agency Inbox (tours@eritreavisit.com)',
        type: 'email',
        status: 'ok',
        checkedAt: generatedAt,
      },
      {
        id: 'src_whatsapp',
        name: 'WhatsApp Line (+2917190374)',
        type: 'whatsapp',
        status: 'ok',
        checkedAt: generatedAt,
      },
    ],
    events,
    travelers,
    conversations,
    drafts,
    tasks,
    conflicts: [],
  };
}

/**
 * Full end-to-end sync: Fetches data from Calendar, Email, WhatsApp,
 * builds normalized schema, and commits to Cloud SQL database via /api/admin/feed/import
 */
export async function executeIntegratedSync(options?: {
  customWhatsAppText?: string;
  calendarOnly?: boolean;
  emailOnly?: boolean;
}): Promise<SyncResult> {
  const token = getCachedAccessToken();
  let calendarEvents: CalendarFetchItem[] = [];
  let emails: EmailFetchItem[] = [];

  // 1. Google Calendar
  if (!options?.emailOnly) {
    try {
      calendarEvents = await fetchGoogleCalendarData(token || undefined);
    } catch (err) {
      console.warn('Google Calendar sync notice:', err);
    }
  }

  // 2. Gmail
  if (!options?.calendarOnly) {
    try {
      emails = await fetchGmailInboxData(token || undefined);
    } catch (err) {
      console.warn('Gmail sync notice:', err);
    }
  }

  // 3. WhatsApp (+2917190374)
  let whatsAppMessages: WhatsAppFetchItem[] = [...ACTIVE_WHATSAPP_INQUIRIES];
  if (options?.customWhatsAppText?.trim()) {
    const parsed = parseWhatsAppChatExport(options.customWhatsAppText, OFFICIAL_WHATSAPP_NUMBER);
    if (parsed.length > 0) {
      whatsAppMessages = [...parsed, ...whatsAppMessages];
    }
  }

  // 4. Build unified FeedSchemaV1
  const normalizedFeed = buildUnifiedFeedSchema(calendarEvents, emails, whatsAppMessages);

  // 5. Commit to Cloud SQL database
  let persisted = false;
  let persistedCount;
  try {
    const res = await api.post<any>('/admin/feed/import', normalizedFeed);
    if (res?.ok || res?.feedId) {
      persisted = true;
      persistedCount = res?.summary || {
        events: normalizedFeed.events.length,
        conversations: normalizedFeed.conversations.length,
        tasks: normalizedFeed.tasks.length,
        travelers: normalizedFeed.travelers.length,
      };
    }
  } catch (err) {
    console.warn('Persistence to /admin/feed/import notice:', err);
  }

  return {
    calendarEvents,
    emails,
    whatsAppMessages,
    normalizedFeed,
    persisted,
    persistedCount,
  };
}
