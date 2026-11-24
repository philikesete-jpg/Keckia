/**
 * Role and permission model, shared by the browser and the API.
 *
 * The front end uses it to decide what to render; the API uses the same table
 * to decide what to accept, so hiding a button is never the only thing
 * standing between a user and an action they may not perform.
 */

export type ModuleKey =
  | "dashboard"
  | "packages"
  | "hotels"
  | "transport"
  | "hr"
  | "tours"
  | "tourists"
  | "documents"
  | "tickets"
  | "messages"
  | "finance"
  | "audit"
  | "accounts"
  /** The Admin Control Centre: system settings, import, backup and clear-data. */
  | "admin";

export type RoleKey =
  | "CEO"
  | "OPERATIONS"
  | "FINANCE"
  | "ACCOUNTANT"
  | "AGENT"
  | "TOUR_OPS"
  | "HR"
  | "GUIDE"
  | "DRIVER"
  | "DRIVER_GUIDE"
  | "TICKETING"
  | "HOTEL_RESERVATIONS"
  | "STAFF_PENDING";

export interface RoleDefinition {
  label: string;
  description: string;
  /** Modules the role can open. */
  view: ModuleKey[];
  /** Modules the role can create, edit or delete inside. */
  write: ModuleKey[];
  /** Restricts the role to rows it created, in the collections listed below. */
  ownRecordsOnly?: boolean;
  /** Separation-of-duty capabilities, mirrored from the ticket control rules. */
  can: {
    issueTicket: boolean;
    recordPayment: boolean;
    approveIssue: boolean;
    manageAccounts: boolean;
    viewAllBookings: boolean;
    exportReports: boolean;
  };
}

