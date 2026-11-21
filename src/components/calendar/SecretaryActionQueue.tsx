import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  UserCheck,
  Calendar,
  Flame,
  Check,
} from 'lucide-react';
import { FeedTask, FeedConversation, FeedConflict, FeedEvent, FeedTraveler, eritreaDateString, parseFeedDate, formatEritreaDateTime } from '../../../shared/feedSchema';

interface SecretaryActionQueueProps {
  tasks?: FeedTask[];
  conversations?: FeedConversation[];
  conflicts?: FeedConflict[];
  events?: FeedEvent[];
  travelers?: FeedTraveler[];
  onOpenTravelerDossier?: (travelerId: string, travelerName?: string) => void;
  onUpdateTask?: (task: FeedTask) => void;
  isAdminUser?: boolean;
}

export const SecretaryActionQueue: React.FC<SecretaryActionQueueProps> = ({
  tasks = [],
  conversations = [],
  conflicts = [],
  events = [],
  travelers = [],
  onOpenTravelerDossier,
  onUpdateTask,
  isAdminUser = false,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'today' | 'snoozed' | 'completed'>('all');
  const [localTasks, setLocalTasks] = useState<Record<string, FeedTask>>({});

  // Synthesize and merge tasks from real operational data
  const combinedTasks = useMemo<FeedTask[]>(() => {
    const list: FeedTask[] = [];
    const seen = new Set<string>();

    // 1. Explicit feed tasks
    tasks.forEach((t) => {
      const current = localTasks[t.id] || t;
      seen.add(current.id);
      list.push(current);
    });

    // 2. Synthesize from real unanswered conversations
    conversations
      .filter((c) => c.status === 'unanswered')
      .forEach((c) => {
        const taskId = `task_conv_${c.id}`;
        if (!seen.has(taskId)) {
          seen.add(taskId);
          const override = localTasks[taskId];
          if (override) {
            list.push(override);
          } else {
            const lastMsg = c.messages?.[c.messages.length - 1];
            list.push({
              id: taskId,
              title: `Unanswered ${c.channel.toUpperCase()} message: ${c.travelerName || 'Client'}`,
              priority: 'urgent',
              due: new Date(Date.now() + 2 * 3600000).toISOString(),
              status: 'pending',
              travelerId: c.travelerId,
              travelerName: c.travelerName,
              sourceUrl: `https://web.whatsapp.com/send?phone=${encodeURIComponent(c.travelerName || '')}`,
              evidence: lastMsg ? `"${lastMsg.content.slice(0, 90)}..."` : `Pending client reply on ${c.channel}`,
              category: 'conversation',
              assignedTo: 'Desk Secretary',
            });
          }
        }
      });

    // 3. Synthesize from real operational conflicts
    conflicts.forEach((cf) => {
      const taskId = `task_conf_${cf.id}`;
      if (!seen.has(taskId)) {
        seen.add(taskId);
        const override = localTasks[taskId];
        if (override) {
          list.push(override);
        } else {
          list.push({
            id: taskId,
            title: `Operational Conflict: ${cf.title}`,
            priority: cf.severity === 'high' ? 'urgent' : 'high',
            due: new Date(Date.now() + 4 * 3600000).toISOString(),
            status: 'pending',
            travelerId: cf.travelerId,
            evidence: cf.description,
            category: 'conflict',
            assignedTo: 'Operations Dispatch',
          });
        }
      }
    });

    // 4. Synthesize from upcoming flight arrivals in next 48h
    events
      .filter((e) => e.flightNumber && (e.label?.includes('Arrival') || e.colorHex === '#0b8043'))
      .forEach((e) => {
        const taskId = `task_flight_${e.id}`;
        if (!seen.has(taskId)) {
          seen.add(taskId);
          const override = localTasks[taskId];
          if (override) {
            list.push(override);
          } else {
            list.push({
              id: taskId,
              title: `Verify Airport Dispatch: Flight ${e.flightNumber} (${e.title})`,
              priority: 'high',
              due: typeof e.start === 'string' ? e.start : (e.start as any)?.dateTime || new Date().toISOString(),
              status: 'pending',
              travelerId: e.travelerId,
              sourceUrl: e.sourceUrl,
              evidence: `Airport ${e.airportCode || 'ASM'} arrival with assigned driver ${e.driverName || 'Needs driver'}.`,
              category: 'flight',
              assignedTo: e.driverName || 'Fleet Manager',
            });
          }
        }
      });

    // Sort by priority then due date
    const priorityWeight: Record<string, number> = {
      urgent: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    return list.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (b.status === 'completed' && a.status !== 'completed') return -1;

      const pA = priorityWeight[a.priority || 'medium'] || 2;
      const pB = priorityWeight[b.priority || 'medium'] || 2;
      if (pB !== pA) return pB - pA;

      const dueA = a.due ? new Date(a.due).getTime() : Infinity;
      const dueB = b.due ? new Date(b.due).getTime() : Infinity;
      return dueA - dueB;
    });
  }, [tasks, conversations, conflicts, events, localTasks]);

  // Handle task status changes (complete / snooze / assign)
  const handleToggleComplete = (task: FeedTask) => {
    const isCompleted = task.status === 'completed';
    const updated: FeedTask = {
      ...task,
      status: isCompleted ? 'pending' : 'completed',
      completedAt: isCompleted ? undefined : new Date().toISOString(),
      completedBy: isCompleted ? undefined : 'Current User',
    };
    setLocalTasks((prev) => ({ ...prev, [task.id]: updated }));
    if (onUpdateTask) onUpdateTask(updated);
  };

  const handleSnooze = (task: FeedTask, hours: number) => {
    const snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
    const updated: FeedTask = {
      ...task,
      status: 'snoozed',
      snoozedUntil,
      due: snoozedUntil,
    };
    setLocalTasks((prev) => ({ ...prev, [task.id]: updated }));
    if (onUpdateTask) onUpdateTask(updated);
  };

  const handleAssign = (task: FeedTask, assignedTo: string) => {
    const updated: FeedTask = {
      ...task,
      assignedTo,
    };
    setLocalTasks((prev) => ({ ...prev, [task.id]: updated }));
    if (onUpdateTask) onUpdateTask(updated);
  };

  // Filter tasks based on active pill
  const filteredTasks = useMemo(() => {
    const todayStr = eritreaDateString();
    return combinedTasks.filter((t) => {
      if (activeFilter === 'completed') return t.status === 'completed';
      if (t.status === 'completed') return false;

      if (activeFilter === 'urgent') return t.priority === 'urgent' || t.priority === 'high';
      if (activeFilter === 'snoozed') return t.status === 'snoozed';
      if (activeFilter === 'today') {
        const taskDueStr = t.due ? parseFeedDate(t.due).dateString : '';
        return taskDueStr <= todayStr;
      }
      return true;
    });
  }, [combinedTasks, activeFilter]);

  const urgentCount = combinedTasks.filter((t) => t.status !== 'completed' && (t.priority === 'urgent' || t.priority === 'high')).length;
  const completedCount = combinedTasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col font-sans">
      {/* Header with Title and Filter Tabs */}
      <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif font-bold text-base tracking-tight text-white italic">
                Today / Secretary Action Queue
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-mono font-bold">
                {combinedTasks.filter((t) => t.status !== 'completed').length} Pending
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isAdminUser
                ? 'Live operational tasks derived from imported conversations, schedule conflicts & upcoming travel.'
                : 'Live operational tasks derived from schedule conflicts & upcoming travel dispatches.'}
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg text-xs font-medium">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              activeFilter === 'all' ? 'bg-white text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            All ({combinedTasks.filter((t) => t.status !== 'completed').length})
          </button>
          <button
            onClick={() => setActiveFilter('urgent')}
            className={`px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
              activeFilter === 'urgent' ? 'bg-rose-500 text-white font-bold' : 'text-rose-400 hover:text-rose-300'
            }`}
          >
            <Flame className="w-3 h-3" /> Urgent ({urgentCount})
          </button>
          <button
            onClick={() => setActiveFilter('today')}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              activeFilter === 'today' ? 'bg-white text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Today Due
          </button>
          <button
            onClick={() => setActiveFilter('snoozed')}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              activeFilter === 'snoozed' ? 'bg-white text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Snoozed
          </button>
          <button
            onClick={() => setActiveFilter('completed')}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              activeFilter === 'completed' ? 'bg-emerald-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Completed ({completedCount})
          </button>
        </div>
      </div>

      {/* Task List Table / Rows */}
      <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-xs font-semibold text-slate-700">No action items pending in this view</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              All communications, conflicts, and airport transfers for today are reviewed and clear.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const isSnoozed = task.status === 'snoozed';
            const priorityColor =
              task.priority === 'urgent'
                ? 'bg-rose-100 text-rose-800 border-rose-200'
                : task.priority === 'high'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-slate-100 text-slate-700 border-slate-200';

            return (
              <div
                key={task.id}
                className={`p-3.5 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  isCompleted ? 'opacity-50 bg-slate-50/40 line-through' : ''
                }`}
              >
                {/* Checkbox and Details */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => handleToggleComplete(task)}
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition cursor-pointer ${
                      isCompleted
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-slate-300 hover:border-slate-500 bg-white'
                    }`}
                    title={isCompleted ? 'Mark pending' : 'Mark completed'}
                  >
                    {isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${priorityColor}`}>
                        {task.priority || 'Normal'}
                      </span>
                      {isSnoozed && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Snoozed until {task.snoozedUntil ? formatEritreaDateTime(task.snoozedUntil) : 'Later'}
                        </span>
                      )}
                      <h4 className="font-semibold text-slate-900 line-clamp-1">{task.title}</h4>
                    </div>

                    {task.evidence && (
                      <p className="text-[11px] text-slate-600 line-clamp-1 italic">
                        {task.evidence}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-mono">
                      {task.due && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Due: {formatEritreaDateTime(task.due)}
                        </span>
                      )}
                      {task.assignedTo && (
                        <span className="flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-slate-400" />
                          Assignee: <span className="font-semibold text-slate-700">{task.assignedTo}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons & Source Link */}
                <div className="flex items-center gap-2 shrink-0">
                  {isAdminUser && task.sourceUrl && (
                    <a
                      href={task.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition"
                      title="Open source record / thread"
                    >
                      <ExternalLink className="w-3 h-3 text-slate-500" /> Source
                    </a>
                  )}

                  {task.travelerId && onOpenTravelerDossier && (
                    <button
                      onClick={() => onOpenTravelerDossier(task.travelerId!, task.travelerName)}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition"
                    >
                      Dossier
                    </button>
                  )}

                  {/* Quick Snooze */}
                  <button
                    onClick={() => handleSnooze(task, 2)}
                    className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                    title="Snooze 2 hours"
                  >
                    Snooze 2h
                  </button>

                  {/* Assign to Guide / Driver */}
                  <select
                    value={task.assignedTo || ''}
                    onChange={(e) => handleAssign(task, e.target.value)}
                    className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-700 cursor-pointer focus:bg-white"
                  >
                    <option value="">Assign...</option>
                    <option value="Lead Tour Guide">Lead Tour Guide</option>
                    <option value="Fleet Driver">Fleet Driver</option>
                    <option value="Expedition Lead (Driver & Guide)">Driver & Guide (Dual)</option>
                    <option value="Desk Secretary">Desk Secretary</option>
                    <option value="Operations Manager">Operations Manager</option>
                  </select>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
