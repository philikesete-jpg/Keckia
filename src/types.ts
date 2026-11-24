export type StaffRole = 'Admin' | 'Tour Guide' | 'Driver' | 'Driver & Guide' | 'Agent' | 'HR' | 'Logistics Lead' | 'Operations Manager' | 'Accountant' | 'CEO';
export type StaffStatus = 'Active' | 'On Leave' | 'On Tour' | 'Probation';
export type SalaryTier = 'Tier 1 - Senior Lead' | 'Tier 2 - Specialist' | 'Tier 3 - Associate' | 'Contractor';

export type FieldCapacityType = 'guide_only' | 'driver_only' | 'dual_guide_driver' | 'support';

export function canActAsGuide(roleOrEmp?: StaffRole | string | { role?: StaffRole | string }): boolean {
  const role = typeof roleOrEmp === 'object' && roleOrEmp !== null ? roleOrEmp.role : roleOrEmp;
  return role === 'Tour Guide' || role === 'Driver & Guide' || role === 'Operations Manager';
}

export function canActAsDriver(roleOrEmp?: StaffRole | string | { role?: StaffRole | string }): boolean {
  const role = typeof roleOrEmp === 'object' && roleOrEmp !== null ? roleOrEmp.role : roleOrEmp;
  return role === 'Driver' || role === 'Driver & Guide' || role === 'Logistics Lead';
}

export function isDualGuideDriver(roleOrEmp?: StaffRole | string | { role?: StaffRole | string }): boolean {
  const role = typeof roleOrEmp === 'object' && roleOrEmp !== null ? roleOrEmp.role : roleOrEmp;
  return role === 'Driver & Guide';
}

