import React, { useState } from 'react';
import {
  Calendar,
  Mail,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  ExternalLink,
  Layers,
  ArrowRight,
  Database,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import {
  executeIntegratedSync,
  OFFICIAL_WHATSAPP_NUMBER,
  CalendarFetchItem,
  EmailFetchItem,
  WhatsAppFetchItem,
  SyncResult,
} from '../../lib/dataSyncService';
import { getCachedAccessToken, authorizeGoogleWorkspace } from '../../lib/firebase';

interface DataSyncHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export const DataSyncHubModal: React.FC<DataSyncHubModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [whatsAppInput, setWhatsAppInput] = useState('');
  const [showWhatsAppPaste, setShowWhatsAppPaste] = useState(false);

  if (!isOpen) return null;

  const handleStartSync = async () => {
    setIsSyncing(true);
    setErrorMsg(null);
    setSyncResult(null);

    try {
      setCurrentStep('Verifying Google Workspace Authorization (tours@eritreavisit.com)...');
      let token = getCachedAccessToken();
      if (!token) {
        token = await authorizeGoogleWorkspace();
      }

      setCurrentStep('Fetching Google Calendar events for philikesete@gmail.com...');
      await new Promise((r) => setTimeout(r, 400));

      setCurrentStep('Fetching Gmail inquiries strictly for tours@eritreavisit.com...');
      await new Promise((r) => setTimeout(r, 400));

      setCurrentStep('Ingesting WhatsApp customer communications for +2917190374...');
      await new Promise((r) => setTimeout(r, 400));

      setCurrentStep('Normalizing and committing records to Cloud SQL database...');
      const result = await executeIntegratedSync({
        customWhatsAppText: whatsAppInput,
      });

      setSyncResult(result);
      setCurrentStep(null);
      if (onSyncCompleted) {
        onSyncCompleted();
      }
    } catch (err: any) {
      console.error('Data sync failed:', err);
      setErrorMsg(err?.message || 'Data sync encountered an issue.');
      setCurrentStep(null);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs font-sans text-slate-900 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center text-white shadow-xs">
              <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Live Data Fetch & Synchronization</h2>
              <p className="text-xs text-slate-500">
                Direct integration with Google Calendar, Gmail, and WhatsApp (+2917190374)
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Target Channels Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. Google Calendar */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-300 transition">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
                  <Calendar className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Ready
                </span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">Google Calendar</h3>
              <p className="text-xs font-mono text-slate-600 truncate mt-0.5">philikesete@gmail.com</p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Imports departures, arrivals, tour dates, and bookings into the Operations Timeline.
              </p>
            </div>

            {/* 2. Gmail / tours@eritreavisit.com */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <Mail className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Ready
                </span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">Agency Email Inbox</h3>
              <p className="text-xs font-mono text-slate-600 truncate mt-0.5">tours@eritreavisit.com</p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Fetches inquiries into the Unified Inbox with auto-generated secretary response drafts.
              </p>
            </div>

            {/* 3. WhatsApp / +2917190374 */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 transition">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Smartphone className="w-5 h-5" />
                </div>
                <a
                  href={`https://wa.me/2917190374`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                >
                  Open WA <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">Official WhatsApp</h3>
              <p className="text-xs font-mono text-slate-600 truncate mt-0.5">{OFFICIAL_WHATSAPP_NUMBER}</p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Eritrea local line: customer tour requests, permits, and urgent secretary tasks.
              </p>
            </div>
          </div>

          {/* WhatsApp Chat Paste / Import Expandable */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800">
                  Optional: Paste WhatsApp Export Transcript (+2917190374)
                </span>
                <p className="text-[11px] text-slate-500">
                  Paste exported WhatsApp chats to parse customer messages directly into the inbox.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsAppPaste(!showWhatsAppPaste)}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-1 bg-white border border-slate-200 rounded-lg cursor-pointer"
              >
                {showWhatsAppPaste ? 'Hide' : 'Add Transcript'}
              </button>
            </div>

            {showWhatsAppPaste && (
              <textarea
                value={whatsAppInput}
                onChange={(e) => setWhatsAppInput(e.target.value)}
                placeholder="[31/10/26, 09:15:22] Customer Name: Hello, inquiring about Dahlak islands..."
                rows={4}
                className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-brand-500"
              />
            )}
          </div>

          {/* Sync Progress Banner */}
          {isSyncing && (
            <div className="p-4 rounded-xl border border-brand-200 bg-brand-50/50 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-brand-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-brand-900">Fetching and Synchronizing Live Data...</p>
                <p className="text-xs text-brand-700 mt-0.5">{currentStep}</p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">Sync Error Encountered</p>
                <p className="text-xs mt-0.5 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Success Summary */}
          {syncResult && (
            <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h4 className="text-sm font-bold">Data Fetch & Cloud SQL Persistence Complete</h4>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Data was retrieved from all three channels and safely committed to your durable Cloud SQL
                database. Operations Calendar, Unified Inbox, and Secretary Queue are now refreshed with these
                records.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-slate-500 block uppercase">Calendar Events</span>
                  <span className="text-sm font-bold text-slate-900">
                    {syncResult.calendarEvents.length || syncResult.normalizedFeed.events.length}
                  </span>
                </div>
                <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-slate-500 block uppercase">Email Inquiries</span>
                  <span className="text-sm font-bold text-slate-900">
                    {syncResult.emails.length || syncResult.normalizedFeed.conversations.filter(c => c.channel === 'email').length}
                  </span>
                </div>
                <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-slate-500 block uppercase">WhatsApp Chats</span>
                  <span className="text-sm font-bold text-slate-900">
                    {syncResult.whatsAppMessages.length}
                  </span>
                </div>
                <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-slate-500 block uppercase">Secretary Tasks</span>
                  <span className="text-sm font-bold text-slate-900">
                    {syncResult.normalizedFeed.tasks.length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Authoritative source: EritreaVisit Operations Command
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl cursor-pointer"
            >
              {syncResult ? 'Close' : 'Cancel'}
            </button>
            <button
              onClick={handleStartSync}
              disabled={isSyncing}
              className="px-5 py-2.5 text-xs font-bold text-white brand-gradient rounded-xl shadow-brand hover:brightness-105 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Fetching Channels...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Fetch Data from All Channels
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
