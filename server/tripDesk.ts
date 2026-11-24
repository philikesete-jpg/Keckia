import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index.ts";
import { records } from "../db/schema.ts";
import { BRAND } from "../shared/brand.ts";
import {
  canPrepareTrip,
  hotelStays,
  normalize,
  offsetDate,
  validDate,
  type TripInput,
  type TripResult,
} from "../shared/tripPreparation.ts";
import type { ApiRequest, ApiResponse } from "./api.ts";

type Row = Record<string, any>;
type Inventory = Record<string, Row[]>;
const packetCollection = "itineraryPackets";
const clockCollection = "itineraryDispatchVersion";
const digest = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
const text = (v: unknown, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const reply = (status: number, body: any): ApiResponse => ({ status, body });
const pending = (s: unknown) => text(s) || "[to confirm]";
function parseInput(raw: any): TripInput {
  if (
    !Array.isArray(raw?.travellers) ||
    !raw.travellers.length ||
    raw.travellers.length > 100 ||
    !Array.isArray(raw?.days) ||
    raw.days.length > 120
  )
    throw Error("Use 1–100 travellers and up to 120 itinerary days.");
  if (
    raw.days.some(
      (d: any) => typeof d?.route === "string" && d.route.length > 4000,
    )
  )
    throw Error("Shorten each route description to 4,000 characters.");
  const travellers = raw.travellers.map((r: any) =>
    Object.fromEntries(
      [
        "name",
        "passport",
        "nationality",
        "birth",
        "expiry",
        "sex",
        "occupation",
      ].map((k) => [k, text(r?.[k])]),
    ),
  );
  if (!travellers[0].name) throw Error("Enter the lead client’s name.");
  return {
    vehicleId: text(raw.vehicleId),
    verifiedSeats: text(raw.verifiedSeats, 3),
    verifiedPlate: text(raw.verifiedPlate, 30),
    licenceDriverId: text(raw.licenceDriverId),
    verifiedLicence: text(raw.verifiedLicence, 60),
    title: text(raw.title),
    entry: text(raw.entry),
    flight: text(raw.flight),
    rooms: text(raw.rooms, 500),
    text: text(raw.text, 120000),
    fileName: text(raw.fileName),
    travellers,
    days: raw.days.map((d: any) => ({
      date: text(d?.date, 10),
      route: text(d?.route, 4000),
      hotelId: text(d?.hotelId),
      rooms: text(d?.rooms, 500),
      lodging: ["hotel", "camp", "other", "unknown"].includes(d?.lodging)
        ? d.lodging
        : "unknown",
    })),
  };
}
const overlap = (start: string, end: string, a: string, b: string) =>
  Boolean(start && end && a && b && start <= b && a <= end);
function allocation(
  inv: Inventory,
  start: string,
  end: string,
  pax: number,
  input: TripInput,
) {
  const busy = new Set<string>();
  for (const row of [
    ...inv.tourBookings,
    ...inv.tourists,
    ...inv.schedules,
    ...inv.vehicleOutwardRentals,
    ...inv.expeditions,
    ...inv.touristActivities,
  ]) {
    if (/cancel|returned|archived/i.test(row.status || "")) continue;
    const from =
      row.startDate ||
      row.tourStartDate ||
      row.arrivalDate ||
      row.reservedCheckIn ||
      row.date ||
      row.travelDate ||
      row.scheduledDate;
    const until =
      row.endDate ||
      row.tourEndDate ||
      row.departureDate ||
      row.reservedCheckOut ||
      from;
    if (!overlap(start, end, from, until)) continue;
    for (const key of [
      "guideId",
      "guideName",
      "leadGuideId",
      "leadGuideName",
      "assignedGuide",
      "assignedGuideId",
      "assignedGuideName",
      "driverId",
      "driverName",
      "assignedDriverId",
      "assignedDriverName",
      "vehicleId",
      "vehicleName",
      "assignedVehicle",
      "assignedVehicleId",
      "assignedVehicleName",
      "plateNumber",
      "vehiclePlate",
      "assignedVehiclePlate",
    ]) {
      if (typeof row[key] === "string") busy.add(normalize(row[key]));
    }
    for (const a of [
      ...(Array.isArray(row.supportStaffIds) ? row.supportStaffIds : []),
      ...(Array.isArray(row.supportStaffNames) ? row.supportStaffNames : []),
    ])
      if (typeof a === "string") busy.add(normalize(a));
  }
  const free = (r: Row) =>
    [r.id, r.name, r.fullName, r.plateNumber]
      .filter(Boolean)
      .every((k) => !busy.has(normalize(k)));
  const available = inv.employees
    .filter((e) => e.status === "Active" && free(e))
    .sort((a, b) => a.id.localeCompare(b.id));
  const qualified = (r: Row, job: string) =>
    normalize(r.role).includes(job) ||
    (Array.isArray(r.qualifiedAs) &&
      r.qualifiedAs.some((x: unknown) => normalize(String(x)) === job));
  const guides = available
    .filter((e) => qualified(e, "guide"))
    .sort(
      (a, b) => Number(qualified(a, "driver")) - Number(qualified(b, "driver")),
    );
  const licence = (d: Row) =>
    d.onboardingData?.personal?.drivingLicenseNo ||
    d.drivingLicenseNo ||
    d.licenseNumber;
  const drivers = available
    .filter((e) => qualified(e, "driver"))
    .sort(
      (a, b) =>
        Number(!licence(a)) - Number(!licence(b)) ||
        Number(qualified(a, "guide")) - Number(qualified(b, "guide")),
    );
  const guide =
    guides.find((g) => drivers.some((d) => d.id !== g.id)) || guides[0];
  const driver = drivers.find((d) => d.id !== guide?.id);
  const fleet = inv.vehicles
    .filter((v) => !input.vehicleId || v.id === input.vehicleId)
    .map((v) =>
      v.id === input.vehicleId
        ? {
            ...v,
            capacity:
              Number(v.capacity) > 0 ? v.capacity : Number(input.verifiedSeats),
            plateNumber: v.plateNumber || input.verifiedPlate,
          }
        : v,
    );
  const vehicle = fleet
    .filter(
      (v) =>
        free(v) &&
        v.status === "Available" &&
        [v.insuranceExpiry, v.technicalInspectionExpiry].every(
          (d) => !validDate(d) || d >= end,
        ) &&
        (!validDate(v.rentalStartDate) || v.rentalStartDate <= start) &&
        (!validDate(v.rentalEndDate) || v.rentalEndDate >= end) &&
        Number.isInteger(Number(v.capacity)) &&
        Number(v.capacity) >= pax + 2 &&
        !/boat|marine|ship|train|rail|dhow/i.test(
          [v.type, v.category, v.fleetCategory].join(" "),
        ),
    )
    .sort(
      (a, b) =>
        Number(!a.plateNumber) - Number(!b.plateNumber) ||
        Number(a.capacity) - Number(b.capacity) ||
        a.id.localeCompare(b.id),
    )[0];
  return validDate(start) && validDate(end) && end >= start
    ? { guide, driver, vehicle }
    : { guide: undefined, driver: undefined, vehicle: undefined };
}
export function buildTrip(input: TripInput, inv: Inventory, id: string) {
  const { days, travellers } = input;
  const first = days[0]?.date || "",
    last = days.at(-1)?.date || "";
  const { guide, driver, vehicle } = allocation(
    inv,
    first,
    last,
    travellers.length,
    input,
  );
  const missing: string[] = [];
  const title = input.title || "Eritrea itinerary for " + travellers[0].name;
  if (!input.entry) missing.push("Port of entry");
  if (!input.flight) missing.push("Arrival flight or overland arrival details");
  if (days.length < 2)
    missing.push("At least an arrival day and a departure day");
  const prop = (key: string) => inv.hotels.find((h) => h.id === key);
  days.forEach((d, i) => {
    if (
      !validDate(d.date) ||
      (i > 0 && offsetDate(days[i - 1].date, 1) !== d.date)
    )
      missing.push(
        "Day " + (i + 1) + ": check the date and include every day in sequence",
      );
    if (!d.route) missing.push("Day " + (i + 1) + ": route");
    if (i === days.length - 1) return;
    if (d.lodging === "unknown" || (d.lodging === "hotel" && !prop(d.hotelId)))
      missing.push(
        "Night " +
          (i + 1) +
          ": select a property or another overnight arrangement",
      );
  });
  const passportSet = new Set<string>();
  for (const [i, t] of travellers.entries()) {
    for (const [field, label] of Object.entries({
      name: "full passport name",
      passport: "passport number",
      nationality: "nationality",
      birth: "date of birth",
      expiry: "passport expiry",
      sex: "sex as recorded on passport",
      occupation: "occupation",
    })) {
      const v = t[field as keyof typeof t];
      if (!v || /^(pending|unknown|n\/a|to confirm)(?:$|[- ])/i.test(v))
        missing.push((t.name || "Traveller " + (i + 1)) + ": " + label);
    }
    if (t.birth && (!validDate(t.birth) || t.birth >= first))
      missing.push(t.name + ": check birth date");
    if (t.expiry && (!validDate(t.expiry) || t.expiry < last))
      missing.push(t.name + ": check passport expiry");
    if (t.passport && passportSet.has(t.passport.toUpperCase()))
      missing.push("Duplicate passport on the manifest");
    passportSet.add(t.passport.toUpperCase());
  }
  if (!guide) missing.push("Available qualified guide");
  if (!driver)
    missing.push("Available qualified driver distinct from the guide");
  if (!vehicle)
    missing.push(
      "Available land vehicle with recorded capacity for travellers, guide and driver",
    );
  const rawLicense =
    driver?.onboardingData?.personal?.drivingLicenseNo ||
    driver?.drivingLicenseNo ||
    driver?.licenseNumber ||
    (driver?.id && input.licenceDriverId === driver.id
      ? input.verifiedLicence
      : "");
  if (driver && !rawLicense)
    missing.push("Driver licence number in staff record");
  if (vehicle && !vehicle.plateNumber)
    missing.push("Vehicle registration in fleet record");
  const stays = hotelStays(days);
  if (stays.some((s) => !s.rooms) && !input.rooms)
    missing.push("Room count, room types and meal basis");
  const ref = "VE-" + id.slice(0, 8).toUpperCase(),
    date = new Date().toISOString().slice(0, 10);
  const guests = travellers.map((t) => t.name).join(", ");
  const manifest = travellers
    .map(
      (t, i) =>
        `${i + 1}. ${pending(t.name)} · ${pending(t.nationality)} · passport ${pending(t.passport)} · born ${pending(t.birth)} · expires ${pending(t.expiry)} · sex ${pending(t.sex)} · occupation ${pending(t.occupation)}`,
    )
    .join("\n");
  const route = days
    .map(
      (d, i) =>
        `${d.date || "Day " + (i + 1)} — ${pending(d.route)}${i === days.length - 1 ? "" : "; overnight: " + (d.lodging === "hotel" ? pending(prop(d.hotelId)?.name) : d.lodging === "camp" ? "camping" : d.lodging === "other" ? "other lodging" : "[to confirm]")}`,
    )
    .join("\n");
  const close = BRAND.legalName + "\n" + BRAND.address + " · " + BRAND.email;
  const visa = `To the immigration authority\n\nWe request visa-on-arrival facilitation for the following traveller(s) visiting Eritrea for tourism from ${pending(first)} to ${pending(last)}. Arrival: ${pending(input.entry)}, ${pending(input.flight)}.\n\n${manifest}\n\nProgramme\n${route}\n\n${close}`;
  const name = (p?: Row) => p?.name || p?.fullName || "";
  const assigned = {
    guide: name(guide),
    driver: name(driver),
    vehicle: name(vehicle),
  };
  const assignment = `Trip: ${title} · ${ref}\nLead client: ${travellers[0].name} · ${travellers.length} traveller(s)\nDates: ${pending(first)} to ${pending(last)}\nGuide: ${pending(assigned.guide)} · ${pending(guide?.phone)}\nDriver: ${pending(assigned.driver)} · ${pending(driver?.phone)} · licence ${pending(rawLicense)}\nVehicle: ${pending(assigned.vehicle)} · ${pending(vehicle?.type)} · plate ${pending(vehicle?.plateNumber)}`;
  const permit = `To the Ministry of Tourism\n\nPlease consider this travel permit request for ${title}.\n\nTravel dates: ${pending(first)} to ${pending(last)}\n\nTraveller manifest\n${manifest}\n\nRoute and overnight stops\n${route}\n\n${assignment}\n\n${close}`;
  const documents = [
    { title: "Visa-on-arrival sponsorship request", body: visa },
  ];
  const writes: { id: string; collection: string; data: Row }[] = [];
  function add(collection: string, suffix: string, data: Row) {
    const key = "trip-" + id + "-" + suffix;
    writes.push({
      id: key,
      collection,
      data: { ...data, id: key, tripPacketId: id },
    });
  }
  const uniqueHotels = [...new Set(stays.map((s) => s.hotelId))];
  for (const [index, hid] of uniqueHotels.entries()) {
    const h = prop(hid);
    if (!h) continue;
    const visits = stays.filter((s) => s.hotelId === hid);
    const dates = visits
      .map(
        (s) =>
          `Check in ${pending(s.start)} · check out ${pending(s.end)} · ${s.nights} night(s) · ${pending(s.rooms || input.rooms)}`,
      )
      .join("\n");
    const letter = `To the reservations desk, ${h.name}\n\nPlease confirm availability and quote your rate for ${travellers.length} guest(s).\nGuests: ${guests}\n${dates}\n\nPlease reply with your confirmation reference, meal basis and cancellation terms.\n\n${close}`;
    documents.push({ title: "Reservation request · " + h.name, body: letter });
    add("hotelLetters", "hotel-" + index, {
      refNumber: ref + "-H" + (index + 1),
      hotelId: hid,
      hotelName: h.name,
      hotelNameTigrinya: h.nameTigrinya || "",
      city: h.city,
      date,
      status: "Draft",
      tourPackageTitle: title,
      subjectTigrinya: "ጠለብ ምሓዝ ክፍልታት",
      salutationTigrinya: "ናብ ምምሕዳር ሆቴል",
      openingTigrinya: "በጃኹም ነዞም ዝስዕቡ ኣጋይሽ ክፍልታት ከም ዘለዉ ኣረጋግጹልና።",
      closingTigrinya: "ብኽብሪ",
      agencyNameTigrinya: BRAND.legalName,
      signoffTigrinya: "",
      notes: letter,
      guests: visits.map((s, j) => ({
        id: id + "-" + j,
        name: guests,
        noOfClients: travellers.length,
        roomType: s.rooms || input.rooms,
        reservedDate: s.start,
        nights: s.nights,
        remarks: "Check out " + s.end,
      })),
    });
  }
  documents.push(
    {
      title: "Guide, driver and vehicle assignment",
      body: assignment + "\n\n" + route,
    },
    { title: "Regional travel permit request", body: permit },
  );
  const lead = travellers[0];
  add("visaDocs", "visa", {
    docNumber: ref + "-V",
    referenceNumber: ref + "-V",
    touristName: lead.name,
    passportNumber: lead.passport,
    passportExpiry: lead.expiry,
    nationality: lead.nationality,
    gender: lead.sex,
    occupation: lead.occupation,
    dateOfBirth: lead.birth,
    tourPackageTitle: title,
    arrivalDate: first,
    departureDate: last,
    entryPort: input.entry,
    arrivalFlight: input.flight,
    issuanceStatus: "Draft",
    letterDate: date,
    generatedAt: date,
    touristsManifest: travellers.map((t) => ({
      name: t.name,
      passportNo: t.passport,
      nationality: t.nationality,
      gender: t.sex,
      job: t.occupation,
    })),
    notes: visa,
  });
  add("permits", "permit", {
    permitNumber: ref + "-P",
    zoneName: days.map((d) => d.route).join(" / "),
    tourPackageTitle: title,
    leadGuideName: assigned.guide,
    leadGuideId: guide?.id || "",
    leadGuidePhone: guide?.phone || "",
    guideLicenseNo: guide?.guideLicenseNo || "",
    touristNames: travellers.map((t) => t.name),
    touristPassports: travellers.map((t) => t.passport),
    validFrom: first,
    validTo: last,
    vehiclePlate: vehicle?.plateNumber || "",
    vehicleType: vehicle?.type || "",
    authorityOffice: BRAND.tourismAuthority,
    status: "Pending",
    issuedAt: "",
    letterDate: date,
    touristsManifest: travellers.map((t, i) => ({
      number: i + 1,
      name: t.name,
      nationality: t.nationality,
      passportNumber: t.passport,
      sex: t.sex,
      tourDate: first + " – " + last,
      tourPlace: days.map((d) => d.route).join(" / "),
    })),
    driversManifest: driver
      ? [
          {
            driverName: assigned.driver,
            phoneNumber: driver.phone,
            licenseNumber: rawLicense,
            vehicleType: vehicle?.type,
            plateNumber: vehicle?.plateNumber,
          },
        ]
      : [],
    itineraryStops: days.map((d, i) => ({
      id: id + "-" + i,
      place: d.route,
      tourDate: d.date,
      hotel: prop(d.hotelId)?.name || "",
    })),
    notes: permit,
  });
  add("tourBookings", "tour", {
    bookingRef: ref,
    clientName: lead.name,
    touristName: lead.name,
    packageTitle: title,
    startDate: first,
    endDate: last,
    travelersCount: travellers.length,
    tourType: "Custom Tour",
    status: "Pending",
    createdAt: date,
    guideId: guide?.id,
    assignedGuideId: guide?.id,
    guideName: assigned.guide,
    assignedGuideName: assigned.guide,
    driverId: driver?.id,
    assignedDriverId: driver?.id,
    driverName: assigned.driver,
    assignedDriverName: assigned.driver,
    vehicleId: vehicle?.id,
    assignedVehicleId: vehicle?.id,
    vehicleName: assigned.vehicle,
    assignedVehicleName: assigned.vehicle,
    hotelName: uniqueHotels
      .map((k) => prop(k)?.name)
      .filter(Boolean)
      .join(", "),
    costLines: [],
  });
  const result: TripResult = {
    reference: ref,
    documents,
    missing: [...new Set(missing)],
    allocation: assigned,
    driverId: driver?.id,
    fingerprint: digest([
      input,
      assigned,
      guide?.id,
      driver?.id,
      vehicle?.id,
      documents,
      missing,
    ]),
  };
  return { result, writes };
}

export async function tripDesk(
  req: ApiRequest,
  action: string,
  user: { role: string; username: string },
): Promise<ApiResponse> {
  if (!canPrepareTrip(user.role))
    return reply(403, { error: "Tour operations access required." });
  const db = await getDb();
  const own = (r: any) =>
    user.role !== "TOUR_OPS" || r.createdBy === user.username;
  if (req.method === "GET" && action === "list") {
    const where =
      user.role === "TOUR_OPS"
        ? and(
            eq(records.collection, packetCollection),
            eq(records.createdBy, user.username),
          )
        : eq(records.collection, packetCollection);
    const rows = await db
      .select({
        id: records.id,
        name: sql`data->'input'->'travellers'->0->>'name'`,
        title: sql`data->'input'->>'title'`,
        state: sql`data->>'state'`,
        at: records.updatedAt,
      })
      .from(records)
      .where(where)
      .orderBy(sql`updated_at desc`);
    return reply(200, { rows });
  }
  const id = req.method === "GET" ? action : req.body?.id;
  if (typeof id !== "string" || !/^[-0-9a-f]{36}$/i.test(id))
    return reply(400, { error: "Invalid trip reference." });
  const [old] = await db
    .select()
    .from(records)
    .where(and(eq(records.collection, packetCollection), eq(records.id, id)));
  if (old && !own(old))
    return reply(403, { error: "This trip belongs to another desk." });
  if (req.method === "GET")
    return old
      ? reply(200, old.data)
      : reply(404, { error: "Trip not found." });
  if (req.method !== "POST" || !["preview", "draft", "file"].includes(action))
    return reply(405, { error: "Unknown trip action." });
  if (old?.data?.state === "Filed")
    return action === "file"
      ? reply(200, old.data)
      : reply(409, { error: "This trip has already been filed." });
  let input: TripInput;
  try {
    input = parseInput(req.body.input);
  } catch (err) {
    return reply(400, { error: (err as Error).message });
  }
  const [clock] = await db
    .select()
    .from(records)
    .where(
      and(eq(records.collection, clockCollection), eq(records.id, "clock")),
    );
  const revision = clock?.data?.version || "";
  const collections = [
    "hotels",
    "employees",
    "vehicles",
    "tourBookings",
    "tourists",
    "schedules",
    "vehicleOutwardRentals",
    "expeditions",
    "touristActivities",
  ];
  const rows = await db
    .select({
      id: records.id,
      collection: records.collection,
      data: sql`${records.data} - ARRAY['image','avatar','scannedDocumentUrl','documents','recentLogs','gallery','roomTypes']::text[]`,
    })
    .from(records)
    .where(inArray(records.collection, collections));
  const inv: Inventory = Object.fromEntries(collections.map((k) => [k, []]));
  for (const r of rows) inv[r.collection].push({ ...r.data, id: r.id });
  const { result, writes } = buildTrip(input, inv, id);
  if (action === "preview") return reply(200, result);
  if ((req.body.version || "") !== (old?.data?.version || ""))
    return reply(409, {
      error: "The saved draft changed. Reopen it before saving.",
    });
  if (
    action === "file" &&
    (result.missing.length || result.fingerprint !== req.body.fingerprint)
  )
    return reply(409, {
      error:
        "Review the latest dates, crew, vehicle and missing information before filing.",
    });
  const version = randomUUID();
  const packet = {
    id,
    input,
    result,
    state: action === "file" ? "Filed" : "Draft",
    version,
  };
  const actor = user.username;
  if (action === "draft") {
    const guard = sql`records.data->>'version' = ${req.body.version || ""} AND records.data->>'state' = 'Draft'`;
    const saved = await db
      .insert(records)
      .values({
        collection: packetCollection,
        id,
        data: packet,
        createdBy: actor,
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: [records.collection, records.id],
        set: { data: packet, updatedBy: actor, updatedAt: sql`now()` },
        setWhere: guard,
      })
      .returning({ id: records.id });
    return saved.length
      ? reply(200, packet)
      : reply(409, { error: "Draft changed. Reopen it before saving." });
  }
  // A single statement works on both Netlify HTTP Postgres and local Postgres.
  // Compare-and-swap serializes competing dispatches without leaving resource locks behind.
  const tripKey = digest([
    normalize(input.travellers[0].passport),
    normalize(input.travellers[0].nationality),
    input.days[0].date,
    input.days.at(-1)?.date,
  ]);
  writes.push({
    id: tripKey,
    collection: "itineraryFiledTrips",
    data: { id: tripKey, packetId: id },
  });
  const payload = JSON.stringify(writes);
  try {
    const filed = await db.execute(sql`
      WITH gate AS (
        INSERT INTO records (collection,id,data,created_by,updated_by) VALUES (${clockCollection},'clock',jsonb_build_object('version',${version}::text),${actor},${actor})
        ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data,updated_at=now()
        WHERE records.data->>'version'=${revision} RETURNING id
      ), packet AS (
        INSERT INTO records (collection,id,data,created_by,updated_by) SELECT ${packetCollection},${id},${JSON.stringify(packet)}::jsonb,${actor},${actor} FROM gate
        ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by,updated_at=now()
        WHERE records.data->>'version'=${req.body.version || ""} AND records.data->>'state'='Draft' RETURNING id
      ) INSERT INTO records (collection,id,data,created_by,updated_by)
        SELECT r.collection,r.id,r.data,${actor},${actor} FROM packet CROSS JOIN jsonb_to_recordset(${payload}::jsonb) AS r(collection text,id text,data jsonb) RETURNING id`);
    if (!(filed.rows ?? filed).length)
      return reply(409, {
        error: "Dispatch changed during review. Preview the trip again.",
      });
  } catch (err: any) {
    if (err.code === "23505" || err.cause?.code === "23505")
      return reply(409, {
        error:
          "This party and travel period already have a filed packet. Check saved trips.",
      });
    throw err;
  }
  return reply(200, packet);
}