export const DEFAULT_ROLES: Record<RoleKey, RoleDefinition> = {
  CEO: {
    label: "CEO / Administrator",
    description: "Full access to every module, plus staff accounts and the audit trail.",
    view: [
      "dashboard", "packages", "hotels", "transport", "hr", "tours", "tourists",
      "documents", "tickets", "messages", "finance", "audit", "accounts", "admin",
    ],
    write: [
      "packages", "hotels", "transport", "hr", "tours", "tourists",
      "documents", "tickets", "messages", "finance", "accounts", "admin",
    ],
    can: {
      issueTicket: true, recordPayment: true, approveIssue: true,
      manageAccounts: true, viewAllBookings: true, exportReports: true,
    },
  },
  OPERATIONS: {
    label: "Operations Manager",
    description: "Runs day-to-day operations: tours, packages, hotels, fleet, tourists and documents.",
    view: [
      "dashboard", "packages", "hotels", "transport", "tours", "tourists",
      "documents", "tickets", "messages", "audit",
    ],
    write: ["packages", "hotels", "transport", "tours", "tourists", "documents", "tickets", "messages"],
    can: {
      issueTicket: true, recordPayment: false, approveIssue: false,
      manageAccounts: false, viewAllBookings: true, exportReports: true,
    },
  },
  FINANCE: {
    label: "Finance Manager",
    description: "Approves ticket issuance, records payments, owns the ledger and reports.",
    view: ["dashboard", "tickets", "finance", "hotels", "tourists", "audit", "messages"],
    write: ["finance", "tickets", "messages"],
    can: {
      issueTicket: true, recordPayment: true, approveIssue: true,
      manageAccounts: false, viewAllBookings: true, exportReports: true,
    },
  },
  ACCOUNTANT: {
    label: "Accountant",
    description: "Records payments and keeps the books, but cannot issue or approve tickets.",
    view: ["dashboard", "tickets", "finance", "audit"],
    write: ["finance"],
    can: {
      issueTicket: false, recordPayment: true, approveIssue: false,
      manageAccounts: false, viewAllBookings: true, exportReports: true,
    },
  },
  AGENT: {
    label: "Sales Agent",
    description: "Creates bookings, issues flight tickets, checks, edits & records payments, manages clients, and sees only their own sales.",
    view: ["dashboard", "tickets", "tourists", "packages", "hotels", "messages", "finance"],
    write: ["tickets", "tourists", "messages", "finance"],
    ownRecordsOnly: true,
    can: {
      issueTicket: true, recordPayment: true, approveIssue: false,
      manageAccounts: false, viewAllBookings: false, exportReports: false,
    },
  },
  TOUR_OPS: {
    label: "Tour Operations",
    description: "Schedules departures, builds itineraries and assigns guides, drivers and vehicles.",
    view: ["dashboard", "tours", "packages", "transport", "tourists", "hotels", "messages"],
    write: ["tours", "packages", "transport", "messages"],
    can: {
      issueTicket: false, recordPayment: false, approveIssue: false,
      manageAccounts: false, viewAllBookings: true, exportReports: false,
    },
  },
  HR: {
    label: "Human Resources",
    description: "Owns staff records, onboarding, documents and leave.",
    view: ["dashboard", "hr", "messages", "audit"],
    write: ["hr", "messages"],
    can: {
      issueTicket: false, recordPayment: false, approveIssue: false,
      manageAccounts: false, viewAllBookings: false, exportReports: true,
    },
  },
  GUIDE: {
    label: "Tour Guide (Guide Only)",
    description: "Licensed exclusively for cultural & expedition guiding — sees assigned departures, itineraries and traveller manifests (not fleet driving).",
    view: ["dashboard", "tours", "tourists", "messages"],
    write: ["messages"],
    can: {
      issueTicket: false, recordPayment: false, approveIssue: false,
      manageAccounts: false, viewAllBookings: false, exportReports: false,
    },
  },
  DRIVER: {
    label: "Driver (Driver Only)",
    description: "Licensed exclusively for commercial 4WD/coach fleet driving — sees vehicle assignments, trip sheets and dispatch messages (not guiding).",
    view: ["dashboard", "transport", "messages"],
    write: ["messages"],
    can: {
      issueTicket: false, recordPayment: false, approveIssue: false,
      manageAccounts: false, viewAllBookings: false, exportReports: false,
    },
  },
  TICKETING: {
    label: "Ticketing Agent",
    description: "Creates passenger records and issues tickets from the ticketing desk.",
    view: ["dashboard", "tickets", "messages"],
    write: ["tickets", "messages"],
    ownRecordsOnly: true,
    can: { issueTicket: true, recordPayment: false, approveIssue: false, manageAccounts: false, viewAllBookings: false, exportReports: false },
  },
  HOTEL_RESERVATIONS: {
    label: "Hotel Reservations",
    description: "Handles lodging partners, room reservations, vouchers and guest arrangements.",
    view: ["dashboard", "hotels", "messages"],
    write: ["hotels", "messages"],
    can: { issueTicket: false, recordPayment: false, approveIssue: false, manageAccounts: false, viewAllBookings: false, exportReports: false },
  },
  STAFF_PENDING: {
    label: "Awaiting role assignment",
    description: "Reserved for inactive staff accounts until an administrator assigns a working role.",
    view: [], write: [],
    can: { issueTicket: false, recordPayment: false, approveIssue: false, manageAccounts: false, viewAllBookings: false, exportReports: false },
  },
  DRIVER_GUIDE: {
    label: "Driver & Guide (Dual Role)",
    description: "Dual-capacity certified expedition guide and licensed 4WD fleet driver — authorized to work as a Guide, a Driver, or both simultaneously.",
    view: ["dashboard", "tours", "transport", "tourists", "messages"],
    write: ["messages"],
    can: {
      issueTicket: false, recordPayment: false, approveIssue: false,
      manageAccounts: false, viewAllBookings: true, exportReports: false,
    },
  },
};

export const ROLES: Record<string, RoleDefinition> = {
  ...DEFAULT_ROLES,
};

export const ROLE_KEYS = Object.keys(DEFAULT_ROLES) as RoleKey[];

export interface EditableRole {
  key: string;
  label: string;
  description: string;
  view: ModuleKey[];
  write: ModuleKey[];
  ownRecordsOnly?: boolean;
  can: {
    issueTicket: boolean;
    recordPayment: boolean;
    approveIssue: boolean;
    manageAccounts: boolean;
    viewAllBookings: boolean;
    exportReports: boolean;
  };
  assignedUsers?: string[];
}

const STORAGE_KEY = 'eritreavisit_custom_roles';

export function loadSavedCustomRoles(): EditableRole[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    console.error('Failed to load custom roles from storage', e);
  }
  return [];
}

