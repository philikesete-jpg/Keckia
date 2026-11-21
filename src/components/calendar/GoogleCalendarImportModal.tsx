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
  toFeedEvent,
  toTourSchedule,
  GOOGLE_CALENDAR_COLORS,
} from '../../lib/googleCalendarParser';
import { FeedEvent, TourSchedule } from '../../types';
import { getCachedAccessToken, authorizeGoogleWorkspace } from '../../lib/firebase';
import { fetchGoogleCalendarData } from '../../lib/dataSyncService';

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
  const [dateRangeFilter, setDateRangeFilter] = useState<'30' | '60' | '90' | 'all'>('60');
  const [searchFilter, setSearchFilter] = useState('');

  if (!isOpen) return null;

  // Handle direct fetch from Google Calendar API
  const handleFetchFromGoogle = async () => {
    setIsFetching(true);
    const account = targetAccount.trim() || 'philikesete@gmail.com';
    setStatusMessage({ type: 'info', text: `Connecting to Google Calendar (${account})...` });
    try {
      let token = getCachedAccessToken();
      if (!token) {
        token = await authorizeGoogleWorkspace(false, account);
      }

      setStatusMessage({ type: 'info', text: `Retrieving exact calendar events and schedules from ${account}...` });
      const rawEvents = await fetchGoogleCalendarData(token, account);

      const events: GoogleCalendarParsedEvent[] = rawEvents.map((item) => {
        return {
          id: item.id,
          uid: item.id,
          summary: item.summary,
          description: item.description || '',
          location: item.location || 'Asmara, Eritrea',
          start: item.start,
          end: item.end,
          allDay: !item.start.includes('T'),
          colorHex: item.colorHex || '#039be5',
          category: item.categoryKey || 'tour',
          status: 'confirmed',
          attendees: item.attendees,
        };
      });

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
        text: err?.message || `Could not fetch directly from Google Calendar (${account}). You can also import via .ics export file.`,
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
      const feedEvents: FeedEvent[] = selected.map(toFeedEvent);
      const schedules: TourSchedule[] = selected.map(toTourSchedule);

      if (onImportCompleted) {
        onImportCompleted(feedEvents, schedules);
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully imported ${selected.length} events to Operations Calendar and Tour Schedules!`,
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
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Selector Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-6 pt-2">
          <button
            onClick={() => setActiveTab('sync')}
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
            onClick={() => setActiveTab('file')}
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
            onClick={() => setActiveTab('paste')}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Google Calendar Account Integration</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                      {targetAccount}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600">
                    Connects directly to Google Calendar v3 API to fetch tour dates, departures, and arrivals from{' '}
                    <strong className="text-slate-900 font-mono">philikesete@gmail.com</strong>.
                  </p>
                  <div className="pt-1.5 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">Target Google Account:</span>
                    <input
                      type="email"
                      value={targetAccount}
                      onChange={(e) => setTargetAccount(e.target.value)}
                      placeholder="philikesete@gmail.com"
                      className="px-2.5 py-1 text-xs font-mono rounded-lg border border-slate-200 bg-white text-slate-800 outline-none focus:border-emerald-500 w-56"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleFetchFromGoogle}
                  disabled={isFetching}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs shrink-0 self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                  {isFetching ? 'Fetching from Google...' : `Fetch from ${targetAccount}`}
                </button>
              </div>

              {/* Exact Matching Guarantee Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#039be5]" /> Exact Event Times
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Extracts start &amp; end dates, times, and handles all-day operational dates.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8e24aa]" /> Exact Color Palette
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Retains Google Calendar color IDs (Peacock, Grape, Banana, Tangerine, Sage).
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f4511e]" /> Dual Destination
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Inserts into both Operations Calendar and Tour Departures with zero duplication.
                  </p>
                </div>
              </div>
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
                  const startDate = evt.start.includes('T') ? evt.start.split('T')[0] : evt.start;
                  const startTime = evt.start.includes('T') ? evt.start.split('T')[1].substring(0, 5) : 'All Day';

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
                              <Clock className="w-3 h-3" /> {startDate} ({startTime})
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
            disabled={selectedIds.size === 0 || isImporting}
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
