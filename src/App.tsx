import React, { useState, useMemo, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  ActiveTab,
  Department,
  Employee,
  TourPackage,
  TourSchedule,
  TouristProfile,
  WebsiteEnquiry,
  Booking,
  Ticket,
  TicketingClient,
  VisaOnArrivalDoc,
  RegionalPermitDoc,
  NotificationItem,
  ItineraryItem,
  StaffStatus,
  Vehicle,
  TourActivity,
  VehicleStatus,
  Hotel,
  HotelReservation,
  HotelLetterDoc,
  RentalLetterDoc,
  MessageChannel,
  MessageItem,
  FinancialTransaction,
  FinancialInvoice,
  ExpenseReceipt,
  ReceiptVerificationStatus,
  TouristActivity,
  TourBooking,
  PermitItineraryStop,
  FeedEvent,
  FeedTraveler,
  FeedConversation,
  FeedDraft,
  FeedConflict,
  VehicleOutwardRental,
  TourCostLine,
} from './types';
import { TouristExpedition } from './components/packages/AddTouristExpeditionModal';
import { useCollection, useWorkspace } from './lib/workspace';
import { api, setAuthToken } from './lib/api';
import { ROLES, canView, canWrite, ADMIN_ONLY_EDIT_MESSAGE } from '../shared/roles';
import { BRAND } from '../shared/brand';

// Layout
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { NotificationsDrawer } from './components/layout/NotificationsDrawer';
import { QuickActionModal } from './components/layout/QuickActionModal';

