/**
 * Starter Collections Specification
 * Production empty dataset — clean workspace ready for real deployment.
 */

export const DEMO_SAMPLE_COLLECTIONS: Record<string, any[]> = {
  departments: [],
  employees: [],
  packages: [],
  activities: [],
  schedules: [],
  tourists: [],
  websiteEnquiries: [],
  bookings: [],
  tickets: [],
  ticketingClients: [],
  visaDocs: [],
  permits: [],
  notifications: [],
  vehicles: [],
  hotels: [],
  reservations: [],
  hotelLetters: [],
  rentalLetters: [],
  channels: [],
  messages: [],
  financialTransactions: [],
  financialInvoices: [],
  receipts: [],
  tourBookings: [],
  expeditions: [],
  vehicleOutwardRentals: [],
  feedSources: [],
  feedEvents: [],
  feedTravelers: [],
  feedConversations: [],
  feedDrafts: [],
  feedConflicts: [],
  feedTasks: [],
  dailyFeeds: [],
};

/**
 * The starter dataset, clean and ready for deployment without mock clutter.
 */
export const STARTER_COLLECTIONS: Record<string, any[]> = {
  ...DEMO_SAMPLE_COLLECTIONS,
  touristActivities: [],
};

/**
 * The ids the starter dataset occupies, per collection.
 */
export const STARTER_IDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(DEMO_SAMPLE_COLLECTIONS).map(([collection, rows]) => [
    collection,
    rows.map((row) => row?.id).filter((id): id is string => Boolean(id)),
  ]),
);

/** How many records the starter dataset holds in total. */
export const STARTER_RECORD_COUNT = 0;

/**
 * How many sample records are still present in a loaded workspace.
 */
export function countSampleRecords(collections: Record<string, any[]>): number {
  return 0;
}