export function syncSavedRolesToMemory(customRoles?: EditableRole[]): void {
  const rolesToApply = customRoles || loadSavedCustomRoles();
  if (!rolesToApply || rolesToApply.length === 0) return;

  rolesToApply.forEach((r) => {
    if (!r || !r.key) return;
    ROLES[r.key] = {
      label: r.label || r.key,
      description: r.description || '',
      view: Array.isArray(r.view) ? r.view : [],
      write: Array.isArray(r.write) ? r.write : [],
      ownRecordsOnly: Boolean(r.ownRecordsOnly),
      can: {
        issueTicket: Boolean(r.can?.issueTicket),
        recordPayment: Boolean(r.can?.recordPayment),
        approveIssue: Boolean(r.can?.approveIssue),
        manageAccounts: Boolean(r.can?.manageAccounts),
        viewAllBookings: Boolean(r.can?.viewAllBookings),
        exportReports: Boolean(r.can?.exportReports),
      },
    };
    if (!ROLE_KEYS.includes(r.key as RoleKey)) {
      ROLE_KEYS.push(r.key as RoleKey);
    }
  });
}

// Initial hydration in browser environment
if (typeof window !== 'undefined') {
  syncSavedRolesToMemory();
}

export function saveCustomRole(role: EditableRole): void {
  if (!role || !role.key) return;

  ROLES[role.key] = {
    label: role.label || role.key,
    description: role.description || '',
    view: Array.isArray(role.view) ? role.view : [],
    write: Array.isArray(role.write) ? role.write : [],
    ownRecordsOnly: Boolean(role.ownRecordsOnly),
    can: {
      issueTicket: Boolean(role.can?.issueTicket),
      recordPayment: Boolean(role.can?.recordPayment),
      approveIssue: Boolean(role.can?.approveIssue),
      manageAccounts: Boolean(role.can?.manageAccounts),
      viewAllBookings: Boolean(role.can?.viewAllBookings),
      exportReports: Boolean(role.can?.exportReports),
    },
  };

  if (!ROLE_KEYS.includes(role.key as RoleKey)) {
    ROLE_KEYS.push(role.key as RoleKey);
  }

  if (typeof window !== 'undefined') {
    try {
      const existing = loadSavedCustomRoles();
      const idx = existing.findIndex((r) => r.key === role.key);
      let updated: EditableRole[];
      if (idx >= 0) {
        updated = [...existing];
        updated[idx] = role;
      } else {
        updated = [...existing, role];
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('roles_updated', { detail: role }));
    } catch (e) {
      console.error('Failed to persist custom role', e);
    }
  }
}

export function resetRolesToDefault(): void {
  // Clear overrides
  Object.keys(ROLES).forEach((k) => {
    delete ROLES[k];
  });
  Object.assign(ROLES, DEFAULT_ROLES);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('roles_updated', { detail: null }));
    } catch (e) {
      console.error('Failed to clear custom roles', e);
    }
  }
}

/**
 * Which module governs each stored collection. A role that cannot write to the
 * module cannot write to any of its collections, whatever the UI tries to send.
 */
export const COLLECTION_MODULE: Record<string, ModuleKey> = {
  departments: "hr",
  employees: "hr",
  packages: "packages",
  activities: "packages",
  tourBookings: "packages",
  expeditions: "packages",
  schedules: "tours",
  itineraries: "tours",
  tourists: "tourists",
  bookings: "tourists",
  // A traveler's own added itinerary entries — lives under the same module
  // as the profile it belongs to.
  touristActivities: "tourists",
  // Enquiries posted by the public website's contact form. They arrive through
  // the unauthenticated /api/public/enquiry route and are worked like any other
  // sales lead, so they sit under the tourists module.
  websiteEnquiries: "tourists",
  tickets: "tickets",
  ticketingClients: "tickets",
  hotels: "hotels",
  reservations: "hotels",
  hotelLetters: "hotels",
  vehicles: "transport",
  rentalLetters: "transport",
  visaDocs: "documents",
  permits: "documents",
  channels: "messages",
  messages: "messages",
  financialTransactions: "finance",
  financialInvoices: "finance",
  receipts: "finance",
  // Notifications and settings are shared infrastructure: everyone signed in
  // may read them, and writing is limited to the signed-in user's own feed.
  notifications: "dashboard",
  settings: "dashboard",
  // Shared calendar feed, color settings, and daily operational reviews
  feedEvents: "dashboard",
  feedTravelers: "tourists",
  feedConversations: "admin",
  feedDrafts: "admin",
  feedConflicts: "dashboard",
  feedTasks: "dashboard",
  feedSources: "admin",
  dailyFeeds: "admin",
  calendarColorSettings: "dashboard",
  // Outward vehicle rentals ("Rent Out" for company-owned vehicles) and payroll run snapshots
  vehicleOutwardRentals: "transport",
  payrollRuns: "finance",
  // The single row holding every system-wide option list, default and rule.
  // Everyone signed in reads it — it fills the drop-downs on every screen —
  // but only the administrator may change it. See CONFIG_COLLECTIONS below.
  systemSettings: "admin",
};