// Views
import { DashboardView } from './components/dashboard/DashboardView';
import { StaffManagementView } from './components/hr/StaffManagementView';
import { TourCalendarView } from './components/tours/TourCalendarView';
import { TouristDirectoryView } from './components/tourists/TouristDirectoryView';
import { VisaPermitGeneratorView } from './components/documents/VisaPermitGeneratorView';
import { TicketManagementView } from './components/tickets/TicketManagementView';
import { TripPreparationDesk } from './components/packages/TripPreparationDesk';
import { canPrepareTrip } from '../shared/tripPreparation';
import { TourPackagesView } from './components/packages/TourPackagesView';
import { TransportManagementView } from './components/transport/TransportManagementView';
import { HotelManagementView } from './components/hotels/HotelManagementView';
import { AccountMessagesView } from './components/messages/AccountMessagesView';
import { MessagesView } from './components/messages/MessagesView';
import { FinanceWorkspace } from './components/finance/FinanceWorkspace';
import { AuditControlView, detectRedFlags } from './components/audit/AuditControlView';
import { StaffAccountsView } from './components/accounts/StaffAccountsView';
import { AdminControlCentre } from './components/admin/AdminControlCentre';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Modals
import { AddEmployeeModal } from './components/hr/AddEmployeeModal';
import { NewDepartureModal } from './components/tours/NewDepartureModal';
import { AddTouristModal } from './components/tourists/AddTouristModal';
import { IssueTicketModal } from './components/tickets/IssueTicketModal';
import { HotelReservationModal } from './components/hotels/HotelReservationModal';
import { AddTouristActivityModal } from './components/tourists/AddTouristActivityModal';
import { SampleDataModal } from './components/settings/SampleDataModal';
import { GoogleCalendarImportModal } from './components/calendar/GoogleCalendarImportModal';
import {
  OmnichannelExtractedClient,
  toBookingFromOmnichannelClient,
  toTicketingClient,
  toTouristProfile,
  toWebsiteEnquiry,
} from './lib/omnichannelClientImport';
import { Conversation } from './types';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // Core data. Each of these reads from, and writes back to, the shared
  // agency database — the hook has the same shape as useState, so every screen
  // below works exactly as it did when the data was local.
  const { user, reload: reloadWorkspace, status: saveStatus, lastError, dismissError, canEditRecords } = useWorkspace();
  const [rolesVersion, setRolesVersion] = useState(0);

  useEffect(() => {
    const handleRolesUpdated = () => {
      setRolesVersion((v) => v + 1);
    };
    window.addEventListener('roles_updated', handleRolesUpdated);
    return () => window.removeEventListener('roles_updated', handleRolesUpdated);
  }, []);

  const role = user.role;
  const permissions = ROLES[role] || {
    label: role,
    description: '',
    view: ['dashboard', 'messages'],
    write: ['messages'],
    can: {
      issueTicket: false,
      recordPayment: false,
      approveIssue: false,
      manageAccounts: false,
      viewAllBookings: true,
      exportReports: false,
    },
  };

  const [departments, setDepartments] = useCollection<Department>('departments');
  const [employees, setEmployees] = useCollection<Employee>('employees');
  const [packages, setPackages] = useCollection<TourPackage>('packages');
  const [activities, setActivities] = useCollection<TourActivity>('activities');
  const [vehicles, setVehicles] = useCollection<Vehicle>('vehicles');
  const [schedules, setSchedules] = useCollection<TourSchedule>('schedules');
  const [tourists, setTourists] = useCollection<TouristProfile>('tourists');
  const [bookings, setBookings] = useCollection<Booking>('bookings');
  const [websiteEnquiries, setWebsiteEnquiries] = useCollection<WebsiteEnquiry>('websiteEnquiries');
  const [tickets, setTickets] = useCollection<Ticket>('tickets');
  const [visaDocs, setVisaDocs] = useCollection<VisaOnArrivalDoc>('visaDocs');
  const [permits, setPermits] = useCollection<RegionalPermitDoc>('permits');
  const [hotels, setHotels] = useCollection<Hotel>('hotels');
  const [reservations, setReservations] = useCollection<HotelReservation>('reservations');
  const [hotelLetters, setHotelLetters] = useCollection<HotelLetterDoc>('hotelLetters');
  const [rentalLetters, setRentalLetters] = useCollection<RentalLetterDoc>('rentalLetters');
  const [outwardRentals, setOutwardRentals] = useCollection<VehicleOutwardRental>('vehicleOutwardRentals');
  const [channels, setChannels] = useCollection<MessageChannel>('channels');
  const [messages, setMessages] = useCollection<MessageItem>('messages');
  const [financialTransactions, setFinancialTransactions] = useCollection<FinancialTransaction>('financialTransactions');
  const [financialInvoices, setFinancialInvoices] = useCollection<FinancialInvoice>('financialInvoices');
  const [receipts, setReceipts] = useCollection<ExpenseReceipt>('receipts');
  const [notifications, setNotifications] = useCollection<NotificationItem>('notifications');
  const [touristActivities, setTouristActivities] = useCollection<TouristActivity>('touristActivities');
  const [tourBookings, setTourBookings] = useCollection<TourBooking>('tourBookings');
  const [expeditions, setExpeditions] = useCollection<TouristExpedition>('expeditions');
  const [persistedClients, setPersistedClients] = useCollection<TicketingClient>('ticketingClients');

  // Daily Review & Calendar Feed collections (authoritative in Cloud SQL)
  const [feedEvents, setFeedEvents] = useCollection<FeedEvent>('feedEvents');
  const [feedTravelers] = useCollection<FeedTraveler>('feedTravelers');
  const [feedConversations] = useCollection<FeedConversation>('feedConversations');
  const [feedDrafts] = useCollection<FeedDraft>('feedDrafts');
  const [feedConflicts] = useCollection<FeedConflict>('feedConflicts');
  const [feedTasks] = useCollection<any>('feedTasks');
  const [dailyFeeds] = useCollection<any>('dailyFeeds');
  const [isGoogleCalendarModalOpen, setIsGoogleCalendarModalOpen] = useState(false);

  const lastSuccessfulFeedTime = useMemo(() => {
    if (dailyFeeds && dailyFeeds.length > 0) {
      const sorted = [...dailyFeeds].sort(
        (a, b) =>
          new Date(b.importedAt || b.createdAt || 0).getTime() -
          new Date(a.importedAt || a.createdAt || 0).getTime()
      );
      return sorted[0]?.importedAt || sorted[0]?.createdAt;
    }
    return undefined;
  }, [dailyFeeds]);

  const ticketingClients = useMemo(() => {
    return persistedClients || [];
  }, [persistedClients]);

  const standardConversations = useMemo<Conversation[]>(() => {
    return (feedConversations || []).map((fc) => ({
      id: fc.id,
      channel: fc.channel === 'whatsapp' ? 'WhatsApp' : 'Email',
      clientName: fc.travelerName || 'Client',
      clientHandle:
        fc.channel === 'whatsapp'
          ? (fc as any).phoneNumber || '+2917190374'
          : `${(fc.travelerName || 'client').toLowerCase().replace(/[^a-z0-9]/g, '.')}@traveler.com`,
      subject: fc.subject || 'Tour & Travel Inquiry',
      status: fc.status === 'unanswered' ? 'Unanswered' : 'Waiting for Client',
      lastMessagePreview: fc.messages[fc.messages.length - 1]?.content || '',
      lastTimestamp: fc.lastMessageAt,
      unreadCount: fc.status === 'unanswered' ? 1 : 0,
      messages: (fc.messages || []).map((m) => ({
        id: m.id,
        sender: m.sender,
        senderName: m.senderName,
        text: m.content,
        timestamp: m.timestamp,
        channel: fc.channel === 'whatsapp' ? 'WhatsApp' : 'Email',
      })),
    }));
  }, [feedConversations]);

  // Unified tourists, ticketing clients, and expedition travelers list for cross-module integration
  const allTouristsAndClients = useMemo<TouristProfile[]>(() => {
    const map = new Map<string, TouristProfile>();

    // 1. Add all from tourists collection
    (tourists || []).forEach((t) => {
      if (t && t.id) {
        map.set(t.id, t);
        if (t.passportNumber) {
          map.set(`pp_${t.passportNumber.trim().toUpperCase()}`, t);
        }
      }
    });

    // 2. Merge all ticketing clients
    (ticketingClients || []).forEach((c) => {
      const ppKey = c.passportNumber ? `pp_${c.passportNumber.trim().toUpperCase()}` : null;
      const existing = map.get(c.id) || (ppKey ? map.get(ppKey) : null);
      if (existing) {
        const merged: TouristProfile = {
          ...existing,
          fullName: existing.fullName || c.fullName,
          phone: existing.phone || c.phone,
          email: existing.email || c.email,
          passportNumber: existing.passportNumber || c.passportNumber,
          passportExpiry: existing.passportExpiry || c.passportExpiry,
          nationality: existing.nationality || c.nationality,
          occupation: existing.occupation || c.occupation,
        };
        map.set(existing.id, merged);
      } else {
        const isVip = c.vipStatus || c.category === 'VIP Traveler';
        const clientProfile: TouristProfile = {
          id: c.id.startsWith('tourist-') ? c.id : `tourist-${c.id}`,
          fullName: c.fullName,
          email: c.email || '',
          phone: c.phone || '',
          passportNumber: c.passportNumber || '',
          passportExpiry: c.passportExpiry || '',
          nationality: c.nationality || 'International',
          dateOfBirth: c.dateOfBirth || '',
          gender: (c.gender === 'Female' ? 'Female' : 'Male') as any,
          occupation: c.occupation || 'International Traveler',
          dietaryRequirements: '',
          medicalNotes: '',
          travelHistoryCount: c.totalBookingsCount || 1,
          status: (isVip ? 'VIP' : 'Active Traveler') as any,
          avatar: c.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
          notes: `Ticketing Client: ${c.companyOrOrg || c.notes || 'Registered Client Profile'}`,
          preferredLanguage: 'English',
        };
        map.set(clientProfile.id, clientProfile);
        if (ppKey) map.set(ppKey, clientProfile);
      }
    });

    // 3. Merge from expeditions (Lead + Companions)
    (expeditions || []).forEach((exp) => {
      const leadId = `tourist-${exp.id}`;
      const leadPpKey = exp.passportNumber ? `pp_${exp.passportNumber.trim().toUpperCase()}` : null;
      if (!map.has(leadId) && (!leadPpKey || !map.has(leadPpKey))) {
        const leadProf: TouristProfile = {
          id: leadId,
          fullName: exp.leadName,
          email: exp.email || '',
          phone: exp.phone || '',
          passportNumber: exp.passportNumber || '',
          passportExpiry: exp.passportExpiry || '',
          nationality: exp.nationality || 'International',
          dateOfBirth: exp.dateOfBirth || '',
          gender: exp.gender || 'Male',
          occupation: exp.occupation || 'International Traveler',
          dietaryRequirements: exp.dietary || '',
          medicalNotes: exp.medicalNotes || '',
          travelHistoryCount: 1,
          status: exp.isVip ? 'VIP' : 'Active Traveler',
          avatar: exp.avatar || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
          notes: `Expedition: ${exp.partyTitle || exp.routeSummary}`,
          preferredLanguage: exp.preferredLanguage || 'English',
        };
        map.set(leadId, leadProf);
        if (leadPpKey) map.set(leadPpKey, leadProf);
      }

      (exp.companions || exp.familyMembers || []).forEach((m, idx) => {
        const compId = `tourist-${exp.id}-m${idx + 1}`;
        const compPpKey = m.passportNumber ? `pp_${m.passportNumber.trim().toUpperCase()}` : null;
        if (!map.has(compId) && (!compPpKey || !map.has(compPpKey))) {
          const compProf: TouristProfile = {
            id: compId,
            fullName: m.fullName || (m as any).name || 'Companion Traveler',
            email: exp.email || '',
            phone: exp.phone || '',
            passportNumber: m.passportNumber || '',
            passportExpiry: m.passportExpiry || '',
            nationality: m.nationality || exp.nationality || 'International',
            dateOfBirth: m.dateOfBirth || (m as any).dob || '',
            gender: m.gender === 'Female' ? 'Female' : 'Male',
            occupation: m.occupation || m.relationship || 'Traveler',
            dietaryRequirements: m.dietaryRequirements || (m as any).dietary || '',
            medicalNotes: m.medicalNotes || '',
            travelHistoryCount: 1,
            status: 'Active Traveler',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            notes: `Companion with ${exp.leadName}`,
            preferredLanguage: 'English',
          };
          map.set(compId, compProf);
          if (compPpKey) map.set(compPpKey, compProf);
        }
      });
    });

    const result: TouristProfile[] = [];
    const seen = new Set<string>();
    for (const [key, val] of map.entries()) {
      if (!key.startsWith('pp_') && !seen.has(val.id)) {
        seen.add(val.id);
        result.push(val);
      }
    }
    return result;
  }, [tourists, ticketingClients, expeditions]);

  const handleAddTicketingClient = (newClient: TicketingClient) => {
    setPersistedClients((prev) => [newClient, ...(prev || [])]);

    const isVip = newClient.vipStatus || newClient.category === 'VIP Traveler';
    const clientTouristProfile: TouristProfile = {
      id: newClient.id.startsWith('tourist-') ? newClient.id : `tourist-${newClient.id}`,
      fullName: newClient.fullName,
      email: newClient.email || '',
      phone: newClient.phone || '',
      passportNumber: newClient.passportNumber || '',
      passportExpiry: newClient.passportExpiry || '',
      nationality: newClient.nationality || 'International',
      dateOfBirth: newClient.dateOfBirth || '',
      gender: (newClient.gender === 'Female' ? 'Female' : 'Male') as any,
      occupation: newClient.occupation || 'International Traveler',
      dietaryRequirements: '',
      medicalNotes: '',
      travelHistoryCount: (newClient.totalBookingsCount || 0) + 1,
      status: (isVip ? 'VIP' : 'Active Traveler') as any,
      avatar: newClient.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      notes: `Ticketing Client Dossier: ${newClient.notes || newClient.companyOrOrg || 'Client Profile'}`,
      preferredLanguage: 'English',
    };

    setTourists((prev) => {
      const idx = prev.findIndex(
        (t) =>
          t.id === clientTouristProfile.id ||
          (t.passportNumber && t.passportNumber === clientTouristProfile.passportNumber)
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...clientTouristProfile };
        return copy;
      }
      return [clientTouristProfile, ...prev];
    });

    // Auto-create official VoA sponsorship draft for Visa & Permits desk
    const voaDoc: VisaOnArrivalDoc = {
      id: `voa-client-${newClient.id}`,
      docNumber: `VE-VOA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceNumber: `REF-VOA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      touristId: clientTouristProfile.id,
      touristName: newClient.fullName,
      passportNumber: newClient.passportNumber || '',
      passportExpiry: newClient.passportExpiry || '',
      gender: newClient.gender || 'Male',
      nationality: newClient.nationality || 'International',
      occupation: newClient.occupation || 'International Traveler',
      job: newClient.occupation || 'International Traveler',
      tourPackageTitle: 'Eritrea Visit & Heritage Tour',
      arrivalDate: new Date().toISOString().split('T')[0],
      departureDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      entryPort: 'Asmara International Airport (ASM)',
      localSponsorName: 'Keckia Travel Agency',
      localSponsorLicense: 'LIC/TOUR/MOCT-88921-ET',
      hotelArrangements: 'Hotel Asmara Palace',
      issuanceStatus: 'Approved',
      generatedAt: new Date().toISOString().split('T')[0],
      letterDate: new Date().toISOString().split('T')[0],
      officialNotes: `Visa on Arrival Sponsorship issued for registered client ${newClient.fullName}.`,
      signatoryName: 'Helen Berhe',
      signatoryTitle: 'Head of Consular & Compliance Affairs',
      touristsManifest: [
        {
          name: newClient.fullName,
          passportNo: newClient.passportNumber || '',
          gender: newClient.gender || 'Male',
          nationality: newClient.nationality || 'International',
          job: newClient.occupation || 'International Traveler',
        },
      ],
    };

    setVisaDocs((prev) => {
      const idx = prev.findIndex((v) => v.id === voaDoc.id || (v.passportNumber && v.passportNumber === voaDoc.passportNumber));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = voaDoc;
        return copy;
      }
      return [voaDoc, ...prev];
    });

    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Client Integrated with Visa & Permit Desk`,
      message: `Client ${newClient.fullName} (${newClient.clientCode || 'Client'}) registered and synchronized to Visa on Arrival & Regional Permits.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleUpdateTicketingClient = (updatedClient: TicketingClient) => {
    setPersistedClients((prev) =>
      (prev || []).map((c) => (c.id === updatedClient.id ? updatedClient : c))
    );
  };

  const handleDeleteTicketingClient = (clientId: string) => {
    setPersistedClients((prev) => (prev || []).filter((c) => c.id !== clientId));
  };

  // Global Modals State
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [isSampleDataOpen, setIsSampleDataOpen] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isScheduleDepartureOpen, setIsScheduleDepartureOpen] = useState(false);
  const [isAddTouristOpen, setIsAddTouristOpen] = useState(false);
  const [isIssueTicketOpen, setIsIssueTicketOpen] = useState(false);
  const [isReserveHotelOpen, setIsReserveHotelOpen] = useState(false);
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);

  // Preselected context for workflows
  const [preselectedTourist, setPreselectedTourist] = useState<TouristProfile | null>(null);
  const [preselectedHotelPackage, setPreselectedHotelPackage] = useState<TourPackage | null>(null);
  const [preselectedHotelTourist, setPreselectedHotelTourist] = useState<TouristProfile | null>(null);
  const [preselectedActivityTourist, setPreselectedActivityTourist] = useState<TouristProfile | null>(null);

  // Unread urgent alert count
  const urgentAlertCount = useMemo(
    () => notifications.filter((n) => !n.read && n.priority === 'urgent').length,
    [notifications]
  );

  // Handlers for HR
  const handleAddEmployee = (newEmp: Employee) => {
    setEmployees((prev) => [newEmp, ...prev]);
  };

  const handleUpdateEmployee = (updatedEmp: Employee) => {
    setEmployees((prev) => prev.map((e) => (e.id === updatedEmp.id ? updatedEmp : e)));
  };

  const handleDeleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  };

  // Handlers for Tour Packages & Activities
  const handleAddPackage = (newPkg: TourPackage) => {
    setPackages((prev) => [newPkg, ...prev]);
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Tour Package Created`,
      message: `"${newPkg.title}" (${newPkg.durationDays} Days, ${newPkg.region}) added to expedition catalog.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'schedule_change',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleUpdatePackage = (updatedPkg: TourPackage) => {
    setPackages((prev) => prev.map((p) => (p.id === updatedPkg.id ? updatedPkg : p)));
  };

  const handleSavePackageItinerary = (packageId: string, itinerary: ItineraryItem[]) => {
    setPackages((prev) =>
      prev.map((pkg) => (pkg.id === packageId ? { ...pkg, itinerary } : pkg))
    );
  };

  const handleAddActivity = (newActivity: TourActivity) => {
    setActivities((prev) => [newActivity, ...prev]);
  };

  const handleAddTourBooking = (booking: TourBooking) => {
    setTourBookings((prev) => [booking, ...prev]);
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Tour Booking Confirmed: ${booking.touristName}`,
      message: `${booking.region} · ${booking.startDate} → ${booking.endDate} · ${booking.travelersCount} pax · $${booking.totalPackageUSD.toLocaleString()} total.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'schedule_change',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  // Handlers for Tourist Expeditions (Tour Operations cross-module sync)
  const handleSaveExpedition = (exp: TouristExpedition) => {
    // 1. Save expedition record
    setExpeditions((prev) => {
      const idx = prev.findIndex((e) => e.id === exp.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = exp;
        return copy;
      }
      return [exp, ...prev];
    });

    // 2. Propagate to Tourist Profiles (Lead + All Family Members)
    const newProfiles: TouristProfile[] = [];
    newProfiles.push({
      id: `tourist-${exp.id}`,
      fullName: exp.leadName,
      email: exp.email || '',
      phone: exp.phone || '',
      passportNumber: exp.passportNumber || '',
      passportExpiry: exp.passportExpiry || '',
      nationality: exp.nationality || 'International',
      dateOfBirth: exp.dateOfBirth || '',
      gender: exp.gender || 'Male',
      occupation: exp.occupation || 'International Traveler',
      dietaryRequirements: exp.dietary || '',
      medicalNotes: exp.medicalNotes || '',
      medicalClearanceHighAltitude: exp.medicalClearanceHighAltitude,
      emergencyContact: exp.emergencyContact || { name: '', relation: '', phone: '' },
      travelHistoryCount: 1,
      status: exp.isVip ? 'VIP' : 'Active Traveler',
      avatar: exp.avatar || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      notes: `Expedition Dossier: ${exp.partyTitle || exp.routeSummary}`,
      preferredLanguage: exp.preferredLanguage || 'English',
      scannedDocumentName: exp.passportDocName,
      scannedDocumentUrl: exp.passportDocUrl,
      tourSituation: exp.situation,
      groupOrFamilyName: exp.partyTitle,
      partySize: exp.paxCount,
      companions: exp.companions || exp.familyMembers || [],
      customItinerary: {
        summary: exp.routeSummary,
        days: exp.schedule,
      },
      hotelBookings: exp.hotelBookings,
      assignedGuideId: exp.assignedGuideId || exp.guideId,
      assignedDriverId: exp.assignedDriverId || exp.driverId,
      assignedVehicleId: exp.assignedVehicleId || exp.vehicleId,
    });

    const companionList = exp.companions || exp.familyMembers || [];
    if (companionList.length > 0) {
      companionList.forEach((m, mIdx) => {
        newProfiles.push({
          id: `tourist-${exp.id}-m${mIdx + 1}`,
          fullName: m.fullName || (m as any).name || 'Companion Traveler',
          email: exp.email || '',
          phone: exp.phone || '',
          passportNumber: m.passportNumber || '',
          passportExpiry: m.passportExpiry || '',
          nationality: m.nationality || exp.nationality || 'International',
          dateOfBirth: m.dateOfBirth || (m as any).dob || '',
          gender: m.gender === 'Female' ? 'Female' : 'Male',
          occupation: m.occupation || m.relationship || 'Travel Companion',
          dietaryRequirements: m.dietaryRequirements || (m as any).dietary || exp.dietary || '',
          medicalNotes: m.medicalNotes || '',
          emergencyContact: exp.emergencyContact || { name: '', relation: '', phone: '' },
          travelHistoryCount: 1,
          status: 'Active Traveler',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          notes: `Travel Companion with ${exp.leadName} (${m.relationship || 'Family'})`,
          preferredLanguage: 'English',
          scannedDocumentName: m.passportDocName,
          scannedDocumentUrl: m.passportDocUrl,
          tourSituation: exp.situation,
        });
      });
    }

    setTourists((prev) => {
      let updated = [...prev];
      for (const p of newProfiles) {
        const existIdx = updated.findIndex(
          (t) =>
            (t.passportNumber && t.passportNumber === p.passportNumber) ||
            t.id === p.id ||
            t.fullName.toLowerCase() === p.fullName.toLowerCase()
        );
        if (existIdx >= 0) {
          updated[existIdx] = { ...updated[existIdx], ...p };
        } else {
          updated = [p, ...updated];
        }
      }
      return updated;
    });

    // 3. Propagate to Hotel Reservation & Management Letter
    const hotelName = exp.hotelName || exp.schedule?.[0]?.lodging || 'Hotel Asmara Palace';
    const hotelObj = hotels.find((h) => h.name.toLowerCase().includes(hotelName.toLowerCase())) || hotels[0];
    const checkIn = exp.checkIn || new Date().toISOString().split('T')[0];
    const checkOut =
      exp.checkOut ||
      new Date(Date.now() + (exp.daysPlanned || 5) * 86400000).toISOString().split('T')[0];

    const hotelRes: HotelReservation = {
      id: `res-exp-${exp.id}`,
      confirmationCode: `CONF-${exp.id.slice(-4).toUpperCase()}`,
      hotelId: hotelObj?.id || 'hotel-001',
      hotelName: hotelObj?.name || hotelName,
      hotelCity: hotelObj?.city || 'Asmara',
      roomTypeId: hotelObj?.roomTypes?.[0]?.id || 'rt-001',
      roomTypeName: exp.roomType || hotelObj?.roomTypes?.[0]?.name || 'Deluxe Room',
      touristId: `tourist-${exp.id}`,
      touristName: exp.leadName,
      touristPassport: exp.passportNumber,
      touristNationality: exp.nationality,
      touristEmail: exp.email,
      touristPhone: exp.phone,
      tourPackageTitle: exp.partyTitle || exp.routeSummary,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      numberOfNights: exp.daysPlanned || 4,
      numberOfGuests: exp.paxCount || 1,
      numberOfRooms: Math.ceil((exp.paxCount || 1) / 2),
      mealPlan: 'Bed & Breakfast (BB)',
      pricePerNight: 120,
      totalAmount: exp.totalHotelUSD || 480,
      paymentStatus: 'Confirmed',
      specialRequests: exp.dietary ? `Dietary: ${exp.dietary}` : undefined,
      voucherIssuedAt: new Date().toISOString().split('T')[0],
      airportTransferIncluded: true,
    };

    setReservations((prev) => {
      const idx = prev.findIndex((r) => r.id === hotelRes.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = hotelRes;
        return copy;
      }
      return [hotelRes, ...prev];
    });

    const hotelLetterDoc: HotelLetterDoc = {
      id: `hl-exp-${exp.id}`,
      refNumber: `REF-HTL-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      hotelId: hotelObj?.id || 'hotel-001',
      hotelName: hotelObj?.name || hotelName,
      hotelNameTigrinya: hotelObj?.nameTigrinya || hotelName,
      city: hotelObj?.city || 'ኣስመራ (Asmara)',
      subjectTigrinya: 'ጉዳይ፥ ሕድሪ ቦታ ምሓዝ (Hotel Room Reservation Request)',
      salutationTigrinya: 'ዝኸበርኩም ኣካየድቲ ሆቴል፡',
      openingTigrinya: 'ብትካልና ኬክያ ወኪል ጉዕዞ ንዝመጹና ኣጋይሽ/ቱሪስት ኣብ ሆቴልኩም መደቀሲ ክፍሊ ክትሕዙልና ብትሕትና ንሓትት።',
      closingTigrinya: 'ንትገብሩልና ምትሕብባር ኣቐዲምና ነመስግን።',
      signoffTigrinya: 'ብኣኽብሮት፡',
      agencyNameTigrinya: 'ኬክያ ወኪል ጉዕዞ (Keckia Travel Agency)',
      guests: [
        {
          id: `guest-${exp.id}-1`,
          name: exp.leadName,
          noOfClients: 1,
          roomType: exp.roomType || 'Deluxe Single',
          reservedDate: checkIn,
          nights: exp.daysPlanned || 4,
          remarks: `Passport: ${exp.passportNumber} (${exp.nationality})`,
        },
        ...(exp.companions || exp.familyMembers || []).map((m, mIdx) => ({
          id: `guest-${exp.id}-${mIdx + 2}`,
          name: m.fullName || (m as any).name || 'Companion',
          noOfClients: 1,
          roomType: 'Standard Room',
          reservedDate: checkIn,
          nights: exp.daysPlanned || 4,
          remarks: `Passport: ${m.passportNumber} (${m.nationality || exp.nationality})`,
        })),
      ],
      status: 'Confirmed by Hotel',
    };

    setHotelLetters((prev) => {
      const idx = prev.findIndex((hl) => hl.id === hotelLetterDoc.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = hotelLetterDoc;
        return copy;
      }
      return [hotelLetterDoc, ...prev];
    });

    // 4. Propagate to Visa on Arrival (VoA) Guarantee Letter
    const voaDoc: VisaOnArrivalDoc = {
      id: `voa-exp-${exp.id}`,
      docNumber: `VE-VOA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceNumber: `REF-VOA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      touristId: `tourist-${exp.id}`,
      touristName: exp.leadName,
      passportNumber: exp.passportNumber,
      passportExpiry: exp.passportExpiry,
      gender: 'Male',
      nationality: exp.nationality,
      occupation: exp.occupation || 'International Traveler',
      job: exp.occupation || 'International Traveler',
      tourPackageTitle: exp.partyTitle || exp.routeSummary,
      arrivalDate: checkIn,
      departureDate: checkOut,
      entryPort: 'Asmara International Airport (ASM)',
      localSponsorName: 'EritreaVisit Tours & Travel / Keckia Travel Agency',
      localSponsorLicense: 'LIC/TOUR/MOCT-88921-ET',
      hotelArrangements: hotelName,
      issuanceStatus: 'Approved',
      generatedAt: new Date().toISOString().split('T')[0],
      letterDate: new Date().toISOString().split('T')[0],
      officialNotes: `Official Consular Visa on Arrival Guarantee issued for ${exp.leadName} (${exp.paxCount} travelers).`,
      signatoryName: 'Helen Berhe',
      signatoryTitle: 'Head of Consular & Compliance Affairs',
      touristsManifest: [
        {
          name: exp.leadName,
          passportNo: exp.passportNumber,
          gender: 'Male',
          nationality: exp.nationality,
          job: exp.occupation || 'International Traveler',
        },
        ...(exp.companions || exp.familyMembers || []).map((m) => ({
          name: m.fullName || (m as any).name || 'Companion',
          passportNo: m.passportNumber,
          gender: m.gender || 'Male',
          nationality: m.nationality || exp.nationality,
          job: m.occupation || m.relationship || (m as any).relation || 'Traveler',
        })),
      ],
    };

    setVisaDocs((prev) => {
      const idx = prev.findIndex((v) => v.id === voaDoc.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = voaDoc;
        return copy;
      }
      return [voaDoc, ...prev];
    });

    // 5. Propagate to Regional Travel Permit
    const permitStopsList: PermitItineraryStop[] = (exp.schedule || []).map((day, idx) => ({
      id: `stop-${exp.id}-${idx + 1}`,
      place: day.location || 'Asmara & Regional Sites',
      tourDate: `${checkIn} - Day ${day.dayNumber}`,
      hotel: day.lodging || hotelName,
    }));

    const allExpCompanions = exp.companions || exp.familyMembers || [];

    const permitDoc: RegionalPermitDoc = {
      id: `pmt-exp-${exp.id}`,
      permitNumber: `PERMIT-MOT-2026-${Math.floor(100 + Math.random() * 900)}`,
      referenceNumber: `REF-MOT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      zoneName: exp.routeSummary || 'Asmara → Massawa → Qohaito',
      zoneType: 'Heritage Park',
      tourScheduleId: `sch-${exp.id}`,
      tourPackageTitle: exp.partyTitle || exp.routeSummary,
      leadGuideName: exp.guideName || 'Dawit Haile',
      leadGuidePhone: exp.guidePhone || '+291 7 112233',
      leadGuideId: 'MOT-GD-0012',
      guideLicenseNo: 'MOT-GD-0012',
      touristNames: [exp.leadName, ...allExpCompanions.map((m) => m.fullName || (m as any).name)],
      touristPassports: [exp.passportNumber, ...allExpCompanions.map((m) => m.passportNumber)],
      validFrom: checkIn,
      validTo: checkOut,
      vehiclePlate: exp.vehiclePlate || 'ER-2-04981',
      vehicleType: exp.vehicleName || exp.vehicleType || 'Toyota Land Cruiser 4WD',
      hotelName: hotelName,
      authorityOffice: 'ሚኒስትሪ ቱሪዝም ማእከል ሓበሬታ (Ministry of Tourism Information Center)',
      status: 'Active',
      specialClearanceCode: `CLR-${Date.now().toString().slice(-6)}`,
      emergencyRadioFreq: '146.520 MHz (VHF Ch. 4)',
      issuedAt: new Date().toISOString().split('T')[0],
      letterDate: new Date().toISOString().split('T')[0],
      touristsManifest: [
        {
          number: 1,
          name: exp.leadName,
          nationality: exp.nationality,
          passportNumber: exp.passportNumber,
          sex: 'Male',
          tourDate: `${checkIn} - ${checkOut}`,
          tourPlace: exp.routeSummary || 'Asmara & Regional Sites',
          hotel: hotelName,
        },
        ...allExpCompanions.map((m, idx) => ({
          number: idx + 2,
          name: m.fullName || (m as any).name || 'Companion',
          nationality: m.nationality || exp.nationality,
          passportNumber: m.passportNumber,
          sex: m.gender || 'Male',
          tourDate: `${checkIn} - ${checkOut}`,
          tourPlace: exp.routeSummary || 'Asmara & Regional Sites',
          hotel: hotelName,
        })),
      ],
      driversManifest: [
        {
          driverName: exp.driverName || 'Yemane Beraki',
          phoneNumber: exp.driverPhone || '+291 7 556677',
          phone: exp.driverPhone || '+291 7 556677',
          licenseNumber: 'TS-44012',
          taseraNo: 'TS-44012',
          vehicleType: exp.vehicleName || 'Toyota Land Cruiser 4WD',
          carType: exp.vehicleName || 'Toyota Land Cruiser 4WD',
          plateNumber: exp.vehiclePlate || 'ER-2-04981',
          carPlate: exp.vehiclePlate || 'ER-2-04981',
        },
      ],
      itineraryStops: permitStopsList.length > 0 ? permitStopsList : undefined,
    };

    setPermits((prev) => {
      const idx = prev.findIndex((p) => p.id === permitDoc.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = permitDoc;
        return copy;
      }
      return [permitDoc, ...prev];
    });

    // 6. Propagate to Tour Schedules
    const tourSch: TourSchedule = {
      id: `sch-${exp.id}`,
      tourPackageId: 'pkg-custom',
      tourTitle: exp.partyTitle || exp.routeSummary,
      destination: exp.routeSummary || 'Asmara - Massawa - Qohaito',
      startDate: checkIn,
      endDate: checkOut,
      status: 'Upcoming',
      leadGuideId: 'emp-001',
      leadGuideName: exp.guideName || 'Dawit Haile',
      supportStaffIds: [],
      supportStaffNames: [exp.driverName || 'Yemane Beraki'],
      totalSeats: exp.paxCount || 1,
      bookedSeats: exp.paxCount || 1,
      ticketClasses: {
        vip: { price: 1200, totalSeats: exp.paxCount || 1, bookedSeats: exp.paxCount || 1 },
        standard: { price: 800, totalSeats: 0, bookedSeats: 0 },
        group: { price: 650, totalSeats: 0, bookedSeats: 0 },
      },
      permitReference: permitDoc.permitNumber,
      notes: `Convoy & Expedition for ${exp.leadName}. Route: ${exp.routeSummary}`,
    };

    setSchedules((prev) => {
      const idx = prev.findIndex((s) => s.id === tourSch.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = tourSch;
        return copy;
      }
      return [tourSch, ...prev];
    });

    // 7. Propagate to Tour Booking
    const tourBk: TourBooking = {
      id: `tb-exp-${exp.id}`,
      touristId: `tourist-${exp.id}`,
      touristName: exp.leadName,
      region: 'Central & Red Sea',
      startDate: checkIn,
      endDate: checkOut,
      hotelName: hotelName,
      guideName: exp.guideName || 'Dawit Haile',
      driverName: exp.driverName || 'Yemane Beraki',
      vehicleName: exp.vehicleName || 'Toyota Land Cruiser 4WD',
      guideAllowanceUSD: 250,
      driverAllowanceUSD: 180,
      mealsUSD: 200,
      entranceFeesUSD: 120,
      tourType: exp.situation === 'Single' ? 'Private Tour' : 'Custom Tour',
      travelersCount: exp.paxCount || 1,
      pricePerPersonUSD: 950,
      totalPackageUSD: (exp.totalHotelUSD || 480) + 1200,
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    };

    setTourBookings((prev) => {
      const idx = prev.findIndex((tb) => tb.id === tourBk.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = tourBk;
        return copy;
      }
      return [tourBk, ...prev];
    });

    // Notification alert
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Expedition Registered & Synced: ${exp.leadName}`,
      message: `Tourist dossier created, hotel reserved at ${hotelName}, VoA sponsorship drafted, and Ministry of Tourism permit generated.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleDeleteExpedition = (id: string) => {
    setExpeditions((prev) => prev.filter((e) => e.id !== id));
  };
  const handleAddVehicle = (newVeh: Vehicle) => {
    setVehicles((prev) => [newVeh, ...prev]);
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Fleet Asset Registered`,
      message: `"${newVeh.name}" (${newVeh.plateNumber}) added to the Asmara fleet depot.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'schedule_change',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleUpdateVehicle = (updatedVeh: Vehicle) => {
    setVehicles((prev) => prev.map((v) => (v.id === updatedVeh.id ? updatedVeh : v)));
  };

  const handleUpdateVehicleStatus = (vehicleId: string, status: VehicleStatus) => {
    setVehicles((prev) => prev.map((v) => (v.id === vehicleId ? { ...v, status } : v)));
  };

  const handleSaveRentalLetter = (letter: RentalLetterDoc) => {
    setRentalLetters((prev) => {
      const exists = prev.some((l) => l.id === letter.id);
      if (exists) {
        return prev.map((l) => (l.id === letter.id ? letter : l));
      }
      return [letter, ...prev];
    });

    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Rental Requisition Letter Logged`,
      message: `ደብዳቤ ጠለብ ክራይ #${letter.refNumber} generated for ${letter.rentalCompanyName} ($${letter.totalEstimatedCostUSD} USD).`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleSaveOutwardRental = (rental: VehicleOutwardRental) => {
    setOutwardRentals((prev) => {
      const exists = prev.some((r) => r.id === rental.id);
      if (exists) {
        return prev.map((r) => (r.id === rental.id ? rental : r));
      }
      return [rental, ...prev];
    });
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Outward Vehicle Rental Saved (${rental.rentalRef})`,
      message: `${rental.vehicleName} (${rental.vehiclePlate}) rented to ${rental.customerName} for ${rental.billableDays} billable days ($${rental.totalChargeUSD} USD).`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'schedule_change',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handlePostOutwardRentalToLedger = (rental: VehicleOutwardRental) => {
    if (rental.ledgerTransactionId) return; // Prevent duplicate ledger posting
    const txnId = `txn-rentout-${rental.id}`;
    const amountToPost = rental.amountPaidUSD > 0 ? rental.amountPaidUSD : rental.totalChargeUSD;
    const txn: FinancialTransaction = {
      id: txnId,
      date: new Date().toISOString().split('T')[0],
      referenceCode: `TXN-${rental.rentalRef}`,
      category: 'Vehicle & Transport',
      type: 'Income',
      description: `Outward Vehicle Rental (${rental.rentalRef}): ${rental.vehicleName} (${rental.vehiclePlate}) to ${rental.customerName} (${rental.billableDays} days)`,
      amountUSD: amountToPost,
      amountNFA: Math.round(amountToPost * 15),
      payerOrPayee: rental.customerName,
      paymentMethod: 'Bank Wire',
      status: 'Completed',
      linkedEntityId: rental.id,
      linkedEntityType: 'booking',
      recordedBy: user.fullName || 'Fleet Desk',
    };
    setFinancialTransactions((prev) => {
      if (prev.some((t) => t.id === txnId || t.linkedEntityId === rental.id)) return prev;
      return [txn, ...prev];
    });
    setOutwardRentals((prev) =>
      prev.map((r) => (r.id === rental.id ? { ...r, ledgerTransactionId: txnId } : r))
    );
  };

  const handlePostTourCostToLedger = (
    exp: TouristExpedition,
    costLine: TourCostLine
  ): string | undefined => {
    if (costLine.ledgerTransactionId || costLine.linkedLedgerEntryId || costLine.isPayrollAccrued)
      return undefined; // Prevent duplicate or payroll-accrued double counting
    const txnId = `txn-tourcost-${exp.id}-${costLine.id}`;
    const amountUSD = costLine.actualUSD > 0 ? costLine.actualUSD : costLine.expectedUSD;
    const categoryMap: Record<TourCostLine['category'], FinancialTransaction['category']> = {
      hotel: 'Hotel Lodging',
      fuel: 'Vehicle & Transport',
      vehicle_rental: 'Vehicle & Transport',
      boat_rent: 'Boat & Marine Rent',
      guide_allowance: 'Staff Salaries & Allowances',
      driver_allowance: 'Staff Salaries & Allowances',
      overtime: 'Staff Salaries & Allowances',
      meals: 'Meals & Catering',
      logistics: 'Field Logistics & Provisions',
      accommodation: 'Crew, Driver & Guide Accommodation',
      travel_permits: 'Travel Permits & Site Entrance',
      entrance_fees: 'Travel Permits & Site Entrance',
      tips_waitstaff: 'Tips, Experts & Community',
      experts: 'Tips, Experts & Community',
      boat_crew: 'Tips, Experts & Community',
      family_visit: 'Tips, Experts & Community',
      community_assistance: 'Tips, Experts & Community',
      sea_tax: 'Sea Tax & Visa Fees',
      visa_fee: 'Sea Tax & Visa Fees',
    };
    const isUSDItem = costLine.currency === 'USD' || costLine.category === 'sea_tax' || costLine.category === 'visa_fee';
    const txn: FinancialTransaction = {
      id: txnId,
      date: new Date().toISOString().split('T')[0],
      referenceCode: `TXN-COST-${exp.id.slice(-4).toUpperCase()}-${costLine.id.slice(-4).toUpperCase()}`,
      category: categoryMap[costLine.category] || 'Tour Packages',
      type: 'Expense',
      description: `Tour Cost (${exp.partyTitle || exp.leadName}): ${costLine.description || costLine.label}`,
      amountUSD,
      amountNFA: Math.round(amountUSD * 15),
      currency: isUSDItem ? 'USD' : 'ERN',
      originalAmount: isUSDItem ? amountUSD : Math.round(amountUSD * 15),
      payerOrPayee: costLine.staffName || exp.hotelName || exp.leadName,
      paymentMethod: isUSDItem ? 'Cash (USD)' : 'Cash (NFA)',
      status: 'Completed',
      linkedEntityId: exp.id,
      linkedEntityType: 'booking',
      recordedBy: user.fullName || 'Tour Operations',
    };
    setFinancialTransactions((prev) => {
      if (prev.some((t) => t.id === txnId)) return prev;
      return [txn, ...prev];
    });
    setExpeditions((prev) =>
      prev.map((e) =>
        e.id === exp.id
          ? {
              ...e,
              costLines: (e.costLines || []).map((cl) =>
                cl.id === costLine.id
                  ? { ...cl, ledgerTransactionId: txnId, linkedLedgerEntryId: txnId }
                  : cl
              ),
            }
          : e
      )
    );
    return txnId;
  };

  // Handlers for Hotels & Lodging
  const handleAddHotel = (newHotel: Hotel) => {
    setHotels((prev) => [newHotel, ...prev]);
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Hotel Added`,
      message: `${newHotel.name} (${newHotel.city}) added to partner properties catalog.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleUpdateHotel = (updatedHotel: Hotel) => {
    setHotels((prev) => prev.map((h) => (h.id === updatedHotel.id ? updatedHotel : h)));
  };

  const handleUpdateHotelReservation = (updatedRes: HotelReservation) => {
    setReservations((prev) => prev.map((r) => (r.id === updatedRes.id ? updatedRes : r)));
  };

  const handlePostCommissionToLedger = (res: HotelReservation) => {
    if (res.commissionLedgerEntryId) return; // Prevent duplicate ledger posting
    const rate = res.commissionRatePercent ?? 0;
    const eligible = res.commissionEligibleAmount ?? res.totalAmount;
    const commAmount =
      res.calculatedCommissionUSD ?? Math.round(eligible * (rate / 100) * 100) / 100;
    if (commAmount <= 0) return;

    const txnId = `txn-comm-${res.id}`;
    const txn: FinancialTransaction = {
      id: txnId,
      date: new Date().toISOString().split('T')[0],
      referenceCode: `TXN-COM-${res.confirmationCode.slice(-4)}`,
      category: 'Hotel Lodging',
      type: 'Income',
      description: `Hotel Agency Commission (${rate}% on $${eligible}): ${res.hotelName} — ${res.touristName} (${res.confirmationCode})`,
      amountUSD: commAmount,
      amountNFA: Math.round(commAmount * 15),
      payerOrPayee: res.hotelName,
      paymentMethod: 'Bank Wire',
      status: 'Completed',
      linkedEntityId: res.id,
      linkedEntityType: 'hotel_reservation',
      recordedBy: user.fullName || 'Hotel Desk Ops',
    };

    setFinancialTransactions((prev) => {
      if (prev.some((t) => t.id === txnId)) return prev;
      return [txn, ...prev];
    });

    setReservations((prev) =>
      prev.map((r) =>
        r.id === res.id
          ? {
              ...r,
              commissionLedgerEntryId: txnId,
              commissionSettlementStatus:
                r.commissionSettlementStatus === 'Pending'
                  ? 'Invoiced'
                  : r.commissionSettlementStatus || 'Invoiced',
            }
          : r
      )
    );
  };

  const handleAddHotelReservation = (newRes: HotelReservation) => {
    let isUpdate = false;
    setReservations((prev) => {
      const exists = prev.some((r) => r.id === newRes.id);
      if (exists) {
        isUpdate = true;
        return prev.map((r) => (r.id === newRes.id ? newRes : r));
      }
      return [newRes, ...prev];
    });
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Hotel Room Confirmed (${newRes.confirmationCode})`,
      message: `${newRes.hotelName} (${newRes.roomTypeName}) reserved for ${newRes.touristName} (${newRes.numberOfNights} nights, ${newRes.totalAmount} ${newRes.currency || 'USD'}).`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);

    if (!isUpdate) {
      // Auto-record financial transaction for new reservation
      const txn: FinancialTransaction = {
        id: `txn-res-${newRes.id}`,
        date: new Date().toISOString().split('T')[0],
        referenceCode: `TXN-HTL-${newRes.confirmationCode.slice(-4)}`,
        category: 'Hotel Lodging',
        type: 'Income',
        description: `Lodging booking payment: ${newRes.hotelName} for ${newRes.touristName}`,
        amountUSD: newRes.currency === 'ERN' ? Math.round(newRes.totalAmount / 15) : newRes.totalAmount,
        amountNFA: newRes.currency === 'ERN' ? newRes.totalAmount : newRes.totalAmount * 15,
        payerOrPayee: newRes.touristName,
        paymentMethod: 'Bank Wire',
        status: 'Completed',
        receiptNumber: `REC-${newRes.confirmationCode}`,
        recordedBy: 'Hotel Desk Ops',
      };
      setFinancialTransactions((prev) =>
        prev.some((t) => t.id === txn.id) ? prev : [txn, ...prev]
      );
    }
  };

  const handleSaveHotelLetter = (letter: HotelLetterDoc) => {
    setHotelLetters((prev) => {
      const exists = prev.some((l) => l.id === letter.id);
      if (exists) {
        return prev.map((l) => (l.id === letter.id ? letter : l));
      }
      return [letter, ...prev];
    });

    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Official Hotel Letter Generated`,
      message: `ደብዳቤ ምሓዝ ክፍልታት #${letter.refNumber} generated for ${letter.hotelName} (${letter.guests.length} guests).`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleSendToHotelMessage = (letter: HotelLetterDoc) => {
    handleSaveHotelLetter(letter);

    // Find channel for this hotel or use ops channel
    const hotelChannel = channels.find((c) => c.hotelId === letter.hotelId) || channels[0];

    const firstDate = letter.guests[0]?.reservedDate || letter.date;
    const newMsg: MessageItem = {
      id: `msg-${Date.now()}`,
      channelId: hotelChannel.id,
      senderId: 'usr-admin',
      senderName: 'EritreaVisit Central Operations',
      senderRole: 'Reservations Desk',
      content: `Official room request letter (Ref: ${letter.refNumber}) dispatched for ${letter.hotelName}. Total ${letter.guests.length} guest accommodations requested for check-in on ${firstDate}.`,
      timestamp: 'Just now',
      isOutgoing: true,
      priority: 'normal',
      attachments: [
        {
          id: `att-${letter.id}`,
          name: `ደብዳቤ_ምሓዝ_ክፍልታት_${letter.refNumber}.pdf`,
          type: 'letter',
          size: '184 KB',
        },
      ],
    };

    setMessages((prev) => [...prev, newMsg]);
    setActiveTab('messages');
  };

  const handleReserveHotelForTourist = (tourist: TouristProfile) => {
    setPreselectedHotelTourist(tourist);
    setPreselectedHotelPackage(null);
    setIsReserveHotelOpen(true);
  };

  const handleAddActivityForTourist = (tourist: TouristProfile) => {
    setPreselectedActivityTourist(tourist);
    setIsAddActivityOpen(true);
  };

  const handleSaveTouristActivity = (activity: TouristActivity) => {
    setTouristActivities((prev) => [activity, ...prev]);
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Activity Added: ${activity.title}`,
      message: `${activity.date}${activity.timeSlot ? ` · ${activity.timeSlot}` : ''} for ${activity.touristName}${
        activity.guideName ? ` · Guide: ${activity.guideName}` : ''
      }${activity.driverName ? ` · Driver: ${activity.driverName}` : ''}.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'schedule_change',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleReserveHotelForPackage = (pkg: TourPackage) => {
    setPreselectedHotelPackage(pkg);
    setPreselectedHotelTourist(null);
    setIsReserveHotelOpen(true);
  };

  // Handlers for Messages & Dispatch
  const handleSendMessage = (
    channelId: string,
    content: string,
    priority: 'normal' | 'urgent' | 'broadcast' = 'normal',
    attachments: any[] = []
  ) => {
    const newMsg: MessageItem = {
      id: `msg-${Date.now()}`,
      channelId,
      senderId: 'usr-admin',
      senderName: 'EritreaVisit Operations',
      senderRole: 'Dispatch Control',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isOutgoing: true,
      priority,
      attachments,
    };

    setMessages((prev) => [...prev, newMsg]);

    // Update channel's last message
    setChannels((prev) =>
      prev.map((c) =>
        c.id === channelId
          ? {
              ...c,
              lastMessage: content.slice(0, 60),
              lastMessageTime: 'Just now',
            }
          : c
      )
    );
  };

  // Handlers for Financial Transactions & Invoices
  const handleAddFinancialTransaction = (newTxn: FinancialTransaction) => {
    setFinancialTransactions((prev) => [newTxn, ...prev]);
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Financial Entry Recorded`,
      message: `${newTxn.type === 'Income' ? '+' : '-'}$${newTxn.amountUSD} USD (${newTxn.category}) recorded in General Ledger.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleAddFinancialInvoice = (newInv: FinancialInvoice) => {
    setFinancialInvoices((prev) => [newInv, ...prev]);
  };

  // Handlers for Tour Schedules
  const handleAddSchedule = (newSch: TourSchedule) => {
    setSchedules((prev) => [newSch, ...prev]);
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Tour Departure Scheduled`,
      message: `Convoy for "${newSch.tourTitle}" departing on ${newSch.startDate} initialized.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'schedule_change',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleUpdateScheduleGuide = (scheduleId: string, guideName: string) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? { ...s, leadGuideName: guideName } : s))
    );
  };

  // Handlers for Tourist Profiles
  const handleAddTourist = (newTourist: TouristProfile) => {
    setTourists((prev) => [newTourist, ...prev]);

    // Auto-integrate with Visa on Arrival
    const voaDoc: VisaOnArrivalDoc = {
      id: `voa-tourist-${newTourist.id}`,
      docNumber: `VOA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceNumber: `REF-VOA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      touristId: newTourist.id,
      touristName: newTourist.fullName,
      passportNumber: newTourist.passportNumber || 'Pending',
      passportExpiry: newTourist.passportExpiry || '',
      gender: newTourist.gender || 'Male',
      nationality: newTourist.nationality || 'International',
      occupation: newTourist.occupation || 'International Traveler',
      job: newTourist.occupation || 'International Traveler',
      tourPackageTitle: `${newTourist.fullName} Tour Dossier`,
      arrivalDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      departureDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      entryPort: 'Asmara International Airport (ASM)',
      localSponsorName: 'EritreaVisit Tours & Travel / Keckia Travel Agency',
      localSponsorLicense: 'LIC/TOUR/MOCT-88921-ET',
      hotelArrangements: 'Hotel Asmara Palace',
      issuanceStatus: 'Approved',
      generatedAt: new Date().toISOString().split('T')[0],
      letterDate: new Date().toISOString().split('T')[0],
      officialNotes: `Auto-generated Consular Visa on Arrival Guarantee issued for ${newTourist.fullName}.`,
      signatoryName: 'Helen Berhe',
      signatoryTitle: 'Head of Consular & Compliance Affairs',
      touristsManifest: [
        {
          name: newTourist.fullName,
          passportNo: newTourist.passportNumber || 'Pending',
          gender: newTourist.gender || 'Male',
          nationality: newTourist.nationality || 'International',
          job: newTourist.occupation || 'International Traveler',
        },
      ],
    };

    setVisaDocs((prev) => {
      const exists = prev.some((v) => v.id === voaDoc.id || (v.passportNumber === newTourist.passportNumber && newTourist.passportNumber && newTourist.passportNumber !== 'Pending'));
      if (exists) return prev;
      return [voaDoc, ...prev];
    });

    // Auto-integrate with Regional Travel Permit
    const permitDoc: RegionalPermitDoc = {
      id: `pmt-tourist-${newTourist.id}`,
      permitNumber: `PERMIT-MOT-2026-${Math.floor(100 + Math.random() * 900)}`,
      referenceNumber: `REF-MOT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      zoneName: 'Asmara → Massawa → Qohaito & Central Highlands',
      zoneType: 'Heritage Park',
      tourScheduleId: 'sch-custom',
      tourPackageTitle: `${newTourist.fullName} Expedition Dossier`,
      leadGuideName: 'Dawit Haile',
      leadGuidePhone: '+291 7 112233',
      leadGuideId: 'MOT-GD-0012',
      guideLicenseNo: 'MOT-GD-0012',
      touristNames: [newTourist.fullName],
      touristPassports: [newTourist.passportNumber || 'Pending'],
      validFrom: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      validTo: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      vehiclePlate: 'ER-2-04981',
      vehicleType: 'Toyota Land Cruiser 4WD',
      hotelName: 'Hotel Asmara Palace',
      authorityOffice: 'ሚኒስትሪ ቱሪዝም ማእከል ሓበሬታ (Ministry of Tourism Information Center)',
      status: 'Active',
      specialClearanceCode: `CLR-${Date.now().toString().slice(-6)}`,
      emergencyRadioFreq: '146.520 MHz (VHF Ch. 4)',
      issuedAt: new Date().toISOString().split('T')[0],
      letterDate: new Date().toISOString().split('T')[0],
      touristsManifest: [
        {
          number: 1,
          name: newTourist.fullName,
          nationality: newTourist.nationality || 'International',
          passportNumber: newTourist.passportNumber || 'Pending',
          sex: newTourist.gender || 'Male',
          tourDate: `${new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]} - ${new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]}`,
          tourPlace: 'Asmara, Debub Highlands & Red Sea Port',
          hotel: 'Hotel Asmara Palace',
        },
      ],
      driversManifest: [
        {
          driverName: 'Yemane Beraki',
          phoneNumber: '+291 7 556677',
          phone: '+291 7 556677',
          licenseNumber: 'TS-44012',
          taseraNo: 'TS-44012',
          vehicleType: 'Toyota Land Cruiser 4WD',
          carType: 'Toyota Land Cruiser 4WD',
          plateNumber: 'ER-2-04981',
          carPlate: 'ER-2-04981',
        },
      ],
    };

    setPermits((prev) => {
      const exists = prev.some((p) => p.id === permitDoc.id);
      if (exists) return prev;
      return [permitDoc, ...prev];
    });

    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `New Tourist Dossier & Visa/Permits Synced`,
      message: `${newTourist.fullName} (${newTourist.nationality}) registered. Visa on Arrival sponsorship and Regional Travel Permit auto-generated.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  /** Move an enquiry along its pipeline; the change syncs to the database. */
  const handleUpdateEnquiry = (updated: WebsiteEnquiry) => {
    setWebsiteEnquiries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleAddEnquiry = (newLead: WebsiteEnquiry) => {
    setWebsiteEnquiries((prev) => [newLead, ...prev]);
  };

  const handleConvertBookedLeadToBooking = (
    enquiry: WebsiteEnquiry,
    options: {
      existingTouristId?: string;
      existingBookingId?: string;
      operationalStatus: NonNullable<WebsiteEnquiry['operationalBookingStatus']>;
      paymentStatus: Booking['paymentStatus'];
    }
  ) => {
    let linkedTouristId = options.existingTouristId;
    if (!linkedTouristId) {
      // Duplicate safety check on email or fullName
      const dup = tourists.find(
        (t) =>
          (enquiry.email &&
            t.email &&
            t.email.trim().toLowerCase() === enquiry.email.trim().toLowerCase()) ||
          t.fullName.trim().toLowerCase() === enquiry.fullName.trim().toLowerCase()
      );
      if (dup) {
        linkedTouristId = dup.id;
      } else {
        const newTourist: TouristProfile = {
          id: `tour-${Date.now()}`,
          fullName: enquiry.fullName,
          email: enquiry.email,
          phone: enquiry.phone || '',
          passportNumber: '',
          passportExpiry: '',
          nationality: enquiry.country || '',
          dateOfBirth: '',
          gender: 'Male',
          dietaryRequirements: '',
          medicalNotes: '',
          emergencyContact: { name: '', relation: '', phone: '' },
          travelHistoryCount: 1,
          status: 'Active Traveler',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          notes: enquiry.notes || enquiry.message || `CRM Lead ${enquiry.id}`,
          preferredLanguage: 'English',
        };
        handleAddTourist(newTourist);
        linkedTouristId = newTourist.id;
      }
    }

    let linkedBookingId = options.existingBookingId;
    if (!linkedBookingId) {
      const bookingId = `bkg-crm-${enquiry.id}`;
      const newBooking: Booking = {
        id: bookingId,
        bookingRef: `BK-${Date.now().toString().slice(-6)}`,
        tourScheduleId: schedules[0]?.id || 'sch-custom',
        tourTitle:
          enquiry.interestedService || enquiry.tourTitle || 'Eritrea Heritage & Red Sea Tour',
        departureDate:
          enquiry.expectedTravelDate ||
          enquiry.preferredDate ||
          new Date().toISOString().split('T')[0],
        touristId: linkedTouristId,
        touristName: enquiry.fullName,
        touristEmail: enquiry.email,
        touristPassport: '',
        touristNationality: enquiry.country || 'International',
        ticketClass: 'Standard',
        numberOfSeats: enquiry.partySize || 1,
        totalPrice: enquiry.quotationValue || 950,
        paymentStatus: options.paymentStatus,
        bookingDate: new Date().toISOString().split('T')[0],
        specialRequests: enquiry.notes || enquiry.message,
        ticketIds: [],
      };
      setBookings((prev) => {
        if (prev.some((b) => b.id === bookingId)) return prev;
        return [newBooking, ...prev];
      });
      linkedBookingId = bookingId;
    }

    handleUpdateEnquiry({
      ...enquiry,
      stage: 'Booked',
      crmStage: 'Booked',
      status: 'Converted',
      linkedTouristId,
      linkedBookingId,
      operationalBookingStatus: options.operationalStatus,
      paymentStatus: options.paymentStatus,
      handledAt: new Date().toISOString(),
    });
  };

  /**
   * Batch-import, categorize, and assign clients extracted from Email, Google Calendar, and WhatsApp.
   * Deduplicates against existing CRM leads, Tourist profiles, Ticketing clients, and Bookings.
   */
  const handleBatchInsertOmnichannelClients = (extractedClients: OmnichannelExtractedClient[]) => {
    if (!extractedClients || extractedClients.length === 0) return;

    const newEnquiries: WebsiteEnquiry[] = [];
    const newTourists: TouristProfile[] = [];
    const newTicketingClients: TicketingClient[] = [];
    const newBookings: Booking[] = [];

    extractedClients.forEach((client) => {
      const normEmail = (client.email || '').trim().toLowerCase();
      const normName = (client.fullName || '').trim().toLowerCase();

      // 1. Tourist Profile (Deduplicate by email or full name)
      const existingTourist = (tourists || []).find(
        (t) =>
          (normEmail && (t.email || '').trim().toLowerCase() === normEmail) ||
          (normName && (t.fullName || '').trim().toLowerCase() === normName)
      );
      const touristProfile = existingTourist
        ? {
            ...existingTourist,
            gender: (client.gender === 'Female' ? 'Female' : 'Male') as 'Male' | 'Female',
            status: client.touristStatus || existingTourist.status,
            assignedGuideId: client.assignedGuideId || existingTourist.assignedGuideId,
            assignedGuideName: client.assignedGuideName || existingTourist.assignedGuideName,
            assignedDriverId: client.assignedDriverId || existingTourist.assignedDriverId,
            assignedDriverName: client.assignedDriverName || existingTourist.assignedDriverName,
          }
        : toTouristProfile(client);

      if (!existingTourist) {
        newTourists.push(touristProfile);
      }

      // 2. Booking if Booked or Completed
      let linkedBookingId: string | undefined;
      if (client.crmStage === 'Booked' || client.crmStage === 'Completed') {
        const existingBooking = (bookings || []).find(
          (b) =>
            b.touristId === touristProfile.id ||
            (normName && (b.touristName || '').trim().toLowerCase() === normName)
        );
        if (existingBooking) {
          linkedBookingId = existingBooking.id;
        } else {
          const createdBooking = toBookingFromOmnichannelClient(client, touristProfile.id);
          newBookings.push(createdBooking);
          linkedBookingId = createdBooking.id;
        }
      }

      // 3. CRM Lead / Website Enquiry (Deduplicate by email or full name)
      const existingLead = (websiteEnquiries || []).find(
        (e) =>
          (normEmail && (e.email || '').trim().toLowerCase() === normEmail) ||
          (normName && (e.fullName || '').trim().toLowerCase() === normName)
      );
      if (!existingLead) {
        const createdLead = toWebsiteEnquiry(client);
        createdLead.linkedTouristId = touristProfile.id;
        if (linkedBookingId) {
          createdLead.linkedBookingId = linkedBookingId;
        }
        newEnquiries.push(createdLead);
      }

      // 4. Ticketing Client (Deduplicate by email or full name)
      const existingClient = (persistedClients || []).find(
        (c) =>
          (normEmail && (c.email || '').trim().toLowerCase() === normEmail) ||
          (normName && (c.fullName || '').trim().toLowerCase() === normName)
      );
      if (!existingClient) {
        newTicketingClients.push(toTicketingClient(client));
      }
    });

    if (newTourists.length > 0) {
      setTourists((prev) => [...newTourists, ...prev]);
    }
    if (newEnquiries.length > 0) {
      setWebsiteEnquiries((prev) => [...newEnquiries, ...prev]);
    }
    if (newTicketingClients.length > 0) {
      setPersistedClients((prev) => [...newTicketingClients, ...prev]);
    }
    if (newBookings.length > 0) {
      setBookings((prev) => [...newBookings, ...prev]);
    }

    const alert: NotificationItem = {
      id: `notif-omni-${Date.now()}`,
      title: `Client Import & Assignment Completed`,
      message: `Categorized, assigned (Agent/Guide/Driver), and inserted ${extractedClients.length} client(s) from Email, Google Calendar & WhatsApp.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'client_alert',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  /**
   * Import Google Calendar events into both feedEvents and tour schedules
   */
  const handleImportGoogleCalendarEvents = (importedFeedEvents: FeedEvent[], importedSchedules: TourSchedule[]) => {
    if (importedFeedEvents.length > 0) {
      setFeedEvents((prev) => {
        const map = new Map((prev || []).map((e) => [e.id, e]));
        importedFeedEvents.forEach((item) => {
          map.set(item.id, item);
        });
        return Array.from(map.values());
      });
    }

    if (importedSchedules.length > 0) {
      setSchedules((prev) => {
        const map = new Map((prev || []).map((s) => [s.id, s]));
        importedSchedules.forEach((item) => {
          map.set(item.id, item);
        });
        return Array.from(map.values());
      });
    }

    const notif: NotificationItem = {
      id: `notif-gcal-${Date.now()}`,
      title: 'Google Calendar import',
      message: `Added ${importedFeedEvents.length} calendar event(s)${importedSchedules.length ? ` and ${importedSchedules.length} departure(s)` : ''} to the workspace.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'client_alert',
    };
    setNotifications((prev) => [notif, ...prev]);
  };

  /**
   * Turn a website enquiry into a tourist dossier. Only what the visitor
   * actually gave us is copied across — passport and travel details stay blank
   * for the desk to complete, so nothing is invented on their behalf.
   */
  const handleConvertEnquiry = (enquiry: WebsiteEnquiry) => {
    const tourist: TouristProfile = {
      id: `tour-${Date.now()}`,
      fullName: enquiry.fullName,
      email: enquiry.email,
      phone: enquiry.phone || '',
      passportNumber: '',
      passportExpiry: '',
      nationality: enquiry.country || '',
      dateOfBirth: '',
      gender: 'Male',
      dietaryRequirements: '',
      medicalNotes: '',
      emergencyContact: { name: '', relation: '', phone: '' },
      travelHistoryCount: 0,
      status: 'Inquiry',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      notes: [
        `Website enquiry ${enquiry.id} received ${new Date(enquiry.receivedAt).toLocaleDateString()}.`,
        enquiry.tourTitle ? `Interested in: ${enquiry.tourTitle}.` : '',
        enquiry.preferredDate ? `Preferred travel date: ${enquiry.preferredDate}.` : '',
        enquiry.partySize ? `Party size: ${enquiry.partySize}.` : '',
        enquiry.message,
      ]
        .filter(Boolean)
        .join(' '),
      preferredLanguage: 'English',
    };
    handleAddTourist(tourist);
    // Marking the lead as converted changes a stored entry, so it only happens
    // for the administrator; for everyone else the dossier is still created and
    // the lead stays where it is.
    if (canEditRecords) {
      handleUpdateEnquiry({ ...enquiry, status: 'Converted', handledAt: new Date().toISOString() });
    }
  };

  const handleGenerateVoAForTourist = (tourist: TouristProfile) => {
    setPreselectedTourist(tourist);
    setActiveTab('documents');
  };

  const handleIssueTicketForTourist = (tourist: TouristProfile) => {
    setPreselectedTourist(tourist);
    setIsIssueTicketOpen(true);
  };

  const handleUpsertAutomationTourist = (tourist: TouristProfile) => {
    const normEmail = (tourist.email || '').trim().toLowerCase();
    const normName = (tourist.fullName || '').trim().toLowerCase();
    setTourists((prev) => {
      const idx = prev.findIndex(
        (t) =>
          t.id === tourist.id ||
          (normEmail && (t.email || '').trim().toLowerCase() === normEmail) ||
          (normName && (t.fullName || '').trim().toLowerCase() === normName)
      );
      if (idx >= 0) {
        return prev.map((t, i) =>
          i === idx
            ? {
                ...t,
                ...tourist,
                id: t.id,
                passportNumber:
                  tourist.passportNumber && tourist.passportNumber !== 'PENDING'
                    ? tourist.passportNumber
                    : t.passportNumber,
              }
            : t
        );
      }
      return [tourist, ...prev];
    });
  };

  // Handlers for VoA & Permits
  const handleSaveVoADoc = (doc: VisaOnArrivalDoc) => {
    setVisaDocs((prev) => {
      const exists = prev.some((d) => d.id === doc.id);
      return exists ? prev.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...prev];
    });
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `VoA Sponsorship Letter Drafted`,
      message: `Official consular letter for ${doc.touristName} (${doc.docNumber}) ready for dispatch.`,
      timestamp: 'Just now',
      read: false,
      priority: 'urgent',
      type: 'voa_status',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleSavePermitDoc = (permit: RegionalPermitDoc) => {
    setPermits((prev) => {
      const exists = prev.some((p) => p.id === permit.id);
      return exists ? prev.map((p) => (p.id === permit.id ? permit : p)) : [permit, ...prev];
    });
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Ministry of Tourism Permit Issued`,
      message: `Zoba Travel Clearance #${permit.permitNumber} generated for ${permit.zoneName.slice(0, 30)}...`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleApproveVoADoc = (docId: string) => {
    setVisaDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, issuanceStatus: 'Approved' } : d))
    );
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `VoA Letter Approved by Consular Desk`,
      message: `Immigration stamp generated and synchronized with Asmara Airport Port of Entry.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'voa_status',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  // Handlers for Tickets
  const handleIssueTicket = (newTicket: Ticket) => {
    setTickets((prev) => [newTicket, ...prev]);
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Expedition Pass Issued`,
      message: `Pass #${newTicket.ticketNumber} for ${newTicket.touristName} issued with security QR code.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);

    // Every dollar collected at issue time becomes a real ledger entry, not
    // just a number on the ticket -- that's the ticketing desk's own
    // accounting trail rather than a manual finance entry.
    if (newTicket.amountPaid && newTicket.amountPaid > 0) {
      const txn: FinancialTransaction = {
        id: `txn-tkt-${Date.now()}`,
        date: newTicket.paymentDate || newTicket.bookingDate || new Date().toISOString().split('T')[0],
        referenceCode: `TXN-TKT-${(newTicket.pnr || newTicket.ticketNumber || '').slice(-6)}`,
        category: 'Flight Tickets',
        type: 'Income',
        description: `Ticket payment: ${newTicket.airline || 'Flight'} ${newTicket.route || ''} for ${newTicket.touristName}`,
        amountUSD: newTicket.amountPaid,
        amountNFA: newTicket.amountPaid * 15,
        payerOrPayee: newTicket.touristName,
        paymentMethod: newTicket.creditCardRef ? 'Credit Card' : 'Cash (USD)',
        status: 'Completed',
        linkedEntityId: newTicket.id,
        linkedEntityType: 'ticket',
        recordedBy: newTicket.agent || 'Ticketing Desk',
      };
      setFinancialTransactions((prev) => [txn, ...prev]);
    }
  };

  const handleUpdateTicket = (updatedTicket: Ticket) => {
    setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Ticket Updated: ${updatedTicket.touristName}`,
      message: `Ticket record #${updatedTicket.ticketNumber || updatedTicket.pnr} was updated successfully.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  const handleUpdateTicketStatus = (ticketId: string, status: Ticket['status']) => {
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status } : t)));
  };

  const handleRecordTicketPayment = (
    ticketId: string,
    amountCollected: number,
    newPaymentStatus: Ticket['paymentStatus']
  ) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? { ...t, amountPaid: (t.amountPaid || 0) + amountCollected, paymentStatus: newPaymentStatus }
          : t
      )
    );

    const txn: FinancialTransaction = {
      id: `txn-tkt-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      referenceCode: `TXN-TKT-${(ticket.pnr || ticket.ticketNumber || '').slice(-6)}-${Date.now().toString().slice(-4)}`,
      category: 'Flight Tickets',
      type: 'Income',
      description: `Ticket payment: ${ticket.airline || 'Flight'} ${ticket.route || ''} for ${ticket.touristName}`,
      amountUSD: amountCollected,
      amountNFA: amountCollected * 15,
      payerOrPayee: ticket.touristName,
      paymentMethod: 'Cash (USD)',
      status: 'Completed',
      linkedEntityId: ticket.id,
      linkedEntityType: 'ticket',
      recordedBy: user.fullName || 'Finance Desk',
    };
    setFinancialTransactions((prev) => [txn, ...prev]);

    const alert: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Payment Recorded: ${ticket.touristName}`,
      message: `$${amountCollected.toLocaleString()} collected for PNR ${ticket.pnr || ticket.bookingRef} — now ${newPaymentStatus}.`,
      timestamp: 'Just now',
      read: false,
      priority: 'normal',
      type: 'permit_issued',
    };
    setNotifications((prev) => [alert, ...prev]);
  };

  // Handlers for the receipt store
  const handleAddReceipt = (receipt: ExpenseReceipt, autoCreateTransaction = false) => {
    setReceipts((prev) => [receipt, ...prev]);
    if (autoCreateTransaction) {
      const txn: FinancialTransaction = {
        id: `txn-rcpt-${Date.now()}`,
        date: receipt.date,
        referenceCode: `TXN-${receipt.receiptNumber}`,
        category: 'Miscellaneous',
        type: 'Expense',
        description: `${receipt.vendorName} — ${receipt.description}`,
        amountUSD: receipt.amountUSD,
        amountNFA: receipt.amountNFA,
        payerOrPayee: receipt.vendorName,
        paymentMethod: receipt.paymentMethod || 'Cash (USD)',
        status: 'Completed',
        receiptNumber: receipt.receiptNumber,
        receiptId: receipt.id,
        recordedBy: user.fullName,
      };
      setFinancialTransactions((prev) => [txn, ...prev]);
    }
  };

  const handleUpdateReceiptStatus = (
    receiptId: string,
    status: ReceiptVerificationStatus,
    notes?: string,
    verifiedBy?: string,
  ) => {
    setReceipts((prev) =>
      prev.map((r) =>
        r.id === receiptId
          ? {
              ...r,
              verificationStatus: status,
              verificationNotes: notes ?? r.verificationNotes,
              verifiedBy: verifiedBy || user.fullName,
              verifiedAt: new Date().toISOString(),
            }
          : r,
      ),
    );
  };

  const handleLinkReceiptToTransaction = (receiptId: string, transactionId: string) => {
    const transaction = financialTransactions.find((t) => t.id === transactionId);
    setReceipts((prev) =>
      prev.map((r) =>
        r.id === receiptId
          ? {
              ...r,
              linkedTransactionId: transactionId,
              linkedTransactionRef: transaction?.referenceCode,
              verificationStatus: r.verificationStatus === 'Unmatched' ? 'Pending Review' : r.verificationStatus,
            }
          : r,
      ),
    );
    setFinancialTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? { ...t, receiptId } : t)),
    );
  };

  const handleSignOut = async () => {
    await api.post('auth/logout').catch(() => undefined);
    setAuthToken(null);
    window.location.reload();
  };

  // Which module each screen belongs to, so a role never lands on a tab it
  // cannot open (by deep link, or after its permissions change).
  const TAB_MODULE: Record<string, Parameters<typeof canView>[1]> = {
    dashboard: 'dashboard', packages: 'packages', hotels: 'hotels', transport: 'transport',
    hr: 'hr', tours: 'tours', tourists: 'tourists', documents: 'documents', tickets: 'tickets',
    messages: 'messages', finance: 'finance', audit: 'audit', accounts: 'accounts',
    admin: 'admin',
  };

  const allowedTabs = useMemo(() => {
    return Object.keys(TAB_MODULE).filter((tab) => canView(role, TAB_MODULE[tab])) as ActiveTab[];
  }, [role, rolesVersion]);

  const effectiveTab: ActiveTab = allowedTabs.includes(activeTab) ? activeTab : (allowedTabs[0] ?? 'dashboard');

  // Control exceptions drive the badge on the Audit tab.
  const redFlagCount = useMemo(() => {
    if (!canView(role, 'audit')) return 0;
    return detectRedFlags({ tickets, bookings, transactions: financialTransactions, receipts, auditEntries: [] })
      .length;
  }, [role, tickets, bookings, financialTransactions, receipts]);

  // Notification Drawer Helpers
  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div id="app-container" className="flex h-screen bg-[#FBF8F5] text-slate-900 overflow-hidden font-sans antialiased">
      {/* Navigation Sidebar */}
      <Sidebar
        activeTab={effectiveTab}
        setActiveTab={setActiveTab}
        urgentAlertCount={urgentAlertCount}
        role={role}
        redFlagCount={redFlagCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          notifications={notifications}
          urgentAlertCount={urgentAlertCount}
          onOpenNotifications={() => setIsNotificationOpen(true)}
          onOpenQuickAction={() => setIsQuickActionOpen(true)}
          user={{ fullName: user.fullName, username: user.username, role }}
          saveStatus={saveStatus}
          onSignOut={handleSignOut}
          onManageSampleData={role === 'CEO' ? () => setIsSampleDataOpen(true) : undefined}
          onOpenAdmin={role === 'CEO' ? () => setActiveTab('admin') : undefined}
          lastSuccessfulFeedTime={lastSuccessfulFeedTime}
          activeTabTitle={
            effectiveTab === 'audit'
              ? 'Audit & Operational Controls'
              : effectiveTab === 'accounts'
              ? 'Staff Accounts & Access'
              : effectiveTab === 'admin'
              ? 'Admin Control Centre'
              : activeTab === 'dashboard'
              ? 'Dashboard & Operations Core'
              : activeTab === 'packages'
              ? 'Tour Operations'
              : activeTab === 'hotels'
              ? 'Hotels, Lodging & Management Letters'
              : activeTab === 'transport'
              ? 'Transport & Fleet Depot'
              : activeTab === 'hr'
              ? 'Staff, HR & Guide Roster'
              : activeTab === 'tours'
              ? 'Tour Schedules & Convoy Departures'
              : activeTab === 'tourists'
              ? 'Tourist Profiles & Dossiers'
              : activeTab === 'documents'
              ? 'Visa on Arrival & Regional Permits'
              : activeTab === 'tickets'
              ? 'Digital Boarding Passes & Tickets'
              : activeTab === 'messages'
              ? 'Messaging & Field Dispatch'
              : 'Financial Operations & General Ledger'
          }
          onNavigate={(tab) => setActiveTab(tab)}
        />

        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8 lg:pb-28 bg-[#FBF8F5]">
          {lastError && (
            <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-rose-900">That change was not saved</div>
                <p className="mt-0.5 text-sm text-rose-700">{lastError}</p>
              </div>
              <button
                onClick={dismissError}
                className="shrink-0 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/*
            Everyone can add new work; only the administrator can change or
            remove something already saved. Saying so once, plainly, at the top
            of the screen is kinder than letting someone fill in a form and
            discover the refusal at the end.
          */}
          {!canEditRecords && effectiveTab !== 'dashboard' && effectiveTab !== 'messages' && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-lagoon-200 bg-lagoon-50 px-5 py-3.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lagoon-600" />
              <p className="text-sm leading-relaxed text-lagoon-950">
                <span className="font-semibold">You can add new records here.</span> {ADMIN_ONLY_EDIT_MESSAGE}
              </p>
            </div>
          )}

          <ErrorBoundary label={effectiveTab} resetKey={effectiveTab}>
          {effectiveTab === 'dashboard' && (
            <DashboardView
              employees={employees}
              schedules={schedules}
              tourists={allTouristsAndClients}
              bookings={bookings}
              tickets={tickets}
              reservations={reservations}
              hotelLetters={hotelLetters}
              hotels={hotels}
              vehicles={vehicles}
              visaDocs={visaDocs}
              permits={permits}
              packages={packages}
              feedEvents={feedEvents}
              feedTravelers={feedTravelers}
              feedConversations={feedConversations}
              feedDrafts={feedDrafts}
              feedTasks={feedTasks}
              feedConflicts={feedConflicts}
              lastSuccessfulFeedTime={lastSuccessfulFeedTime}
              isAdminUser={role === 'CEO' || canView(role, 'admin')}
              onNavigate={(tab) => setActiveTab(tab)}
              onSelectSchedule={() => setActiveTab('tours')}
              onImportGoogleCalendar={handleImportGoogleCalendarEvents}
              onBatchInsertOmnichannelClients={handleBatchInsertOmnichannelClients}
              onSaveTourist={handleUpsertAutomationTourist}
              onAddReservation={handleAddHotelReservation}
              onSaveHotelLetter={handleSaveHotelLetter}
              onSaveVoADoc={handleSaveVoADoc}
              onSavePermitDoc={handleSavePermitDoc}
              onNotify={(title, message, linkTab) => {
                setNotifications((prev) => [
                  {
                    id: `notif-auto-${Date.now()}`,
                    title,
                    message,
                    timestamp: 'Just now',
                    read: false,
                    priority: 'normal',
                    type: 'permit_issued',
                    linkTab,
                  },
                  ...prev,
                ]);
              }}
            />
          )}

          {effectiveTab === 'packages' && canPrepareTrip(role) && <TripPreparationDesk hotels={hotels} clients={[...tourists,...persistedClients]} vehicles={vehicles} onFiled={reloadWorkspace}/> }
          {effectiveTab === 'packages' && (
            <TourPackagesView
              packages={packages}
              activities={activities}
              tourists={tourists}
              hotels={hotels}
              employees={employees}
              vehicles={vehicles}
              tourBookings={tourBookings}
              expeditions={expeditions}
              transactions={financialTransactions}
              canEdit={canWrite(role, 'packages') || canEditRecords}
              onSaveExpedition={handleSaveExpedition}
              onDeleteExpedition={handleDeleteExpedition}
              onPostTourCostToLedger={handlePostTourCostToLedger}
              onAddPackage={handleAddPackage}
              onUpdatePackage={handleUpdatePackage}
              onSaveItinerary={handleSavePackageItinerary}
              onAddActivity={handleAddActivity}
              onReserveHotelForPackage={handleReserveHotelForPackage}
              onScheduleDeparture={() => {
                setIsScheduleDepartureOpen(true);
              }}
              onAddTourBooking={handleAddTourBooking}
            />
          )}

          {effectiveTab === 'hotels' && (
            <HotelManagementView
              hotels={hotels}
              reservations={reservations}
              tourists={tourists}
              packages={packages}
              schedules={schedules}
              hotelLetters={hotelLetters}
              canEdit={canWrite(role, 'hotels') || canEditRecords}
              onAddReservation={handleAddHotelReservation}
              onUpdateReservation={handleUpdateHotelReservation}
              onPostCommissionToLedger={handlePostCommissionToLedger}
              onAddHotel={handleAddHotel}
              onUpdateHotel={handleUpdateHotel}
              onSaveHotelLetter={handleSaveHotelLetter}
              onSendToHotelMessage={handleSendToHotelMessage}
              onGenerateVoA={handleGenerateVoAForTourist}
              onGeneratePermit={() => setActiveTab('documents')}
            />
          )}

          {effectiveTab === 'transport' && (
            <TransportManagementView
              vehicles={vehicles}
              rentalLetters={rentalLetters}
              outwardRentals={outwardRentals}
              schedules={schedules}
              tourBookings={tourBookings}
              expeditions={expeditions}
              employees={employees}
              canEdit={canWrite(role, 'transport') || canEditRecords}
              onAddVehicle={handleAddVehicle}
              onUpdateVehicle={handleUpdateVehicle}
              onUpdateVehicleStatus={handleUpdateVehicleStatus}
              onSaveRentalLetter={handleSaveRentalLetter}
              onSaveOutwardRental={handleSaveOutwardRental}
              onPostOutwardRentalToLedger={handlePostOutwardRentalToLedger}
              onAddFinancialTransaction={handleAddFinancialTransaction}
            />
          )}

          {effectiveTab === 'hr' && (
            <StaffManagementView
              employees={employees}
              departments={departments}
              schedules={schedules}
              isAdminUser={role === 'CEO' || canView(role, 'admin')}
              onAddEmployee={handleAddEmployee}
              onUpdateEmployee={(canWrite(role, 'hr') || canEditRecords) ? handleUpdateEmployee : undefined}
              onDeleteEmployee={(canWrite(role, 'hr') || canEditRecords) ? handleDeleteEmployee : undefined}
              onUpdateEmployeeStatus={
                (canWrite(role, 'hr') || canEditRecords)
                  ? (empId: string, status: StaffStatus) => {
                      setEmployees((prev) =>
                        prev.map((e) => (e.id === empId ? { ...e, status } : e))
                      );
                    }
                  : undefined
              }
            />
          )}

          {effectiveTab === 'tours' && (
            <TourCalendarView
              schedules={schedules}
              packages={packages}
              employees={employees}
              canEdit={canWrite(role, 'tours') || canEditRecords}
              onAddSchedule={handleAddSchedule}
              onUpdateScheduleGuide={handleUpdateScheduleGuide}
              onSavePackageItinerary={handleSavePackageItinerary}
              onOpenGoogleCalendarImport={() => setIsGoogleCalendarModalOpen(true)}
            />
          )}

          {effectiveTab === 'tourists' && (
            <TouristDirectoryView
              tourists={tourists}
              bookings={bookings}
              tourBookings={tourBookings}
              reservations={reservations}
              schedules={schedules}
              packages={packages}
              activities={touristActivities}
              conversations={standardConversations}
              calendarEvents={feedEvents}
              enquiries={websiteEnquiries}
              employees={employees}
              canEdit={canWrite(role, 'tourists') || canEditRecords}
              onUpdateEnquiry={handleUpdateEnquiry}
              onAddEnquiry={handleAddEnquiry}
              onConvertEnquiry={handleConvertEnquiry}
              onConvertBookedLeadToBooking={handleConvertBookedLeadToBooking}
              onAddTourist={handleAddTourist}
              onBatchInsertOmnichannelClients={handleBatchInsertOmnichannelClients}
              onGenerateVoA={handleGenerateVoAForTourist}
              onIssueTicket={handleIssueTicketForTourist}
              onReserveHotel={handleReserveHotelForTourist}
              onGeneratePermit={() => setActiveTab('documents')}
              onAddActivity={handleAddActivityForTourist}
            />
          )}

          {effectiveTab === 'documents' && (
            <VisaPermitGeneratorView
              tourists={allTouristsAndClients}
              packages={packages}
              schedules={schedules}
              vehicles={vehicles}
              employees={employees}
              reservations={reservations}
              hotels={hotels}
              visaDocs={visaDocs}
              permits={permits}
              tickets={tickets}
              hotelLetters={hotelLetters}
              rentalLetters={rentalLetters}
              invoices={financialInvoices}
              receipts={receipts}
              bookings={bookings}
              tourBookings={tourBookings}
              initialSelectedTouristId={preselectedTourist?.id}
              onSaveVoADoc={handleSaveVoADoc}
              onSavePermitDoc={handleSavePermitDoc}
              onApproveVoADoc={(permissions.can.approveIssue || canWrite(role, 'documents') || canEditRecords) ? handleApproveVoADoc : undefined}
              onAddTourist={handleAddTourist}
              onNavigateToModule={(tab) => setActiveTab(tab as ActiveTab)}
            />
          )}

          {effectiveTab === 'tickets' && (
            <TicketManagementView
              tickets={tickets}
              tourists={allTouristsAndClients}
              schedules={schedules}
              clients={ticketingClients}
              conversations={standardConversations}
              calendarEvents={feedEvents}
              employees={employees}
              packages={packages}
              canEdit={canWrite(role, 'tickets') || canEditRecords}
              canRecordPayment={permissions.can.recordPayment || role === 'AGENT'}
              onIssueTicket={handleIssueTicket}
              onUpdateTicket={handleUpdateTicket}
              onUpdateTicketStatus={handleUpdateTicketStatus}
              onRecordPayment={handleRecordTicketPayment}
              onAddClient={handleAddTicketingClient}
              onBatchInsertOmnichannelClients={handleBatchInsertOmnichannelClients}
              onUpdateClient={handleUpdateTicketingClient}
              onDeleteClient={handleDeleteTicketingClient}
            />
          )}

          {effectiveTab === 'messages' && (
            <AccountMessagesView currentUserId={user.id} tickets={tickets} dispatch={<MessagesView
              channels={channels}
              messages={messages}
              hotelLetters={hotelLetters}
              hotels={hotels}
              tourists={tourists}
              employees={employees}
              onSendMessage={handleSendMessage}
              onOpenNewLetterForHotel={(hotelId) => {
                const targetHotel = hotels.find((h) => h.id === hotelId);
                setActiveTab('hotels');
              }}
            />} />
          )}

          {effectiveTab === 'finance' && (
            <FinanceWorkspace
              transactions={financialTransactions}
              invoices={financialInvoices}
              receipts={receipts}
              tourists={tourists}
              packages={packages}
              hotels={hotels}
              tickets={tickets}
              employees={employees}
              schedules={schedules}
              bookings={bookings}
              tourBookings={tourBookings}
              expeditions={expeditions}
              outwardRentals={outwardRentals}
              reservations={reservations}
              canRecordPayment={permissions.can.recordPayment}
              canEdit={canWrite(role, 'finance') || canEditRecords}
              onAddTransaction={handleAddFinancialTransaction}
              onAddInvoice={handleAddFinancialInvoice}
              onAddReceipt={handleAddReceipt}
              onUpdateReceiptStatus={handleUpdateReceiptStatus}
              onLinkReceiptToTransaction={handleLinkReceiptToTransaction}
            />
          )}

          {effectiveTab === 'audit' && (
            <AuditControlView
              role={role}
              tickets={tickets}
              bookings={bookings}
              transactions={financialTransactions}
              receipts={receipts}
              tourists={tourists}
            />
          )}

          {effectiveTab === 'accounts' && <StaffAccountsView currentUserId={user.id} />}

          {effectiveTab === 'admin' && <AdminControlCentre onImportCalendar={() => setIsGoogleCalendarModalOpen(true)} />}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Notifications Drawer */}
      <NotificationsDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllRead={handleMarkAllRead}
      />

      {/* Quick Action Modal */}
      <QuickActionModal
        isOpen={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        setActiveTab={setActiveTab}
        onOpenAddEmployee={() => setIsAddEmployeeOpen(true)}
        onOpenScheduleDeparture={() => setIsScheduleDepartureOpen(true)}
        onOpenAddTourist={() => setIsAddTouristOpen(true)}
        onOpenIssueTicket={() => setIsIssueTicketOpen(true)}
        onOpenReserveHotel={() => {
          setPreselectedHotelTourist(null);
          setPreselectedHotelPackage(null);
          setIsReserveHotelOpen(true);
        }}
      />

      {/* Sample data controls (CEO only) */}
      <SampleDataModal isOpen={isSampleDataOpen} onClose={() => setIsSampleDataOpen(false)} />

      {/* Standalone Triggered Modals */}
      {isAddEmployeeOpen && (
        <AddEmployeeModal
          departments={departments}
          onClose={() => setIsAddEmployeeOpen(false)}
          onAddEmployee={handleAddEmployee}
        />
      )}

      {isScheduleDepartureOpen && (
        <NewDepartureModal
          packages={packages}
          employees={employees}
          onClose={() => setIsScheduleDepartureOpen(false)}
          onAddSchedule={handleAddSchedule}
        />
      )}

      {isAddTouristOpen && (
        <AddTouristModal
          onClose={() => setIsAddTouristOpen(false)}
          onAddTourist={handleAddTourist}
          isAdmin={role === 'CEO'}
          conversations={standardConversations}
          calendarEvents={feedEvents}
          employees={employees}
          packages={packages}
          onBatchInsertOmnichannelClients={handleBatchInsertOmnichannelClients}
        />
      )}

      {isIssueTicketOpen && (
        <IssueTicketModal
          tourists={allTouristsAndClients}
          schedules={schedules}
          preselectedTourist={preselectedTourist}
          onClose={() => {
            setIsIssueTicketOpen(false);
            setPreselectedTourist(null);
          }}
          onIssueTicket={handleIssueTicket}
        />
      )}

      {/* Hotel Reservation Modal */}
      {isReserveHotelOpen && (
        <HotelReservationModal
          hotels={hotels}
          tourists={allTouristsAndClients}
          packages={packages}
          schedules={schedules}
          initialTourist={preselectedHotelTourist}
          initialPackage={preselectedHotelPackage}
          onClose={() => {
            setIsReserveHotelOpen(false);
            setPreselectedHotelTourist(null);
            setPreselectedHotelPackage(null);
          }}
          onSaveReservation={handleAddHotelReservation}
        />
      )}

      {/* Add Traveler Activity Modal */}
      {isAddActivityOpen && (
        <AddTouristActivityModal
          tourists={allTouristsAndClients}
          schedules={schedules}
          packages={packages}
          reservations={reservations}
          visaDocs={visaDocs}
          permits={permits}
          vehicles={vehicles}
          employees={employees}
          initialTourist={preselectedActivityTourist}
          onClose={() => {
            setIsAddActivityOpen(false);
            setPreselectedActivityTourist(null);
          }}
          onSave={handleSaveTouristActivity}
        />
      )}

      {/* Google Calendar Import Modal */}
      <GoogleCalendarImportModal
        isOpen={isGoogleCalendarModalOpen}
        onClose={() => setIsGoogleCalendarModalOpen(false)}
        onImportCompleted={handleImportGoogleCalendarEvents}
      />
    </div>
  );
}

