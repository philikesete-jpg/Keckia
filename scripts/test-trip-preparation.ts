import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  getDb,
  checkDatabase,
  hasCloudSqlConfig,
  resolveConnectionString,
} from "../db/index.ts";
import { records } from "../db/schema.ts";
import {
  parseItinerary,
  tripLabels,
  type TripInput,
} from "../shared/tripPreparation.ts";
import { tripDesk } from "../server/tripDesk.ts";
import type { ApiRequest } from "../server/api.ts";

if (
  resolveConnectionString() ||
  hasCloudSqlConfig() ||
  process.env.NETLIFY ||
  process.env.NODE_ENV === "production"
)
  throw Error("This test requires an isolated in-memory instance.");
const db = await getDb();
assert.equal((await checkDatabase()).isTemporary, true);
const hotels = [
  { id: "a", name: "Crystal Hotel", city: "Asmara" },
  { id: "b", name: "Grand Dahlak Hotel", city: "Massawa" },
];
const fixtures = [
  ...hotels.map((data) => ({ collection: "hotels", data })),
  {
    collection: "employees",
    data: { id: "g", name: "Test Guide", role: "Guide", status: "Active" },
  },
  {
    collection: "employees",
    data: {
      id: "d",
      name: "Test Driver",
      role: "Driver",
      status: "Active",
      drivingLicenseNo: "TEST-ONLY",
    },
  },
  {
    collection: "vehicles",
    data: {
      id: "v",
      name: "Test Bus",
      type: "Bus",
      capacity: 16,
      plateNumber: "TEST-ONLY",
      status: "Available",
    },
  },
];
await db
  .insert(records)
  .values(
    fixtures.map((f) => ({
      ...f,
      id: f.data.id,
      createdBy: "qa",
      updatedBy: "qa",
    })),
  );
const programme =
  "Rooms: 1 single, breakfast\nDay 1 – Asmara\nOvernight: Crystal Hotel\nDay 2 – Mai Nefhi to Massawa\nOvernight: Grand Dahlak Hotel\nDay 3 – Asmara\nOvernight: Crystal Hotel\nDay 4 – Depart Asmara";
const days = parseItinerary(programme, hotels, "2027-01-04");
assert.equal(days.length, 4);
assert.equal(days[1].route, "Mai Nefhi to Massawa");
assert.equal(
  parseItinerary(
    "Day 1 – Keren\nOvernight: Crystal Hotel",
    hotels,
    "2027-01-04",
  ).length,
  2,
);
assert.equal(
  parseItinerary(
    "Day 1 – Keren\nOvernight: Crystal Hotel or Grand Dahlak Hotel",
    hotels,
  )[0].lodging,
  "unknown",
);
const input: TripInput = {
  title: "QA Tour",
  entry: "Test airport",
  flight: "Test flight",
  rooms: tripLabels(programme).rooms!,
  fileName: "test.txt",
  text: programme,
  days,
  travellers: [
    {
      name: "QA Traveller",
      passport: "QA-ONLY-PASSPORT",
      nationality: "QA Nation",
      birth: "1980-01-01",
      expiry: "2030-01-01",
      sex: "F",
      occupation: "Test specialist",
    },
  ],
};
const user = { role: "TOUR_OPS", username: "desk-one" };
const call = (
  action: string,
  id: string,
  input?: TripInput,
  extra = {},
  actor = user,
) =>
  tripDesk(
    {
      method: input ? "POST" : "GET",
      body: { id, input, ...extra },
    } as ApiRequest,
    action,
    actor,
  );
const id = randomUUID();
const incomplete = {
  ...input,
  travellers: [{ ...input.travellers[0], passport: "" }],
};
const saved = await call("draft", id, incomplete);
assert.equal(saved.status, 200);
assert(
  saved.body.result.missing.some((s: string) => s.includes("passport number")),
);
assert.equal(
  (
    await call("file", id, incomplete, {
      version: saved.body.version,
      fingerprint: saved.body.result.fingerprint,
    })
  ).status,
  409,
);
assert.equal((await call(id, id)).status, 200);
assert.equal(
  (await call(id, id, undefined, {}, { ...user, username: "desk-two" })).status,
  403,
);
assert.equal(
  (await call(id, id, undefined, {}, { ...user, role: "SALES" })).status,
  403,
);
assert.equal((await call("draft", id, input)).status, 409);
const preview = await call("preview", id, input);
assert.deepEqual(preview.body.missing, []);
const letters = preview.body.documents.filter((d: any) =>
  d.title.startsWith("Reservation"),
);
assert.equal(letters.length, 2);
assert.match(letters[0].body, /Check in 2027-01-04 · check out 2027-01-05/);
assert.match(letters[0].body, /Check in 2027-01-06 · check out 2027-01-07/);
assert(letters.every((d: any) => !d.body.includes("QA-ONLY-PASSPORT")));
assert(preview.body.documents[0].body.includes("QA-ONLY-PASSPORT"));
const rivalId = randomUUID();
const rival = {
  ...input,
  travellers: [{ ...input.travellers[0], name: "Second Traveller" }],
};
const rivalPreview = await call("preview", rivalId, rival);
const filed = await Promise.all([
  call("file", id, input, {
    version: saved.body.version,
    fingerprint: preview.body.fingerprint,
  }),
  call("file", rivalId, rival, { fingerprint: rivalPreview.body.fingerprint }),
]);
assert.deepEqual(filed.map((r) => r.status).sort(), [200, 409]);
const firstWon = filed[0].status === 200;
assert.equal(
  (await call("file", firstWon ? id : rivalId, firstWon ? input : rival))
    .status,
  200,
);
const blocked = await call(
  "preview",
  firstWon ? rivalId : id,
  firstWon ? rival : input,
);
assert.equal(blocked.body.allocation.driver, "");
assert.equal(blocked.body.allocation.vehicle, "");
for (const [collection, count] of [
  ["visaDocs", 1],
  ["permits", 1],
  ["tourBookings", 1],
  ["hotelLetters", 2],
  ["itineraryFiledTrips", 1],
  ["invoices", 0],
] as const) {
  assert.equal(
    (await db.select().from(records).where(eq(records.collection, collection)))
      .length,
    count,
    collection,
  );
}
console.log(
  "Passed itinerary parsing, overnight dates, manifest privacy, incomplete drafts, access, version checks, atomic filing, contention and idempotency.",
);