export const COLLECTIONS = Object.keys(COLLECTION_MODULE);

/**
 * Configuration, not data. Any signed-in user may read these (a drop-down on
 * the ticket screen is filled from them), but only the administrator may write
 * them, whatever module permissions the role otherwise has.
 */
export const CONFIG_COLLECTIONS = ["systemSettings"];

export function isConfigCollection(collection: string): boolean {
  return CONFIG_COLLECTIONS.includes(collection);
}

/** Collections an agent-scoped role only sees their own rows in. */
export const OWNED_COLLECTIONS = ["tickets", "bookings", "tourists"];

/**
 * The administrator role.
 *
 * Creating a record stays with whichever roles do that work, but changing or
 * deleting something already stored belongs to the administrator alone. Once an
 * entry is saved it is a fact the rest of the agency relies on, so amending or
 * removing it has one accountable owner rather than everyone who could type it
 * in the first place.
 */
export const ADMIN_ROLE: RoleKey = "CEO";

export function isAdmin(role: RoleKey): boolean {
  return role === ADMIN_ROLE;
}

/**
 * Collections that are not data entries and so sit outside the rule above: a
 * signed-in user's own notification feed and preferences, and the message
 * thread headers the app rewrites by itself whenever anyone posts. Locking
 * these would stop staff dismissing an alert or sending a message without
 * protecting any real record.
 */
export const SYSTEM_COLLECTIONS = ["notifications", "settings", "channels"];

export function isSystemCollection(collection: string): boolean {
  return SYSTEM_COLLECTIONS.includes(collection);
}

/** Whether `role` may change a record already stored in `collection`. */
export function canEditRecord(role: RoleKey | string, collection: string): boolean {
  if (role === "STAFF_PENDING") return false;
  if (isAdmin(role as RoleKey)) return true;
  if (isSystemCollection(collection)) return true;
  return false;
}

/** Whether `role` may delete a record already stored in `collection`. */
export function canDeleteRecord(role: RoleKey | string, collection: string): boolean {
  if (role === "STAFF_PENDING") return false;
  if (isAdmin(role as RoleKey)) return true;
  if (isSystemCollection(collection)) return true;
  return false;
}

/** Shown wherever an edit or a deletion is refused, so the reason is the same everywhere. */
export const ADMIN_ONLY_EDIT_MESSAGE =
  "Editing or deleting this record is not permitted for your role.";

export function isRoleKey(value: string): value is RoleKey {
  return Object.prototype.hasOwnProperty.call(ROLES, value);
}

export function getRoleDefinition(role?: string | null): RoleDefinition {
  if (!role) return ROLES.CEO || DEFAULT_ROLES.CEO;
  if (ROLES[role]) return ROLES[role];
  return {
    label: role,
    description: 'Custom Operational Role',
    view: ['dashboard', 'messages'],
    write: ['messages'],
    can: {
      issueTicket: false,
      recordPayment: false,
      approveIssue: false,
      manageAccounts: false,
      viewAllBookings: false,
      exportReports: false,
    },
  };
}

export function canView(role: RoleKey | string, moduleKey: ModuleKey): boolean {
  if (!role) return false;
  const def = ROLES[role] || getRoleDefinition(role);
  return def?.view?.includes(moduleKey) ?? false;
}

export function canWrite(role: RoleKey | string, moduleKey: ModuleKey): boolean {
  if (!role) return false;
  const def = ROLES[role] || getRoleDefinition(role);
  return def?.write?.includes(moduleKey) ?? false;
}

export function canReadCollection(role: RoleKey | string, collection: string): boolean {
  if (role === "STAFF_PENDING") return false;
  const moduleKey = COLLECTION_MODULE[collection];
  if (!moduleKey) return false;
  // System settings fill drop-downs everywhere, so everyone signed in reads them.
  if (isConfigCollection(collection)) return true;
  // Everyone signed in can read the shared dashboard collections.
  if (moduleKey === "dashboard") return true;
  return canView(role, moduleKey);
}

export function canWriteCollection(role: RoleKey | string, collection: string): boolean {
  if (role === "STAFF_PENDING") return false;
  const moduleKey = COLLECTION_MODULE[collection];
  if (!moduleKey) return false;
  // Changing how the system behaves is the administrator's alone.
  if (isConfigCollection(collection)) return isAdmin(role as RoleKey) || canWrite(role, "admin");
  if (moduleKey === "dashboard") return true;
  return canWrite(role, moduleKey);
}
