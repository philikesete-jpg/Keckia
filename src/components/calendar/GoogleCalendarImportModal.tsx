import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  UploadCloud,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  X,
  Clock,
  MapPin,
  Users,
  CheckSquare,
  Square,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  GoogleCalendarParsedEvent,
  parseGoogleCalendarIcs,
  parseGoogleCalendarJson,
  googleCalendarMonth,
  fetchGoogleCalendarMonth,
  toFeedEvent,
  toTourSchedule,
  GOOGLE_CALENDAR_COLORS,
} from '../../lib/googleCalendarParser';
import { FeedEvent, TourSchedule } from '../../types';
import { parseFeedDate } from '../../../shared/feedSchema';
import { auth } from '../../lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

interface GoogleCalendarImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCompleted?: (feedEvents: FeedEvent[], schedules: TourSchedule[]) => void;
}

type ImportSourceTab = 'sync' | 'file' | 'paste';

export const GoogleCalendarImportModal: React.FC<GoogleCalendarImportModalProps> = ({
  isOpen,
  onClose,
  onImportCompleted,
}) => {
  const [activeTab, setActiveTab] = useState<ImportSourceTab>('sync');
  const [isFetching, setIsFetching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null);

  // Parsed events ready for review
  const [parsedEvents, setParsedEvents] = useState<GoogleCalendarParsedEvent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Input states
  const [targetAccount, setTargetAccount] = useState('philikesete@gmail.com');
  const [pastedText, setPastedText] = useState('');
  const [monthLink, setMonthLink] = useState('https://calendar.google.com/calendar/u/0/r/month/2026/11/1?ctz=Africa/Asmara');
  const [includeDepartures, setIncludeDepartures] = useState(false);
  const clearPreview = () => { setParsedEvents([]); setSelectedIds(new Set()); setStatusMessage(null); };
  let month: ReturnType<typeof googleCalendarMonth> | undefined;
  try { month = googleCalendarMonth(monthLink); } catch { /* Editable URLs can be incomplete. */ }
  const [searchFilter, setSearchFilter] = useState('');

  if (!isOpen) return null;

  // Handle direct fetch from Google Calendar API
  const handleFetchFromGoogle = async () => {
    setIsFetching(true);
    const account = targetAccount.trim() || 'philikesete@gmail.com';
    setStatusMessage({ type: 'info', text: `Connecting to Google Calendar (${account})...` });
    try {
      clearPreview();
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');
      provider.setCustomParameters({ login_hint: account, prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
      if (!token) throw new Error('Google did not grant calendar access. Reconnect or upload an export.');
      const events = await fetchGoogleCalendarMonth(token, account, monthLink);
      setParsedEvents(events);
      setSelectedIds(new Set(events.map((e) => e.id)));
      setStatusMessage({
        type: 'success',
        text: `Successfully fetched ${events.length} event(s) directly from Google Calendar (${account}).`,
      });
    } catch (err: any) {
      console.warn('Google Calendar fetch issue:', err);
      setStatusMessage({
        type: 'error',
        text: err?.code === 'auth/unauthorized-domain'
          ? 'This site is not yet authorized for Google sign-in in Firebase. Use Upload File to import a Google Calendar export.'
          : err?.code === 'auth/popup-closed-by-user' ? 'Google sign-in was closed. You can try again when ready.'
          : err?.message || 'Could not read this calendar. You can also upload a Google Calendar export.',
      });
    } finally {
      setIsFetching(false);
    }
  };

  // Handle .ics file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMessage({ type: 'info', text: `Reading file ${file.name}...` });
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      try {
        let events: GoogleCalendarParsedEvent[] = [];
        if (file.name.endsWith('.json')) {
          events = parseGoogleCalendarJson(content);
        } else {
          events = parseGoogleCalendarIcs(content);
        }

        if (events.length === 0) {
          setStatusMessage({
            type: 'error',
            text: 'No calendar events found in this file. Please verify it is a valid Google Calendar .ics or .json export.',
          });
          return;
        }

        setParsedEvents(events);
        setSelectedIds(new Set(events.map((e) => e.id)));
        setStatusMessage({
          type: 'success',
          text: `Parsed ${events.length} event(s) with exact dates and Google Calendar colors from ${file.name}.`,
        });
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: `Failed to parse file: ${err?.message || 'Invalid format'}`,
        });
      }
    };
    reader.readAsText(file);
  };

  // Handle manual paste of ICS or JSON
  const handleParsePasted = () => {
    if (!pastedText.trim()) return;

    setStatusMessage({ type: 'info', text: 'Parsing pasted calendar data...' });
    try {
      let events: GoogleCalendarParsedEvent[] = [];
      if (pastedText.trim().startsWith('{') || pastedText.trim().startsWith('[')) {
        events = parseGoogleCalendarJson(pastedText);
      } else {
        events = parseGoogleCalendarIcs(pastedText);
      }

      if (events.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'No calendar events could be parsed. Please check the pasted iCalendar (.ics) or JSON syntax.',
        });
        return;
      }

      setParsedEvents(events);
      setSelectedIds(new Set(events.map((e) => e.id)));
      setStatusMessage({
        type: 'success',
        text: `Parsed ${events.length} event(s) from pasted calendar data.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Error parsing data: ${err?.message || 'Invalid calendar content'}`,
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === parsedEvents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(parsedEvents.map((e) => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Commit selected events
  const handleCommitImport = async () => {
    const selected = parsedEvents.filter((e) => selectedIds.has(e.id));
    if (selected.length === 0) return;

    setIsImporting(true);
    try {
      const feedEvents: FeedEvent[] = selected.map(event => {
        const row = toFeedEvent(event);
        if (activeTab !== 'sync' || targetAccount.trim().toLowerCase() === 'philikesete@gmail.com') return row;
        const source = targetAccount.trim().toLowerCase();
        return { ...row, id: `gcal_${encodeURIComponent(source)}_${event.id}`,
          calendarId: source, calendarName: `Google Calendar (${source})` };
      });
      const schedules: TourSchedule[] = activeTab === 'sync' && !includeDepartures ? [] :
        selected.map((event, i) => {
          const schedule = toTourSchedule(event);
          return activeTab === 'sync' && targetAccount.trim().toLowerCase() !== 'philikesete@gmail.com'
            ? { ...schedule, id: 'sch_' + feedEvents[i].id } : schedule;
        });

      if (onImportCompleted) {
        onImportCompleted(feedEvents, schedules);
      }

      setStatusMessage({
        type: 'success',
        text: `Added ${selected.length} event(s) to Operations Calendar${schedules.length ? " and Tour Schedules" : ""}.`,
      });

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Failed to commit events: ${err?.message || 'Import error'}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const filteredEvents = parsedEvents.filter((evt) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      evt.summary.toLowerCase().includes(q) ||
      evt.location.toLowerCase().includes(q) ||
      evt.description.toLowerCase().includes(q) ||
      evt.start.includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs font-sans text-slate-900 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Google Calendar Import
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  Exact Match
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Import and synchronize events, departures, and tour schedules directly from Google Calendar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close calendar import"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Selector Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-6 pt-2">
          <button
            disabled={isFetching || isImporting}
            onClick={() => { if (activeTab !== 'sync') clearPreview(); setActiveTab('sync'); }}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'sync'
                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Direct Google Sync
          </button>
          <button
            disabled={isFetching || isImporting}
            onClick={() => { if (activeTab !== 'file') clearPreview(); setActiveTab('file'); }}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'file'
                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload Google .ics File
          </button>
          <button
            disabled={isFetching || isImporting}
            onClick={() => { if (activeTab !== 'paste') clearPreview(); setActiveTab('paste'); }}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'paste'
                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Paste iCal / URL
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Status / Message Banner */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : statusMessage.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 animate-spin" />
              )}
              <div className="flex-1 font-medium">{statusMessage.text}</div>
            </div>
          )}

          {/* TAB 1: Direct Google Sync */}
          {activeTab === 'sync' && (
            <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
              <h3 className="text-sm font-bold">Import a month from Google Calendar</h3>
              <label className="block text-xs font-semibold">Google Calendar month link
                <input type="url" value={monthLink} disabled={isFetching}
                  onChange={e => { setMonthLink(e.target.value); clearPreview(); }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
              </label>
              {month ? <p className="text-sm text-slate-700">{month.label} · Eritrea time (UTC+3) ·{' '}
                <a className="text-emerald-700 underline" href={monthLink} target="_blank" rel="noreferrer">Open in Google Calendar</a>
              </p> : <p className="text-xs text-rose-700">Enter a valid Google Calendar month-view link and time zone.</p>}
              <label className="block text-xs font-semibold">Source calendar email or ID
                <input type="text" value={targetAccount} disabled={isFetching}
                  onChange={e => { setTargetAccount(e.target.value); clearPreview(); }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
              </label>
              <p className="text-xs text-slate-600">Sign in with a Google account that can read this calendar. Review the events before adding them to the dashboard.</p>
              <button type="button" onClick={handleFetchFromGoogle} disabled={!month || !targetAccount.trim() || isFetching}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {isFetching ? 'Loading events…' : 'Preview Google Calendar events'}
              </button>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeDepartures}
                onChange={e => setIncludeDepartures(e.target.checked)} /> Also add the selected events to Tour Schedules</label>
            </div>
          )}

          {/* TAB 2: Upload Google .ics File */}
          {activeTab === 'file' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 text-center transition bg-slate-50/50">
                <UploadCloud className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-800 mb-1">
                  Upload Google Calendar Export (.ics)
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                  Export your calendar from Google Calendar (Settings &rarr; Import &amp; export &rarr; Export), then select or drop your <span className="font-mono font-semibold">.ics</span> file here.
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer shadow-xs">
                  <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
                  Select .ics or .json File
                  <input
                    type="file"
                    accept=".ics,.json,text/calendar"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: Paste iCal / URL */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Paste Google Calendar iCal (.ics) or API JSON Content
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="BEGIN:VCALENDAR&#10;VERSION:2.0&#10;PRODID:-//Google Inc//Google Calendar...&#10;BEGIN:VEVENT&#10;SUMMARY:Historical Asmara Tour&#10;..."
                rows={6}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-mono outline-none focus:border-emerald-500 focus:bg-white transition"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePasted}
                  disabled={!pastedText.trim()}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                >
                  Parse &amp; Preview Events
                </button>
              </div>
            </div>
          )}

          {/* PREVIEW OF PARSED EVENTS */}
          {parsedEvents.length > 0 && (
            <div className="space-y-3 border-t border-slate-200 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Discovered Events ({parsedEvents.length})
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold">
                    {selectedIds.size} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search events..."
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500 w-44"
                  />
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {selectedIds.size === parsedEvents.length ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Deselect All
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5 text-slate-400" /> Select All
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Event Cards Table */}
              <div className="max-h-64 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                {filteredEvents.map((evt) => {
                  const isSelected = selectedIds.has(evt.id);
                  const start = parseFeedDate(evt.start);

                  return (
                    <div
                      key={evt.id}
                      onClick={() => toggleSelect(evt.id)}
                      className={`p-3 rounded-lg border transition flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-white border-emerald-300 shadow-2xs'
                          : 'bg-white/60 border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 text-emerald-600">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: evt.colorHex }}
                          title={`Color: ${evt.colorHex}`}
                        />
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-bold text-slate-900 truncate">{evt.summary}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {start.dateString} · {start.isAllDay ? 'All Day' : start.timeString + ' EAT'}
                            </span>
                            {evt.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 text-slate-400" /> {evt.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full capitalize"
                          style={{
                            backgroundColor: `${evt.colorHex}20`,
                            color: evt.colorHex,
                          }}
                        >
                          {evt.isMovement || evt.category || 'Event'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCommitImport}
            disabled={selectedIds.size === 0 || isImporting || isFetching}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs"
          >
            {isImporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing Events...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Import {selectedIds.size} Event(s) to Calendar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