export function getStaffCapacityInfo(roleOrEmp?: StaffRole | string | { role?: StaffRole | string }): {
  type: FieldCapacityType;
  badgeLabel: string;
  shortTag: string;
  scopeNote: string;
  badgeClass: string;
} {
  const role = typeof roleOrEmp === 'object' && roleOrEmp !== null ? roleOrEmp.role : roleOrEmp;
  if (role === 'Driver & Guide') {
    return {
      type: 'dual_guide_driver',
      badgeLabel: 'Dual Capacity: Guide & Driver',
      shortTag: '[Dual: Guide & Driver]',
      scopeNote: 'Certified to work as a Tour Guide, a Fleet Driver, or both simultaneously on an expedition.',
      badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
    };
  }
  if (role === 'Tour Guide') {
    return {
      type: 'guide_only',
      badgeLabel: 'Guide Only (No Driving)',
      shortTag: '[Guide Only]',
      scopeNote: 'Licensed exclusively as a Cultural & Expedition Tour Guide (not assigned to drive fleet vehicles).',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  }
  if (role === 'Driver') {
    return {
      type: 'driver_only',
      badgeLabel: 'Driver Only (No Guiding)',
      shortTag: '[Driver Only]',
      scopeNote: 'Licensed exclusively as a 4WD / Coach Fleet Driver (not assigned as a cultural tour guide).',
      badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
    };
  }
  return {
    type: 'support',
    badgeLabel: typeof role === 'string' && role ? role : 'Operations & Support',
    shortTag: `[${typeof role === 'string' && role ? role : 'Staff'}]`,
    scopeNote: 'Office, administrative, or operational management personnel.',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

export function getEmployeeFieldRoleBadge(roleOrEmp?: StaffRole | string | { role?: StaffRole | string }): string {
  return getStaffCapacityInfo(roleOrEmp).badgeLabel;
}

export interface EmployeeDocument {
  id: string;
  title: string;
  type: 'Contract' | 'Certification' | 'ID Passport' | 'Medical Clearance' | 'First Aid';
  uploadedAt: string;
  size: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  timestamp: string;
  target?: string;
  user: string;
}

export interface EmployeeOnboardingData {
  profile: {
    employeeId: string;
    formDate: string;
    employmentStatus: 'Permanent' | 'Contract' | 'Temporary' | 'Internship' | 'Part-Time';
    departments: string[];
    departmentOther?: string;
    jobTitle: string;
    dateOfJoining: string;
    reportingManager: string;
    photoUrl?: string;
  };
  personal: {
    fullName: string;
    preferredName: string;
    dob: string;
    nationality: string;
    nationalIdNo: string;
    passportNumber: string;
    passportExpiry: string;
    drivingLicenseNo: string;
    gender: 'Male' | 'Female';
    maritalStatus: 'Single' | 'Married' | 'Divorced' | 'Widowed';
    dependentsCount: number;
    placeOfBirth: string;
    countryOfBirth: string;
    languagesSpoken: string;
  };
  contact: {
    residentialAddress: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    mobileNumber: string;
    altPhone: string;
    personalEmail: string;
  };
  emergency: {
    fullName: string;
    relationship: string;
    telephone: string;
    address: string;
  };
  family: Array<{
    relationship: string;
    name: string;
    occupation: string;
    contact: string;
  }>;
  education: Array<{
    qualification: string;
    institution: string;
    country: string;
    yearCompleted: string;
  }>;
  qualifications: {
    certifications: string[];
    languages: string[];
    computerSkills: string[];
    otherLanguage?: string;
    otherSkill?: string;
  };
  employmentHistory: Array<{
    employer: string;
    position: string;
    durationFrom: string;
    durationTo: string;
    reasonForLeaving: string;
  }>;
  experience: {
    yearsOfExperience: string;
    areasOfExperience: string[];
    otherExperience?: string;
  };
  bank: {
    bankName: string;
    branch: string;
    accountName: string;
    accountNumber: string;
    iban: string;
  };
  taxSocialSecurity: {
    tin: string;
    socialSecurityNo: string;
  };
  medical: {
    bloodGroup: string;
    knownAllergies: string;
    medicalConditions: string;
    specialAssistance: string;
  };
  equipmentIssued: Array<{
    item: string;
    serialNo: string;
    dateIssued: string;
    returned: boolean;
  }>;
  uniform: {
    shirtSize: string;
    jacketSize: string;
    trouserSize: string;
    shoeSize: string;
  };
  other: {
    hobbies: string;
    memberships: string;
    awards: string;
    hearAboutUs: string;
  };
  declaration: {
    signed: boolean;
    employeeSignature: string;
    date: string;
  };
  hrUseOnly: {
    dateReceived: string;
    employeeIdAssigned: string;
    hrOfficer: string;
    department: string;
  };
  hrVerification: {
    documentsReceived: string[];
    otherDocument?: string;
    educationVerified: boolean;
    referenceCheckCompleted: boolean;
    criminalRecordCleared: boolean;
    medicalExamDone: boolean;
    documentsVerified: boolean;
    remarks: string;
    reviewedBy: string;
    hrManager: string;
    approvalDate: string;
    approvalSignature: string;
  };
  onboardingChecklist: {
    orientationCompleted: { done: boolean; date: string };
    payrollAdded: { done: boolean; date: string };
    emailCreated: { done: boolean; date: string };
    idIssued: { done: boolean; date: string };
  };
}

export interface Employee {
  id: string;
  name: string;
  fullName?: string;
  role: StaffRole;
  email: string;
  phone: string;
  departmentId: string;
  departmentName: string;
  salaryTier: SalaryTier;
  salaryAmount: number;
  perDiemRateUSD?: number;
  hireDate: string;
  status: StaffStatus;
  avatar: string;
  rating: number;
  languages: string[];
  assignedToursCount: number;
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
  };
  documents: EmployeeDocument[];
  specialties: string[];
  recentLogs: ActivityLog[];
  onboardingData?: EmployeeOnboardingData;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  leadName: string;
  leadId: string;
  employeeCount: number;
  budget: number;
  description: string;
  color: string;
}

export type TourDifficulty = 'Easy' | 'Moderate' | 'Challenging' | 'Extreme';
export type ActivityType = 'Transfer' | 'Trek' | 'Sightseeing' | 'Cultural' | 'Meal' | 'Rest' | 'Briefing' | 'Safari';

export interface ItineraryItem {
  id: string;
  dayNumber: number;
  timeSlot: string;
  title: string;
  location: string;
  coordinates?: string;
  description: string;
  activityType: ActivityType;
  guideId?: string;
  guideName?: string;
  mealPlan?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Full Board' | 'None';
  gearNeeded?: string[];
  altitudeMeters?: number;
}

export interface TourPackage {
  id: string;
  title: string;
  destination: string;
  region: string;
  country: string;
  durationDays: number;
  difficulty: TourDifficulty;
  maxCapacity: number;
  basePrice: number;
  description: string;
  coverImage: string;
  tags: string[];
  gearChecklist: string[];
  highlightPoints: string[];
  includedServices: string[];
  visaRequired: boolean;
  permitRequired: boolean;
  itinerary: ItineraryItem[];
  /** Price as advertised on eritreavisit.com, in euros. */
  publishedPriceEur?: number;
  /** Was-price shown on the website before the advertised discount, in euros. */
  publishedWasPriceEur?: number;
  /** Path of this tour's page on the public website. */
  websitePath?: string;
  /** Categories the public website files this tour under. */
  websiteCategories?: string[];
  /** Set when the tour is offered on the public website. */
  publishedOnWebsite?: boolean;
}

export type TourBookingType = 'Group Tour' | 'Private Tour' | 'Custom Tour' | 'Corporate Tour';

export type SupportedCurrencyCode = 'ERN' | 'USD' | 'EUR' | 'GBP' | 'CHF';

export type TourCostCategory =
  | 'hotel'
  | 'fuel'
  | 'vehicle_rental'
  | 'boat_rent'
  | 'guide_allowance'
  | 'driver_allowance'
  | 'meals'
  | 'logistics'
  | 'travel_permits'
  | 'entrance_fees'
  | 'tips_waitstaff'
  | 'experts'
  | 'boat_crew'
  | 'family_visit'
  | 'community_assistance'
  | 'overtime'
  | 'accommodation'
  | 'sea_tax'
  | 'visa_fee';

export interface TourCostLine {
  id: string;
  category: TourCostCategory;
  label?: string;
  description?: string;
  currency?: SupportedCurrencyCode;
  expectedNative?: number;
  actualNative?: number;
  expectedERN?: number;
  actualERN?: number;
  expectedUSD: number;
  actualUSD: number;
  exchangeRateToUSD?: number;
  cashPaidUSD?: number;
  hotelName?: string;
  subItems?: Record<string, number>;
  logisticsSubItems?: Array<{ key: string; label: string; amountERN: number }>;
  linkedToLedger?: boolean;
  linkedTransactionId?: string;
  linkedLedgerEntryId?: string;
  ledgerTransactionId?: string;
  linkedStaffId?: string;
  staffName?: string;
  /** When true, this allowance is accrued via monthly payroll rather than posted as a direct tour expense, preventing double-counting. */
  isPayrollAccrued?: boolean;
  notes?: string;
}

/**
 * A standalone tour-costing booking: who is going, when, with which hotel,
 * guide, driver and vehicle, and the allowances/fees that make up the
 * package price. Independent of `Booking` (a ticket-class seat sale against
 * a `TourSchedule`) and `TouristActivity` (a single itinerary entry) — this
 * is the trip-level cost sheet a tour desk fills in when a client commits.
 */
export interface TourBooking {
  id: string;
  bookingRef?: string;
  touristId?: string;
  touristName?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  nationality?: string;
  gender?: 'Male' | 'Female';
  passportNumber?: string;
  packageId?: string;
  packageTitle?: string;
  packageCategory?: string;
  region?: string;
  startDate: string;
  endDate: string;
  hotelId?: string;
  hotelName?: string;
  roomType?: string;
  nights?: number;
  guideId?: string;
  guideName?: string;
  assignedGuideId?: string;
  assignedGuideName?: string;
  driverId?: string;
  driverName?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  vehicleId?: string;
  vehicleName?: string;
  assignedVehicleId?: string;
  assignedVehicleName?: string;
  staffAssignmentRole?: string;
  guideAllowanceUSD?: number;
  driverAllowanceUSD?: number;
  mealsUSD?: number;
  entranceFeesUSD?: number;
  guideAllowanceERN?: number;
  driverAllowanceERN?: number;
  mealsERN?: number;
  entranceFeesERN?: number;
  logisticsERN?: number;
  travelPermitsERN?: number;
  boatRentERN?: number;
  tipsAndCommunityERN?: number;
  seaTaxUSD?: number;
  visaFeeUSD?: number;
  fuelUSD?: number;
  vehicleRentalUSD?: number;
  overtimeUSD?: number;
  staffAccommodationUSD?: number;
  hotelCostUSD?: number;
  transportCostUSD?: number;
  permitAndGuideCostUSD?: number;
  packageBasePriceUSD?: number;
  costLines?: TourCostLine[];
  costingLines?: TourCostLine[];
  packageCurrency?: 'USD' | 'EUR' | 'GBP' | 'CHF';
  packagePriceNative?: number;
  pricePerPersonNative?: number;
  totalPackageNative?: number;
  amountCollectedUSD?: number;
  amountPaidUSD?: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: string;
  specialRequests?: string;
  dualRoleSinglePayApplied?: boolean;
  tourType?: TourBookingType;
  travelersCount: number;
  pricePerPersonUSD?: number;
  totalPackageUSD?: number;
  totalPriceUSD?: number;
  bookingDate?: string;
  status: TouristActivityStatus | 'In Progress' | 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
  createdAt: string;
}

export type ScheduleStatus = 'Upcoming' | 'Active' | 'Completed' | 'Cancelled';

export interface TicketClassPricing {
  price: number;
  totalSeats: number;
  bookedSeats: number;
}

export interface TourSchedule {
  id: string;
  tourPackageId: string;
  tourTitle: string;
  packageTitle?: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: ScheduleStatus;
  leadGuideId: string;
  leadGuideName: string;
  guideId?: string;
  assignedGuide?: string;
  driverId?: string;
  vehicleId?: string;
  assignedVehicle?: string;
  supportStaffIds: string[];
  supportStaffNames: string[];
  totalSeats: number;
  bookedSeats: number;
  ticketClasses: {
    vip: TicketClassPricing;
    standard: TicketClassPricing;
    group: TicketClassPricing;
  };
  permitReference?: string;
  weatherForecast?: string;
  notes?: string;
}

export type CrmPipelineStage =
  | 'New Lead'
  | 'Contacted'
  | 'Quotation Sent'
  | 'Negotiation'
  | 'Booked'
  | 'Completed';

/**
 * An enquiry submitted through the contact form on www.eritreavisit.com
 * or entered into the CRM sales pipeline.
 */
export interface WebsiteEnquiry {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  /** The package the visitor was reading when they submitted the form. */
  tourId?: string | null;
  tourTitle?: string | null;
  preferredDate?: string | null;
  partySize?: number | null;
  message: string;
  /** Which page or campaign the enquiry came from. */
  source?: string | null;
  status: 'New' | 'Contacted' | 'Quoted' | 'Converted' | 'Closed';
  /** Keckia ERP CRM sales pipeline stage (kept separate from operational booking & payment status). */
  stage?: CrmPipelineStage;
  crmStage?: CrmPipelineStage;
  leadSource?: string;
  interestedService?: string;
  expectedTravelDate?: string;
  expectedReturnDate?: string;
  assignedAgent?: string;
  quotationValue?: number;
  quotationCurrency?: 'USD' | 'EUR' | 'GBP' | 'CHF' | 'ERN';
  nextFollowUpDate?: string;
  notes?: string;
  linkedTouristId?: string;
  linkedBookingId?: string;
  operationalBookingStatus?: 'Unbooked' | 'Planned' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled';
  paymentStatus?: PaymentStatus;
  receivedAt: string;
  /** Staff member who picked the enquiry up. */
  assignedTo?: string | null;
  handledAt?: string | null;
}

export type TourSituation = 'Single' | 'Couple' | 'Family' | 'Group' | 'Delegation';

export interface CompanionMember {
  id: string;
  fullName: string;
  passportNumber: string;
  passportExpiry: string;
  nationality: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female';
  relationship: string; // 'Spouse', 'Child', 'Colleague', 'Delegate'
  occupation?: string;
  dietaryRequirements?: string;
  medicalNotes?: string;
  passportDocName?: string;
  passportDocUrl?: string;
  passportVerified?: boolean;
}

export interface TouristItineraryDay {
  dayNumber: number;
  title: string;
  location: string;
  activities: string;
  lodging?: string;
  mealPlan?: 'Breakfast' | 'Half Board' | 'Full Board' | 'Dinner' | 'None';
  transport?: string;
}

export interface TouristEmergencyContact {
  name: string;
  relation?: string;
  relationship?: string;
  phone: string;
}

export interface TouristProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  passportNumber: string;
  passportExpiry: string;
  nationality: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female';
  status: 'Active Traveler' | 'Inquiry' | 'VIP' | 'Flagged';
  avatar: string;
  occupation?: string;
  dietaryRequirements?: string;
  medicalNotes?: string;
  medicalClearanceHighAltitude?: boolean;
  preferredLanguage?: string;
  insurancePolicyNumber?: string;
  emergencyContact?: TouristEmergencyContact;
  travelHistoryCount?: number;
  notes?: string;
  scannedDocumentUrl?: string;
  scannedDocumentName?: string;
  tourSituation?: TourSituation;
  groupOrFamilyName?: string;
  partySize?: number;
  companions?: CompanionMember[];
  customItinerary?: {
    summary: string;
    days: TouristItineraryDay[];
    notes?: string;
  };
  hotelBookings?: Array<{
    hotelId: string;
    hotelName: string;
    roomType: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    roomsCount: number;
    totalUSD: number;
    status: 'Confirmed' | 'Pending';
  }>;
  assignedGuideId?: string;
  assignedGuideName?: string;
  assignedGuidePhone?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedVehicleId?: string;
  assignedVehicleName?: string;
  assignedVehiclePlate?: string;
  companionNames?: string[];
  itinerarySummary?: string;
  itineraryDays?: TouristItineraryDay[];
  itineraryNotes?: string;
  reservedHotelId?: string;
  reservedHotelName?: string;
  reservedRoomType?: string;
  reservedCheckIn?: string;
  reservedCheckOut?: string;
  phoneNumber?: string;
}

export type TicketClass = 'VIP' | 'Standard' | 'Group';
export type PaymentStatus =
  | 'Paid'
  | 'Pending'
  | 'Partial'
  | 'Refunded'
  | 'Deposit Paid'
  | 'Unpaid'
  | 'Partially Paid'
  | 'Overdue';

export interface Booking {
  id: string;
  bookingRef: string;
  pnr?: string;
  tourScheduleId: string;
  tourTitle: string;
  departureDate: string;
  travelDate?: string;
  loanDueDate?: string;
  createdAt?: string;
  touristId: string;
  touristName: string;
  touristEmail: string;
  touristPassport: string;
  touristNationality: string;
  ticketClass: TicketClass;
  numberOfSeats: number;
  totalPrice: number;
  totalAmountUSD?: number;
  amountUSD?: number;
  amountPaidUSD?: number;
  paymentStatus: PaymentStatus;
  bookingDate: string;
  specialRequests?: string;
  ticketIds: string[];
}

export type TouristActivityStatus = 'Planned' | 'Confirmed' | 'Completed' | 'Cancelled';

/**
 * A traveler's own itinerary entry — a booked activity for one specific
 * tourist, distinct from `TourActivity` (the reusable catalog a package's
 * day-by-day plan is built from). Carries the links a field entry actually
 * needs: which hotel stay it happens around, which visa/permit covers it,
 * and which vehicle, guide and driver are assigned, so a single dossier
 * shows the whole day rather than five unrelated records.
 */
export interface TouristActivity {
  id: string;
  touristId: string;
  touristName: string;
  tourScheduleId?: string;
  tourTitle?: string;
  title: string;
  activityType: ActivityType;
  date: string;
  timeSlot?: string;
  location?: string;
  notes?: string;
  status: TouristActivityStatus;
  hotelReservationId?: string;
  hotelName?: string;
  visaDocId?: string;
  visaDocNumber?: string;
  permitId?: string;
  permitNumber?: string;
  vehicleId?: string;
  vehicleName?: string;
  driverId?: string;
  driverName?: string;
  guideId?: string;
  guideName?: string;
  createdAt: string;
}

export type TicketStatus = 'Valid' | 'Checked In' | 'Boarded' | 'Cancelled' | 'Refunded';

export interface Ticket {
  id: string;
  ticketNumber: string;
  bookingRef: string;
  bookingId?: string;
  tourScheduleId?: string;
  tourTitle?: string;
  origin?: string;
  destination?: string;
  departureDate: string;
  returnDate?: string;
  touristId?: string;
  touristName: string;
  passengerName?: string;
  clientName?: string;
  phoneNumber?: string;
  touristPassport?: string;
  seatNumber?: string;
  ticketClass?: TicketClass;
  qrCodeData?: string;
  issueDate?: string;
  issuedAt?: string;
  status: TicketStatus;
  price: number;
  leadGuideName?: string;
  pickupLocation?: string;

  // New Ticket Booking fields
  airline?: string;
  flightNumber?: string;
  route?: string;
  pnr?: string;
  journeyType?: 'Round Trip' | 'One Way' | 'Stopover Transit' | 'Multi-City' | 'Stopover' | 'Multi City';
  departureTime?: string;
  arrivalTime?: string;
  boardingTime?: string;
  fromAirport?: string;
  toAirport?: string;
  terminal?: string;
  gate?: string;
  boardingGroup?: string;
  cabinClass?: string;
  frequentFlyerNo?: string;

  // Extra / Return Leg (if Round Trip / Multi-city)
  returnAirline?: string;
  returnFlightNumber?: string;
  returnFlightDate?: string;
  returnDepartureTime?: string;
  returnArrivalTime?: string;
  returnBoardingTime?: string;
  returnFrom?: string;
  returnTo?: string;
  returnTerminal?: string;
  returnGate?: string;
  returnBoardingGroup?: string;
  returnSeat?: string;

  bookingDate?: string;
  paymentDate?: string;
  ticketCost?: number;
  serviceFee?: number;
  penaltyFee?: number;
  loan?: number;
  rebookingOption?: string;
  rebookedDepartureDate?: string;
  rebookingNotes?: string;
  agent?: string;
  creditCardRef?: string;
  salesAgentName?: string;
  salesAgentId?: string;
  salesAgentUsername?: string;
  issuedBy?: string;
  airportShuttle?: boolean;
  airportShuttleTime?: string;
  airportShuttlePickupLocation?: string;
  airportShuttleVehicleId?: string;
  airportShuttleDriverId?: string;
  airportShuttleNotes?: string;
  preIssueChecklist?: {
    visaConfirmed: boolean;
    mileageCaptured: boolean;
    nameMatchesPassport: boolean;
  };
  /** How much of the total fare has actually been collected from the client. */
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  currency?: 'USD' | 'EUR';
  priceNative?: number;
  clientId?: string;
}

export type ClientCategory =
  | 'Individual'
  | 'Corporate'
  | 'Diaspora'
  | 'Government / NGO'
  | 'VIP Traveler'
  | 'Travel Agency'
  | 'Diplomatic / Embassy'
  | 'NGO / UN Agency'
  | 'Group';

export interface FrequentFlyerRecord {
  airline: string;
  programName: string;
  membershipNumber: string;
  tierStatus?: string;
}

export interface TicketingClient {
  id: string;
  clientCode: string;
  fullName: string;
  category: ClientCategory;
  companyOrOrg?: string;
  email: string;
  phone: string;
  secondaryPhone?: string;
  passportNumber: string;
  passportExpiry: string;
  passportIssueCountry?: string;
  dateOfBirth?: string;
  gender?: 'Male' | 'Female';
  nationality: string;
  residentialCity?: string;
  residentialCountry?: string;
  address?: string;
  preferredSeating?: 'Window' | 'Aisle' | 'Extra Legroom' | 'Any';
  mealPreference?: string;
  frequentFlyerPrograms?: FrequentFlyerRecord[];
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  creditLimitUSD?: number;
  outstandingBalanceUSD?: number;
  totalBookingsCount?: number;
  totalSpentUSD?: number;
  vipStatus?: boolean;
  occupation?: string;
  notes?: string;
  avatar?: string;
  passportDocumentUrl?: string;
  passportDocumentName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface VoaTouristRow {
  name: string;
  passportNo: string;
  gender: string;
  nationality: string;
  job: string;
}

export interface VisaOnArrivalDoc {
  tripPacketId?: string;
  id: string;
  docNumber: string;
  referenceNumber?: string;
  touristId: string;
  touristName: string;
  passportNumber?: string;
  touristPassport?: string;
  passportExpiry?: string;
  gender?: string;
  touristGender?: string;
  nationality?: string;
  touristNationality?: string;
  job?: string;
  occupation?: string;
  touristOccupation?: string;
  dateOfBirth?: string;
  touristDOB?: string;
  tourPackageTitle: string;
  tourScheduleId?: string;
  arrivalDate: string;
  departureDate: string;
  entryPort: string;
  localSponsorName?: string;
  localSponsorLicense?: string;
  sponsorOrganization?: string;
  sponsorLicenseNo?: string;
  sponsorOfficerName?: string;
  sponsorOfficerPhone?: string;
  sponsorAddress?: string;
  sponsorEmail?: string;
  sponsorWebsite?: string;
  invitationLetterDate?: string;
  manifestList?: any[];
  qrVerificationData?: string;
  notes?: string;
  hotelArrangements?: string;
  issuanceStatus: 'Draft' | 'Approved' | 'Issued' | 'Submitted';
  generatedAt: string;
  officialNotes?: string;
  embassyOrAuthority?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  // Multi-tourist table support
  touristsManifest?: VoaTouristRow[];
  letterDate?: string;
}

export interface PermitItineraryStop {
  id: string;
  place: string;
  tourDate: string;
  hotel: string;
}

export interface PermitTouristRow {
  number?: number | string;
  name?: string;
  fullName?: string;
  nationality: string;
  passportNumber?: string;
  passportNo?: string;
  sex: string;
  tourDate: string;
  tourPlace: string;
  hotel?: string;
}

export interface PermitDriverRow {
  driverName: string;
  phoneNumber?: string;
  phone?: string;
  licenseNumber?: string;
  taseraNo?: string;
  vehicleType?: string;
  carType?: string;
  plateNumber?: string;
  carPlate?: string;
}

export interface RegionalPermitDoc {
  tripPacketId?: string;
  notes?: string;
  id: string;
  permitNumber: string;
  referenceNumber?: string;
  zoneName: string;
  zoneType: 'Heritage Park' | 'Restricted Alpine Zone' | 'Border Buffer Zone' | 'Wildlife Conservation';
  tourScheduleId: string;
  tourPackageTitle: string;
  leadGuideName: string;
  leadGuidePhone?: string;
  leadGuideId?: string;
  guideLicenseNo: string;
  touristNames: string[];
  touristPassports: string[];
  validFrom: string;
  validTo: string;
  vehiclePlate: string;
  vehicleType?: string;
  hotelName?: string;
  authorityOffice: string;
  status: 'Pending' | 'Active' | 'Expired';
  specialClearanceCode: string;
  emergencyRadioFreq: string;
  issuedAt: string;
  letterDate?: string;
  // Structured rows for official template table 1 & table 2
  touristsManifest?: PermitTouristRow[];
  driversManifest?: PermitDriverRow[];
  itineraryStops?: PermitItineraryStop[];
}

export interface NotificationItem {
  id: string;
  type:
    | 'schedule_change'
    | 'guide_assignment'
    | 'client_alert'
    | 'weather_warning'
    | 'visa_urgent'
    | 'permit_issued'
    | 'voa_status'
    | 'hotel_reserved';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'high' | 'normal' | 'urgent';
  linkTab?: string;
}

export interface TourActivity {
  id: string;
  title: string;
  category: 'Architecture & History' | 'Marine & Islands' | 'Mountain Trekking' | 'Archaeology & Ruins' | 'Cultural & Markets' | 'Wildlife & Nature' | 'Culinary & Coffee Ceremony' | 'Scenic Railway';
  region: 'Central (Maekel / Asmara)' | 'Northern Red Sea (Massawa & Dahlak)' | 'Southern (Debub / Qohaito)' | 'Anseba (Keren)' | 'Gash-Barka' | 'Southern Red Sea (Assab)';
  location: string;
  durationHours: number;
  difficulty: 'Easy' | 'Moderate' | 'Challenging' | 'Extreme';
  description: string;
  highlights: string[];
  includedGear: string[];
  permitCategory?: string;
  recommendedMeal?: string;
  coverImage: string;
  altitudeMeters?: number;
}

export type VehicleType =
  | '4WD SUV Convoy'
  | 'Luxury Coaster Bus'
  | 'VIP HiAce Minivan'
  | 'Marine Speedboat'
  | 'Traditional Motorized Dhow'
  | 'Historic Steam Railway'
  | 'Expedition Logistics Truck';

export type VehicleStatus = 'Available' | 'On Tour' | 'In Maintenance' | 'Reserved';
export type OwnershipType = 'Company Owned' | 'Rented / Third-Party';
export type FleetCategory = 'Vehicle / 4WD / Bus' | 'Boat / Marine Vessel' | 'Railway';

export interface Vehicle {
  id: string;
  name: string;
  model: string;
  year: number;
  plateNumber: string; // e.g. "ER-2-18492" (ሰሌዳ) or "MSW-SEA-09"
  type: VehicleType;
  category?: FleetCategory;
  ownershipType: OwnershipType;
  capacity: number;
  fuelType: 'Diesel' | 'Petrol' | 'Marine Diesel' | 'Coal / Steam';
  fuelLevel: number; // 0-100%
  mileageKm: number;
  status: VehicleStatus;
  currentLocation: string; // e.g. "Asmara Main Depot", "Massawa Marine Harbor", "Keren Base"
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  driverLicenseNo?: string; // ታሴራ / Harbor Master license
  assignedScheduleId?: string;
  assignedTourTitle?: string;
  insuranceExpiry: string;
  technicalInspectionExpiry: string;
  lastServiceDate: string;
  nextServiceKm: number;
  safetyFeatures: string[];
  image: string;
  notes?: string;

  // Rental Company & Fee Tracking Fields (for Rented / Third-Party assets)
  rentalCompany?: string; // e.g. "Eri-Rent Car Services (Asmara)", "Dahlak Marine Charters (Massawa)"
  rentalContactPerson?: string;
  rentalContactPhone?: string;
  rentalDailyRateUSD?: number;
  rentalDailyRateERN?: number;
  rentalStartDate?: string;
  rentalEndDate?: string;
  rentalDaysCount?: number;
  totalRentCostUSD?: number;
  totalRentPaidUSD?: number;
  totalRentPendingUSD?: number;
  rentalPaymentStatus?: 'Paid' | 'Pending' | 'Partial';
  driverOrCaptainProvided?: 'Supplied by Rental Company' | 'Agency Staff / Guides';
  fuelIncludedInRent?: boolean;
  rentalAgreementRef?: string;

  // Marine / Boat Specific Fields
  vesselType?: 'Speedboat' | 'Cabin Cruiser' | 'Motorized Dhow' | 'Catamaran' | 'RIB Inflatable';
  marinePort?: string; // e.g. "Massawa Port (Twot Bay)", "Massawa Old Port", "Dissei Island Station", "Assab Harbor"
  captainName?: string;
  captainPhone?: string;
  marineRadioFreq?: string; // e.g. "VHF Ch 16 / 68"
  lifeJacketsCount?: number;
  engineSpecs?: string; // e.g. "Twin Yamaha 250HP 4-Stroke Outboards"
  cruisingSpeedKnots?: number;
}

export interface RentalLetterItemRow {
  id: string;
  assetName: string;
  assetType: VehicleType | string;
  category: 'Car / 4WD' | 'Boat / Marine' | 'Bus / Van';
  quantity: number;
  startDate: string;
  endDate: string;
  daysCount: number;
  dailyRateUSD: number;
  totalCostUSD: number;
  routeOrDestination: string;
  driverOrCaptainArrangement: string;
  purposeOrTour: string;
}

export interface RentalLetterDoc {
  id: string;
  refNumber: string; // e.g. "KECK/RNT-LTR/2026/089"
  date: string;
  rentalCompanyName: string;
  rentalCompanyNameTigrinya: string;
  rentalCompanyType: 'Car Rental Company' | 'Boat & Marine Rental Company';
  contactPerson: string;
  contactPhone: string;
  city: string;
  subjectTigrinya: string;
  salutationTigrinya: string;
  openingTigrinya: string;
  closingTigrinya: string;
  signoffTigrinya: string;
  agencyNameTigrinya: string;
  items: RentalLetterItemRow[];
  totalEstimatedCostUSD: number;
  paymentTerms: string;
  driverOrCoordinatorName?: string;
  tourPackageTitle?: string;
  status: 'Draft' | 'Sent' | 'Confirmed by Rental Agency' | 'Archived';
  sentAt?: string;
  notes?: string;
}

export interface HotelRoomType {
  id: string;
  name: string;
  pricePerNightUSD: number;
  pricePerNightNFA: number;
  capacity: number;
  totalRooms: number;
  availableRooms: number;
  bedType: string;
  features: string[];
}

export interface VehicleOutwardRental {
  id: string;
  rentalRef?: string;
  contractRef?: string;
  customerName: string;
  customerPhone?: string;
  customerContact?: string;
  customerPassportOrId?: string;
  customerEmail?: string;
  vehicleId: string;
  vehicleName: string;
  plateNumber?: string;
  vehiclePlate?: string;
  vehiclePlateNumber?: string;
  startDate: string;
  endDate: string;
  /** Inclusive calendar days: (endDate - startDate) + 1 */
  calculatedDays: number;
  /** Actual billed days (equals calculatedDays unless overridden with reason) */
  billableDays: number;
  billableDaysOverridden?: boolean;
  billableDaysOverrideReason?: string;
  overrideAuthorizedBy?: string;
  dailyRate?: number;
  dailyRateUSD?: number;
  currency: 'USD' | 'ERN';
  exchangeRate?: number;
  driverIncluded?: boolean;
  includeDriver?: boolean;
  assignedDriverId?: string;
  assignedDriverName?: string;
  driverId?: string;
  driverName?: string;
  driverDailyFeeUSD?: number;
  driverDailyAllowanceUSD?: number;
  depositUSD: number;
  totalChargeUSD: number;
  amountPaidUSD: number;
  outstandingBalanceUSD: number;
  paymentStatus: PaymentStatus;
  status:
    | 'Confirmed'
    | 'Upcoming'
    | 'Active'
    | 'Active Outward'
    | 'Reserved'
    | 'Overdue Return'
    | 'Returned'
    | 'Cancelled';
  ledgerEntryId?: string;
  ledgerTransactionId?: string;
  notes?: string;
  createdAt: string;
}

export interface Hotel {
  id: string;
  name: string;
  nameTigrinya?: string;
  city: string;
  region: string;
  starRating: number;
  address: string;
  phone: string;
  email: string;
  image: string;
  description: string;
  amenities: string[];
  roomTypes: HotelRoomType[];
  /** Default billing currency: USD for Hotel Asmara Palace, ERN for all other Eritrean hotels */
  billingCurrency?: 'USD' | 'ERN';
  /** Default partner commission percentage agreed with the hotel (e.g. 10%). */
  defaultCommissionPercent?: number;
}

export interface HotelLetterGuestRow {
  id: string;
  name: string;
  noOfClients: number;
  roomType: string;
  reservedDate: string;
  nights: number;
  remarks: string;
}

export interface HotelLetterDoc {
  id: string;
  refNumber: string;
  date: string;
  hotelId: string;
  hotelName: string;
  hotelNameTigrinya: string;
  city: string;
  subjectTigrinya: string;
  salutationTigrinya: string;
  openingTigrinya: string;
  closingTigrinya: string;
  signoffTigrinya: string;
  agencyNameTigrinya: string;
  guests: HotelLetterGuestRow[];
  tourScheduleId?: string;
  tourPackageTitle?: string;
  status: 'Draft' | 'Sent' | 'Confirmed by Hotel' | 'Archived';
  sentAt?: string;
  notes?: string;
}

export interface HotelReservation {
  id: string;
  confirmationCode: string;
  hotelId: string;
  hotelName: string;
  hotelCity: string;
  roomTypeId: string;
  roomTypeName: string;
  touristId: string;
  touristName: string;
  touristPassport?: string;
  touristNationality?: string;
  touristEmail?: string;
  touristPhone?: string;
  tourPackageId?: string;
  tourPackageTitle?: string;
  tourScheduleId?: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfNights: number;
  numberOfGuests: number;
  numberOfRooms: number;
  mealPlan: 'Room Only' | 'Bed & Breakfast (BB)' | 'Half Board (HB)' | 'Full Board (FB)';
  currency?: 'USD' | 'ERN';
  pricePerNightERN?: number;
  totalAmountERN?: number;
  pricePerNight: number;
  totalAmount: number;
  paymentStatus: 'Confirmed' | 'Pending' | 'Paid at Hotel' | 'Voucher Issued' | 'Cancelled';
  specialRequests?: string;
  assignedRoomNumber?: string;
  voucherIssuedAt: string;
  airportTransferIncluded: boolean;
  /** Snapshot of commission rate (%) when reservation was confirmed so future hotel rate edits do not alter history. */
  commissionRatePercent?: number;
  /** Amount eligible for commission (defaults to totalAmount). */
  commissionEligibleAmount?: number;
  /** Calculated agency commission in USD: (commissionEligibleAmount * commissionRatePercent) / 100 */
  calculatedCommissionUSD?: number;
  /** Net amount payable to the hotel supplier: totalAmount - calculatedCommissionUSD */
  supplierPayableUSD?: number;
  /** Settlement status of the hotel commission */
  commissionSettlementStatus?: 'Pending' | 'Invoiced' | 'Settled' | 'Waived';
  /** Linked financial transaction ID to prevent duplicate ledger postings */
  commissionLedgerEntryId?: string;
}

// ----------------------------------------------------
// Messages & Communications Engine Types
// ----------------------------------------------------
export type MessageChannelType = 'channel' | 'direct' | 'broadcast' | 'hotel';

export interface MessageAttachment {
  id: string;
  name: string;
  type: 'document' | 'image' | 'permit' | 'voa' | 'ticket' | 'voucher' | 'letter';
  url?: string;
  size?: string;
}

export interface MessageItem {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderRole?: string;
  recipientId?: string;
  recipientName?: string;
  content: string;
  timestamp: string;
  attachments?: MessageAttachment[];
  isOutgoing?: boolean;
  priority?: 'normal' | 'urgent' | 'alert' | 'broadcast';
  read?: boolean;
}

export interface MessageChannel {
  id: string;
  name: string;
  nameTigrinya?: string;
  type: MessageChannelType;
  description: string;
  avatar?: string;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: string;
  membersCount?: number;
  isOnline?: boolean;
  phoneOrEmail?: string;
  hotelId?: string;
  tourScheduleId?: string;
}

// ----------------------------------------------------
// Finance & Accounting General Ledger Types
// ----------------------------------------------------
export type TransactionCategory =
  | 'Flight Tickets'
  | 'Tour Packages'
  | 'Hotel Lodging'
  | 'Transport & Fleet'
  | 'Vehicle & Transport'
  | 'Car Rental'
  | 'Boat & Marine Rent'
  | 'Boat Rent'
  | 'Fuel'
  | 'Meals & Catering'
  | 'Meals'
  | 'Field Logistics & Provisions'
  | 'Logistics (Grocery, Water, Tents, Coffee)'
  | 'Crew, Driver & Guide Accommodation'
  | 'Travel Permits & Site Entrance'
  | 'Travel Permits'
  | 'Site Entrance Fees'
  | 'Tips, Experts & Community'
  | 'Waitstaff Tips'
  | 'Local & Site Experts'
  | 'Boat Crew'
  | 'Family Visit'
  | 'Community Assistance'
  | 'Sea Tax & Visa Fees'
  | 'Sea Tax'
  | 'Visa Fee'
  | 'Staff Payroll'
  | 'Staff Salaries & Allowances'
  | 'Government Fees'
  | 'Permits & Consular Fees'
  | 'Office & Utilities'
  | 'Marketing & Promotion'
  | 'Equipment & Supplies'
  | 'Taxes & Bank Charges'
  | 'Miscellaneous'
  | 'Other';

export type FinancialCategory = TransactionCategory;
export type TicketRecord = Ticket;

export type TransactionType = 'Income' | 'Revenue' | 'Expense' | 'Transfer' | 'Refund';

export type PaymentMethod =
  | 'Credit Card'
  | 'Bank Wire'
  | 'Cash (USD)'
  | 'Cash (NFA)'
  | 'Cash (ERN)'
  | 'Cash (EUR)'
  | 'Cash (GBP)'
  | 'Cash (CHF)'
  | 'Cash (Nakfa / USD)'
  | 'Commercial Bank of Eritrea (CBE)'
  | 'Telebirr / Mobile Money'
  | 'Traveler Cheque'
  | 'Company Cheque'
  | 'Agent Ledger'
  | 'Mobile Money';

export interface FinancialTransaction {
  id: string;
  date: string;
  clearingDate?: string;
  referenceCode: string;
  category: TransactionCategory;
  subCategory?: string;
  type: TransactionType;
  description: string;
  amountUSD: number;
  amountNFA: number;
  currency?: 'USD' | 'ERN' | 'EUR' | 'GBP' | 'CHF';
  originalAmount?: number;
  amountNative?: number;
  exchangeRate?: number;
  exchangeRateToUSD?: number;
  payerOrPayee: string;
  payerPayeeType?: 'Client / Tourist' | 'Corporate Partner' | 'Hotel Vendor' | 'Airline / GDS' | 'Driver / Guide / Staff' | 'Gov Authority' | 'Fuel / Logistics Vendor' | 'Other';
  payerPayeeContact?: string;
  taxId?: string;
  paymentMethod: PaymentMethod;
  bankAccount?: string;
  taxRatePercent?: number;
  taxAmountUSD?: number;
  netAmountUSD?: number;
  status: 'Completed' | 'Pending' | 'Overdue' | 'Reconciled' | 'Cleared';
  linkedEntityId?: string;
  linkedEntityType?:
    | 'ticket'
    | 'booking'
    | 'hotel'
    | 'hotel_reservation'
    | 'vehicle'
    | 'outward_rental'
    | 'tour_cost'
    | 'employee'
    | 'permit'
    | 'voa'
    | 'receipt'
    | 'payroll';
  linkedEntityName?: string;
  receiptNumber?: string;
  receiptId?: string;
  receiptUrl?: string;
  receiptAttachmentName?: string;
  receiptAttachmentSize?: string;
  isVerified?: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  authorizedBy?: string;
  notes?: string;
  recordedBy: string;
}

// ----------------------------------------------------
// Staff Payroll & Compensation Engine Types
// ----------------------------------------------------
export type CompensationModel =
  | 'permanent_salaried'
  | 'sales_agent_monthly'
  | 'sales_agent_commission'
  | 'sales_agent_hybrid'
  | 'tour_guide_daily'
  | 'driver_daily';

export interface ExpeditionWorkDetail {
  tourScheduleId?: string;
  tourTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: number;
  roleOnTour: string;
  dailyRateUSD: number;
  perDiemUSD: number;
  totalEarningsUSD: number;
}

export interface EmployeePayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: StaffRole | string;
  avatar?: string;
  departmentName: string;
  compensationModel: CompensationModel;
  bankName?: string;
  bankAccountNumber?: string;
  tinNumber?: string;
  
  // Permanent staff working days tracking
  standardWorkingDays: number;
  actualWorkingDays: number;
  baseMonthlySalaryUSD: number;
  dailyWorkingRateUSD: number;
  workingDaysPayUSD: number;

  // Tour Guide & Driver Tour Days tracking
  tourDaysCount: number;
  dailyTourRateUSD: number;
  tourDaysPayUSD: number;
  fieldPerDiemUSD: number;
  fieldAllowanceTotalUSD: number;
  expeditions: ExpeditionWorkDetail[];

  // Sales Agent Commission tracking
  salesToursRevenueUSD: number;
  salesToursCommissionRatePercent: number;
  salesToursCommissionUSD: number;
  salesTicketsCount: number;
  salesTicketCommissionPerTicketUSD: number;
  salesTicketsCommissionUSD: number;
  totalCommissionEarnedUSD: number;

  // Allowances & Adjustments
  allowancesUSD: number;
  bonusUSD: number;
  overtimeHours: number;
  overtimePayUSD: number;
  grossPayUSD: number;

  // Deductions
  taxDeductionUSD: number;
  socialSecurityPensionUSD: number;
  advanceOrLoanDeductionUSD: number;
  otherDeductionsUSD: number;
  totalDeductionsUSD: number;

  // Net Pay
  netPayUSD: number;
  netPayERN: number;
  disbursementMethod: 'Bank Transfer' | 'Cash (USD)' | 'Cash (ERN)' | 'Mobile Money';
  disbursementStatus: 'Pending' | 'Approved' | 'Disbursed';
  disbursedAt?: string;
  notes?: string;
}

export interface PayrollRunPeriod {
  id: string;
  periodType: 'monthly' | 'weekly' | 'biweekly';
  periodLabel: string;
  month: string; // e.g. "2026-08"
  startDate: string;
  endDate: string;
  records: EmployeePayrollRecord[];
  totalGrossUSD: number;
  totalDeductionsUSD: number;
  totalNetUSD: number;
  totalNetERN: number;
  status: 'Draft' | 'Approved' | 'Disbursed';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export type ReceiptVerificationStatus = 'Verified' | 'Pending Review' | 'Flagged Discrepancy' | 'Unmatched';

export interface ExpenseReceipt {
  id: string;
  receiptNumber: string;
  vendorName: string;
  category?: string;
  vendorCategory:
    | 'Hotel Lodging'
    | 'Car & Vehicle Rental'
    | 'Boat & Marine Charter'
    | 'Fuel Depot & Petrol'
    | 'Maintenance & Repairs'
    | 'Government & Permits'
    | 'Staff & Guide Allowance'
    | 'Catering & Food'
    | 'Flight & Aviation'
    | 'Other Operational'
    | 'Miscellaneous';
  date: string;
  amountUSD: number;
  amountNFA: number;
  currency: 'USD' | 'ERN';
  description: string;
  verificationStatus: ReceiptVerificationStatus;
  linkedTransactionId?: string;
  linkedTransactionRef?: string;
  receiptImageUrl?: string;
  receiptUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
  submittedBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  taxOrVatNumber?: string;
  paymentMethod?: PaymentMethod;
  tags?: string[];
  ocrConfidence?: number;
  ocrExtractedData?: {
    merchantName?: string;
    detectedDate?: string;
    detectedTotalUSD?: number;
    detectedTotalERN?: number;
    taxRegNumber?: string;
  };
}

export interface FinancialInvoice {
  id: string;
  invoiceNumber: string;
  bookingReference?: string;
  date: string;
  issueDate?: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  clientPassport?: string;
  clientAddress?: string;
  serviceType?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceUSD: number;
    totalUSD: number;
  }>;
  subtotalUSD: number;
  taxUSD: number;
  totalAmountUSD: number;
  totalUSD?: number;
  amountPaidUSD?: number;
  balanceDueUSD?: number;
  totalAmountNFA: number;
  status: 'Paid' | 'Pending' | 'Sent' | 'Partially Paid' | 'Overdue';
  paymentTerms: string;
  issuedBy: string;
  notes?: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'packages'
  | 'transport'
  | 'hr'
  | 'tours'
  | 'tourists'
  | 'hotels'
  | 'documents'
  | 'tickets'
  | 'messages'
  | 'finance'
  | 'audit'
  | 'accounts'
  | 'admin';

// ----------------------------------------------------
// Feed Schema Version 1 & Calendar-First Operations Types
// ----------------------------------------------------

export type FeedDateOrString =
  | string
  | {
      date?: string;
      dateTime?: string;
      timeZone?: string;
    };

export interface FeedSource {
  id: string;
  type: string; // e.g. "google_calendar", "flight_feed", "whatsapp_uchat", "hotel_api"
  name: string;
  checkedAt?: string;
  coverage?: string; // e.g. "2026-10-25..2026-11-20"
  status: 'ok' | 'partial' | 'error' | 'pending';
  error?: string;
  missingAuth?: boolean;
}

export interface FeedEvent {
  id: string; // Event ID from source
  calendarId: string; // Source calendar identifier
  calendarName: string;
  title: string;
  description?: string;
  start: FeedDateOrString;
  end?: FeedDateOrString;
  allDay?: boolean;
  timeZone?: string;
  colorId?: string;
  colorHex?: string; // e.g. #0b8043 (arrival), #d50000 (departure), #f6bf26 (tentative), #616161 (superseded)
  label?: string; // e.g. "Arrival", "Departure", "Tentative", "Superseded"
  location?: string;
  sourceUrl?: string; // Link to original calendar event
  status?: string;
  cities?: string[]; // e.g. ["Asmara", "Massawa"]
  travelerId?: string;

  // Operational linkages & classifications
  categoryKey?: string;
  isNeedsReview?: boolean;
  reviewReason?: string;
  dailyCityMap?: Record<string, string>;
  flightNumber?: string;
  airportCode?: string;
  isOvernightTransfer?: boolean;
  hotelName?: string;
  guideName?: string;
  driverName?: string;
  recurrence?: string[];
  isTentative?: boolean;
  isConflict?: boolean;
  missingFields?: string[];
  rawMetadata?: Record<string, any>;
}

export interface FeedTask {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  due: string;
  status: 'pending' | 'in_progress' | 'completed' | 'snoozed';
  travelerId?: string;
  travelerName?: string;
  sourceUrl?: string;
  evidence?: string;
  assignedTo?: string;
  assignedRole?: string;
  completedAt?: string;
  completedBy?: string;
  snoozedUntil?: string;
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
  requiresApproval: boolean; // Always true: suggestions are drafts only
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

export interface FeedSchemaV1 {
  generatedAt: string;
  timezone: string;
  sources?: FeedSource[];
  events?: FeedEvent[];
  travelers?: FeedTraveler[];
  conversations?: FeedConversation[];
  drafts?: FeedDraft[];
  conflicts?: FeedConflict[];
  rawMetadata?: Record<string, any>;
}

export interface ColorLegendMapping {
  id: string;
  colorHex: string;
  label: string;
  iconName?: string;
  isSystemDefault?: boolean;
}

export interface DailyFeedRecord {
  id: string;
  importedAt: string;
  importedBy: string;
  feed: FeedSchemaV1;
  summary: {
    sourcesCount: number;
    eventsCount: number;
    travelersCount: number;
    conversationsCount: number;
    draftsCount: number;
    conflictsCount: number;
  };
}

export interface Conversation {
  id: string;
  channel: 'WhatsApp' | 'Email';
  clientName: string;
  clientHandle: string;
  subject?: string;
  status: string;
  lastMessagePreview: string;
  lastTimestamp: string;
  unreadCount?: number;
  messages: Array<{
    id: string;
    sender: 'client' | 'agent' | 'bot';
    senderName?: string;
    text: string;
    timestamp: string;
    channel?: 'WhatsApp' | 'Email';
  }>;
}

export interface FeedCalendarEvent {
  id: string;
  calendarId?: string;
  calendarName?: string;
  title?: string;
  summary?: string;
  description?: string;
  start: FeedDateOrString;
  end?: FeedDateOrString;
  location?: string;
  attendees?: string[];
  categoryKey?: string;
  colorHex?: string;
  label?: string;
  status?: string;
  cities?: string[];
  travelerId?: string;
  flightNumber?: string;
  airportCode?: string;
  hotelName?: string;
  guideName?: string;
  driverName?: string;
  rawMetadata?: Record<string, any>;
}



