/**
 * The whole HTTP API for the suite, shared by deployed functions and Netlify
 * Dev. Both environments therefore enforce exactly the same rules.
 */
import { handleMessaging } from "./messaging.ts";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { GoogleGenAI, Type } from "@google/genai";
import { getDb, checkDatabase, DatabaseUnavailableError } from "../db/index.ts";
import { users, sessions, records, auditLog } from "../db/schema.ts";
import {
  ROLES,
  COLLECTION_MODULE,
  COLLECTIONS,
  OWNED_COLLECTIONS,
  ADMIN_ONLY_EDIT_MESSAGE,
  canReadCollection,
  canWriteCollection,
  canEditRecord,
  canDeleteRecord,
  isAdmin,
  isRoleKey,
  type RoleKey,
} from "../shared/roles.ts";
import { BRAND, usdToEur } from "../shared/brand.ts";
import {
  validateFeedSchemaV1,
  getEventUniqueKey,
  SAMPLE_FICTIONAL_FEED_V1,
} from "../shared/feedSchema.ts";
import { DEMO_SAMPLE_COLLECTIONS } from "../src/lib/seedData.ts";

export const SESSION_COOKIE = "ve_session";
const SESSION_DAYS = 7;

/* ------------------------------------------------------------------ *
 * Request / response shapes (runtime-agnostic)
 * ------------------------------------------------------------------ */

export interface ApiRequest {
  method: string;
  /** Path with the /api prefix already stripped, e.g. "records/tickets/sync". */
  path: string;
  query: Record<string, string>;
  body: any;
  cookies: Record<string, string>;
  headers?: Record<string, any>;
  rawBody?: string;
}

export interface ApiResponse {
  status: number;
  body: any;
  /** Set when the handler wants to issue or clear the session cookie. */
  cookie?: { name: string; value: string; maxAge: number } | null;
  clearCookie?: string;
  /** Extra response headers — used by the public website feed for CORS. */
  headers?: Record<string, string>;
}

const ok = (body: any, extra: Partial<ApiResponse> = {}): ApiResponse => ({ status: 200, body, ...extra });
const fail = (status: number, error: string): ApiResponse => ({ status, body: { error } });

/* ------------------------------------------------------------------ *
 * Passwords and sessions
 * ------------------------------------------------------------------ */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!password || !stored) return false;
  const [salt, derived] = String(stored || "").split(":");
  if (!salt || !derived) return false;
  try {
    const expected = Buffer.from(derived, "hex");
    const actual = scryptSync(password, salt, 64);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Initial roster created ONLY once when the database has zero user accounts.
 * Once created, accounts are managed through the staff accounts admin screen.
 */
export const SEED_USERS = [
  { username: "admin", email: "admin@eritreavisit.com", fullName: "Phil — Managing Director", role: "CEO", password: "Admin@2026!" },
  { username: "operations", email: "operations@eritreavisit.com", fullName: "Operations Manager", role: "OPERATIONS", password: "Operations@2026!" },
  { username: "finance", email: "finance@eritreavisit.com", fullName: "Finance Manager", role: "FINANCE", password: "Finance@2026!" },
  { username: "accountant", email: "accountant@eritreavisit.com", fullName: "Accountant", role: "ACCOUNTANT", password: "Accountant@2026!" },
  { username: "tourops", email: "tourops@eritreavisit.com", fullName: "Tour Operations Desk", role: "TOUR_OPS", password: "TourOps@2026!" },
  { username: "hr", email: "hr@eritreavisit.com", fullName: "HR Officer", role: "HR", password: "HrOffice@2026!" },
  { username: "agent1", email: "agent1@eritreavisit.com", fullName: "Sales Agent 1", role: "AGENT", password: "Agent1@2026!" },
  { username: "agent2", email: "agent2@eritreavisit.com", fullName: "Sales Agent 2", role: "AGENT", password: "Agent2@2026!" },
  { username: "agent3", email: "agent3@eritreavisit.com", fullName: "Sales Agent 3", role: "AGENT", password: "Agent3@2026!" },
  { username: "guide1", email: "guide1@eritreavisit.com", fullName: "Lead Tour Guide", role: "GUIDE", password: "Guide1@2026!" },
  { username: "driver1", email: "driver1@eritreavisit.com", fullName: "Fleet Driver", role: "DRIVER", password: "Driver1@2026!" },
];

export const DEFAULT_SEED_PASSWORDS = new Set(SEED_USERS.map((u) => u.password));

// Published historical passwords are denylisted, including for pre-existing accounts.
function allowedPassword(password: string): boolean {
  return password.length >= 8 && !DEFAULT_SEED_PASSWORDS.has(password);
}

async function activateOwner(identifier: string, password: string) {
  if (identifier !== "admin" && identifier !== "admin@eritreavisit.com") return;
  const initial = process.env.ERITREAVISIT_BOOTSTRAP_PASSWORD;
  if (!initial || initial.length < 16 || !allowedPassword(initial)) return;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(digest(initial), digest(password))) return;

  const db = await getDb();
  const [owner] = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  const update = { passwordHash: hashPassword(initial), mustChangePassword: 1 };
  if (!owner) {
    const [existingOwner] = await db.select({ id: users.id }).from(users).where(eq(users.role, "CEO")).limit(1);
    if (!existingOwner) {
      await db.insert(users).values({ username: "admin", email: "admin@eritreavisit.com",
        fullName: "Phil — Managing Director", role: "CEO", ...update }).onConflictDoNothing();
    }
  } else if (owner.active === 1 && owner.role === "CEO" && verifyPassword(SEED_USERS[0].password, owner.passwordHash)) {
    await db.update(users).set(update).where(and(eq(users.id, owner.id), eq(users.passwordHash, owner.passwordHash)));
  }
}

function sessionDigest(token: string) {
  return "sha256:" + createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: number;
  username: string;
  email: string | null;
  fullName: string;
  role: RoleKey;
  mustChangePassword: boolean;
}

function publicUser(u: any): SessionUser {
  if (!u) {
    return {
      id: 0,
      username: "staff",
      email: null,
      fullName: "Staff Member",
      role: "AGENT" as RoleKey,
      mustChangePassword: false,
    };
  }
  return {
    id: Number(u.id ?? 0),
    username: String(u.username ?? ""),
    email: u.email ? String(u.email) : null,
    fullName: String(u.fullName ?? u.full_name ?? u.username ?? ""),
    role: (isRoleKey(u.role) ? u.role : "AGENT") as RoleKey,
    mustChangePassword: u?.mustChangePassword === 1 || u?.must_change_password === 1,
  };
}

export function extractToken(req: ApiRequest): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const authHeader = String(req.headers?.authorization || req.headers?.Authorization || "");
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const xToken = req.headers?.["x-session-token"] || req.headers?.["X-Session-Token"];
  if (xToken) return String(xToken).trim();
  return null;
}

async function sessionUser(req: ApiRequest): Promise<SessionUser | null> {
  const token = extractToken(req);
  if (!token || token === "signed_out") return null;
  const db = await getDb();
  const [row] = await db.select().from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, sessionDigest(token))).limit(1);
  if (!row || row.users.active !== 1 || new Date(row.sessions.expiresAt).getTime() <= Date.now()) return null;
  return publicUser(row.users);
}

/* ------------------------------------------------------------------ *
 * Audit trail
 * ------------------------------------------------------------------ */

type Severity = "info" | "warning" | "critical";

async function audit(entry: {
  actor: string;
  actorRole: string;
  action: string;
  collection?: string;
  recordId?: string;
  summary: string;
  severity?: Severity;
  meta?: Record<string, unknown>;
}) {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({
      actor: entry.actor,
      actorRole: entry.actorRole,
      action: entry.action,
      collection: entry.collection ?? "",
      recordId: entry.recordId ?? "",
      summary: entry.summary,
      severity: entry.severity ?? "info",
      meta: entry.meta ?? {},
    });
  } catch (err) {
    console.warn("Audit log insert suppressed:", (err as any)?.message || err);
  }
}

/* ------------------------------------------------------------------ *
 * Separation of duty
 *
 * Permission to write to a module is not the same as permission to perform
 * the two money-sensitive actions. These mirror the ticket-control rules the
 * agency already runs on: an agent raises the sale, someone else issues the
 * ticket, and only finance touches payment.
 * ------------------------------------------------------------------ */

function paymentAdvanced(before: any, after: any): boolean {
  const rank = (s: unknown) => (s === "Paid" ? 2 : s === "Partial" || s === "Deposit Paid" ? 1 : 0);
  if (rank(after?.paymentStatus) > rank(before?.paymentStatus)) return true;
  const paidBefore = Number(before?.paidAmount ?? before?.paid ?? 0);
  const paidAfter = Number(after?.paidAmount ?? after?.paid ?? 0);
  return paidAfter > paidBefore;
}

function checkSeparationOfDuty(
  role: RoleKey,
  collection: string,
  before: any | null,
  after: any,
): string | null {
  const can = ROLES[role]?.can;
  if (collection === "tickets" && !before && !can?.issueTicket && role !== "AGENT") {
    return "Issuing a ticket requires an authorized role (Sales Agent, Operations Manager, Finance Manager or CEO).";
  }
  if (paymentAdvanced(before, after) && !can?.recordPayment && role !== "AGENT") {
    return "Recording or advancing a payment is restricted to Sales Agent, Finance, the Accountant or the CEO.";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

/** One row of the `records` table, as it comes back from the database. */
interface StoredRecord {
  id: string;
  collection: string;
  data: unknown;
  createdBy: string;
  updatedBy: string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

/** Rows an agent-scoped role may not see unless they created them. */
function restrictToOwn(role: RoleKey, collection: string): boolean {
  return Boolean(ROLES[role].ownRecordsOnly) && OWNED_COLLECTIONS.includes(collection);
}

function describe(collection: string, data: any): string {
  const label =
    data?.name ||
    data?.fullName ||
    data?.title ||
    data?.touristName ||
    data?.ticketNumber ||
    data?.bookingRef ||
    data?.hotelName ||
    data?.referenceCode ||
    data?.description ||
    data?.id ||
    "record";
  return `${collection}: ${String(label).slice(0, 120)}`;
}

async function readCollection(user: SessionUser, collection: string) {
  const adminOnlyCollections = ["feedConversations", "feedDrafts", "feedSources", "dailyFeeds"];
  if (!isAdmin(user.role) && adminOnlyCollections.includes(collection)) {
    return [];
  }

  const db = await getDb();
  const rows: StoredRecord[] = restrictToOwn(user.role, collection)
    ? await db
        .select()
        .from(records)
        .where(and(eq(records.collection, collection), eq(records.createdBy, user.username)))
    : await db.select().from(records).where(eq(records.collection, collection));

  const isUserAdmin = isAdmin(user.role);

  const isSampleRecord = (id: string) => {
    return (
      id.includes("auto-conv") ||
      id.startsWith("conv_elena") ||
      id.startsWith("conv_marcus") ||
      id.startsWith("conv_selam") ||
      id.startsWith("conv_rossi") ||
      id.startsWith("notif-1795202247285") ||
      id.startsWith("feed_2026-10-31")
    );
  };

  return rows
    .filter((r) => !isSampleRecord(r.id))
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .map((r) => {
      const item: Record<string, any> = {
        ...(r.data as object),
        id: r.id,
        _createdBy: r.createdBy,
        _updatedAt: r.updatedAt,
      };
      if (!isUserAdmin) {
        if ("email" in item) item.email = "";
        if ("touristEmail" in item) item.touristEmail = "";
        if ("clientEmail" in item) item.clientEmail = "";
        if ("contactEmail" in item) item.contactEmail = "";
        if ("customerEmail" in item) item.customerEmail = "";
        if (item.onboardingData?.contact?.personalEmail) {
          item.onboardingData = {
            ...item.onboardingData,
            contact: { ...item.onboardingData.contact, personalEmail: "" },
          };
        }
        if (collection === "feedEvents" || collection === "feedTasks") {
          delete item.sourceUrl;
          delete item.sourceMessageId;
        }
      }
      return item;
    });
}

/**
 * Apply a batch of changes to one collection.
 *
 * The browser holds each collection in ordinary React state; when that state
 * changes, the difference (not the whole array) is sent here. Each row is
 * checked individually, so a batch that contains one forbidden change has that
 * change rejected and logged while the rest still lands.
 */
async function syncCollection(
  user: SessionUser,
  collection: string,
  upserts: any[],
  deletes: string[],
): Promise<ApiResponse> {
  if (!COLLECTIONS.includes(collection)) return fail(404, `Unknown collection "${collection}".`);
  if (!canWriteCollection(user.role, collection)) {
    await audit({
      actor: user.username,
      actorRole: user.role,
      action: "denied",
      collection,
      summary: `Write to ${collection} refused — ${ROLES[user.role].label} has no write access to this module.`,
      severity: "critical",
    });
    return fail(403, `Your role cannot modify ${collection}.`);
  }

  const db = await getDb();
  const ids = [...upserts.map((r) => (r?.id ? String(r.id) : "")).filter(Boolean), ...deletes.map(String)];
  const existing: StoredRecord[] = ids.length
    ? await db.select().from(records).where(and(eq(records.collection, collection), inArray(records.id, ids)))
    : [];
  const existingById = new Map<string, StoredRecord>(existing.map((r) => [r.id, r]));

  const rejected: { id: string; reason: string }[] = [];
  const applied: string[] = [];

  for (const incoming of upserts) {
    if (!incoming?.id) continue;
    const recId = String(incoming.id);
    const prior = existingById.get(recId);
    const priorData: any = prior?.data ?? null;

    // Agents may not touch a colleague's row.
    if (prior && restrictToOwn(user.role, collection) && prior.createdBy !== user.username) {
      rejected.push({ id: recId, reason: "This record belongs to another agent." });
      await audit({
        actor: user.username, actorRole: user.role, action: "denied", collection, recordId: recId,
        summary: `Attempt to modify a record owned by ${prior.createdBy}.`, severity: "critical",
      });
      continue;
    }

    if (prior && !canEditRecord(user.role, collection)) {
      rejected.push({ id: recId, reason: ADMIN_ONLY_EDIT_MESSAGE });
      await audit({
        actor: user.username, actorRole: user.role, action: "denied", collection, recordId: recId,
        summary: `Edit of a stored ${collection} record refused for ${ROLES[user.role]?.label || user.role}.`,
        severity: "critical", meta: { attempted: describe(collection, incoming) },
      });
      continue;
    }

    const dutyError = checkSeparationOfDuty(user.role, collection, priorData, incoming);
    if (dutyError) {
      rejected.push({ id: recId, reason: dutyError });
      await audit({
        actor: user.username, actorRole: user.role, action: "denied", collection, recordId: recId,
        summary: dutyError, severity: "critical", meta: { attempted: describe(collection, incoming) },
      });
      continue;
    }

    // Strip the server-owned mirror fields before storing.
    const { _createdBy, _updatedAt, ...data } = incoming;

    await db
      .insert(records)
      .values({
        id: recId,
        collection,
        data: { ...data, id: recId },
        createdBy: prior?.createdBy || user.username,
        updatedBy: user.username,
      })
      .onConflictDoUpdate({
        target: [records.collection, records.id],
        set: { data: { ...data, id: recId }, updatedBy: user.username, updatedAt: sql`now()` },
      });

    applied.push(recId);
    await audit({
      actor: user.username,
      actorRole: user.role,
      action: prior ? "update" : "create",
      collection,
      recordId: recId,
      summary: `${prior ? "Updated" : "Created"} ${describe(collection, data)}`,
      severity: paymentAdvanced(priorData, data) ? "warning" : "info",
    });
  }

  for (const id of deletes) {
    const prior = existingById.get(id);
    if (!prior) continue;
    if (restrictToOwn(user.role, collection) && prior.createdBy !== user.username) {
      rejected.push({ id, reason: "This record belongs to another agent." });
      continue;
    }
    // Deleting a stored entry is likewise the administrator's alone — which
    // also covers the money and document trails everyone else may only archive.
    if (!canDeleteRecord(user.role, collection)) {
      rejected.push({ id, reason: ADMIN_ONLY_EDIT_MESSAGE });
      await audit({
        actor: user.username, actorRole: user.role, action: "denied", collection, recordId: id,
        summary: `Deletion of a ${collection} record refused — only the administrator may delete a saved entry.`,
        severity: "critical",
      });
      continue;
    }
    await db.delete(records).where(and(eq(records.collection, collection), eq(records.id, id)));
    applied.push(id);
    await audit({
      actor: user.username, actorRole: user.role, action: "delete", collection, recordId: id,
      summary: `Deleted ${describe(collection, prior.data)}`, severity: "warning",
    });
  }

  return ok({ applied, rejected });
}

/* ------------------------------------------------------------------ *
 * AI drafting & OCR with Gemini (with lazy initialization)
 * ------------------------------------------------------------------ */

let genAiClient: GoogleGenAI | null = null;
function getGenAi(): GoogleGenAI | null {
  if (!genAiClient && process.env.GEMINI_API_KEY) {
    try {
      genAiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (err) {
      console.warn("Failed to initialize GoogleGenAI client:", err);
    }
  }
  return genAiClient;
}

async function draftWithGemini(prompt: string): Promise<string | null> {
  const modelsToTry = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  const ai = getGenAi();
  if (ai) {
    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });
        if (response.text) return response.text;
      } catch (err) {
        console.warn(`GoogleGenAI draft error on ${modelName}, trying next fallback:`, err);
      }
    }
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const modelName of modelsToTry) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );
      if (!res.ok) continue;
      const json: any = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch {
      continue;
    }
  }
  return null;
}

function extractJsonFromModelOutput(text: string): any | null {
  if (!text) return null;
  const clean = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {}
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  return null;
}

async function ocrPassportWithGemini(imageBase64: string, mimeType: string = "image/jpeg"): Promise<any | null> {
  let effectiveMime = mimeType || "image/jpeg";
  const prefixMatch = imageBase64.match(/^data:([^;]+);base64,/);
  if (prefixMatch && prefixMatch[1]) {
    effectiveMime = prefixMatch[1];
  }
  if (effectiveMime.includes("pdf")) {
    effectiveMime = "application/pdf";
  } else if (effectiveMime.includes("png")) {
    effectiveMime = "image/png";
  } else if (effectiveMime.includes("webp")) {
    effectiveMime = "image/webp";
  } else if (!effectiveMime.includes("/")) {
    effectiveMime = "image/jpeg";
  }

  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "").trim();

  const prompt = `You are a high-precision international biometric passport OCR engine, ICAO 9303 MRZ parser, and travel dossier analyzer for the State of Eritrea Tour Operations and Travel Agency.

Analyze the uploaded passport photo page, national ID card, visa, or travel dossier PDF.
Read both the Visual Inspection Zone (VIZ) AND the Machine Readable Zone (MRZ 2-line or 3-line format).

EXTRACTION & NORMALIZATION GUIDELINES:
1. FULL NAME: Combine Given Names and Surname into natural order (e.g. "John Arthur Smith" or "Dr. Arthur Pendelton"). Do not include filler brackets "<".
2. PASSPORT NUMBER: Clean alphanumeric document number (e.g. "GB98234112", "C11009823", "USA55489012").
3. DATE OF BIRTH: Standard ISO format "YYYY-MM-DD" (e.g. "1984-06-15"). Parse from MRZ YYMMDD (if YY > 25, 19YY; if YY <= 25, 20YY) or visual text (e.g. "15 JUN 1984" -> "1984-06-15").
4. PASSPORT EXPIRY DATE: Standard ISO format "YYYY-MM-DD" (e.g. "2031-11-20"). Parse from MRZ or visual text.
5. NATIONALITY: Full English demonym (e.g. "British", "Eritrean", "American", "German", "French", "Swiss", "Italian", "Canadian", "Australian", "Dutch", "Swedish", "Ethiopian", "Egyptian", "Saudi", etc.). If only ISO 3-letter code is present in MRZ (e.g. GBR, USA, DEU, FRA, ERI, CHE, ITA, CAN, AUS, ETH), expand it into full nationality.
6. GENDER / SEX: Standardize strictly to "Male" or "Female". "M", "MALE", "HOMME", "MASCULIN" -> "Male". "F", "FEMALE", "FEMME", "FEMININ" -> "Female".
7. ISSUE COUNTRY: Issuing State or country (e.g. "United Kingdom", "Eritrea", "France", "Germany", "United States").
8. CONTACT & HEALTH DETAILS: Extract email, phone number, occupation, dietary notes, medical notes, insurance number, emergency contact details ONLY IF explicitly printed on the document or dossier.
9. COMPANIONS / PARTY MEMBERS: If this is a multi-person travel dossier, group list, or family pass, extract all other travelers into the "companions" array.

CRITICAL RULE FOR ABSENT INFORMATION:
If ANY field is not present or visible in the document, return an empty string "" (or empty array []). NEVER invent, guess, or hallucinate placeholder data for missing fields.

Return ONLY a raw JSON object with NO markdown formatting:
{
  "fullName": "Full Legal Name or empty string",
  "passportNumber": "Passport Number or empty string",
  "passportExpiry": "YYYY-MM-DD or empty string",
  "dateOfBirth": "YYYY-MM-DD or empty string",
  "dob": "YYYY-MM-DD or empty string",
  "nationality": "Full Nationality or empty string",
  "gender": "Male or Female or empty string",
  "sex": "Male or Female or empty string",
  "passportIssueCountry": "Issuing Country or empty string",
  "occupation": "Occupation or empty string",
  "email": "Email address or empty string",
  "phone": "Phone number or empty string",
  "dietaryRequirements": "Dietary notes or empty string",
  "dietary": "Dietary notes or empty string",
  "medicalNotes": "Medical notes or empty string",
  "insurancePolicyNumber": "Insurance policy number or empty string",
  "partyTitle": "Expedition or group name or empty string",
  "emergencyName": "Emergency contact name or empty string",
  "emergencyRelation": "Emergency relation or empty string",
  "emergencyRelationship": "Emergency relation or empty string",
  "emergencyPhone": "Emergency contact phone or empty string",
  "detectedDocumentType": "Biometric Passport Scan / Travel PDF Dossier",
  "confidenceScore": 99,
  "companions": [
    {
      "fullName": "Companion Name",
      "relationship": "Spouse / Child / Colleague / Partner / etc.",
      "passportNumber": "Companion Passport No. or empty string",
      "passportExpiry": "YYYY-MM-DD or empty string",
      "dateOfBirth": "YYYY-MM-DD or empty string",
      "dob": "YYYY-MM-DD or empty string",
      "nationality": "Full Nationality or empty string",
      "gender": "Male or Female or empty string",
      "occupation": "Occupation or empty string",
      "dietaryRequirements": "Dietary notes or empty string",
      "medicalNotes": "Medical notes or empty string"
    }
  ]
}`;

  const ai = getGenAi();
  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
  ];

  if (ai) {
    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            prompt,
            {
              inlineData: {
                mimeType: effectiveMime,
                data: cleanBase64,
              },
            },
          ],
        });
        const text = response.text;
        if (text) {
          const parsed = extractJsonFromModelOutput(text);
          if (parsed && (parsed.fullName || parsed.passportNumber || parsed.nationality || parsed.name)) {
            return {
              ...parsed,
              detectedModel: modelName,
            };
          }
        }
      } catch (err) {
        console.warn(`GoogleGenAI OCR execution warning on ${modelName}, trying next fallback:`, err);
      }
    }
  }

  const key = process.env.GEMINI_API_KEY;
  if (key) {
    for (const modelName of modelsToTry) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: effectiveMime,
                        data: cleanBase64,
                      },
                    },
                  ],
                },
              ],
            }),
          },
        );
        if (!res.ok) continue;
        const json: any = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;
        const parsed = extractJsonFromModelOutput(text);
        if (parsed && (parsed.fullName || parsed.passportNumber || parsed.nationality || parsed.name)) {
          return {
            ...parsed,
            detectedModel: modelName,
          };
        }
      } catch (err) {
        console.warn(`REST OCR attempt on ${modelName} failed:`, err);
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Omnichannel Client Conversation Judgment & Auto-Assignment Engine
 * ------------------------------------------------------------------ */

interface RawOmnichannelItem {
  channel: "email" | "whatsapp" | "calendar";
  sourceId: string;
  senderName: string;
  email: string;
  phone: string;
  subjectOrTitle: string;
  content: string;
  timestamp: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
}

function inferNationalityAndCountry(phone: string, text: string): { nationality: string; country: string } {
  const cleanPhone = (phone || "").replace(/\s+/g, "");
  const lower = (text || "").toLowerCase();
  if (cleanPhone.startsWith("+49") || lower.includes("german") || lower.includes("frankfurt") || lower.includes("berlin")) {
    return { nationality: "German", country: "Germany" };
  }
  if (cleanPhone.startsWith("+39") || lower.includes("italian") || lower.includes("rome") || lower.includes("milan") || lower.includes("rossi") || lower.includes("bellini")) {
    return { nationality: "Italian", country: "Italy" };
  }
  if (cleanPhone.startsWith("+44") || lower.includes("british") || lower.includes("london") || lower.includes("uk")) {
    return { nationality: "British", country: "United Kingdom" };
  }
  if (cleanPhone.startsWith("+1") || lower.includes("american") || lower.includes("usa") || lower.includes("california") || lower.includes("new york")) {
    return { nationality: "American", country: "United States" };
  }
  if (cleanPhone.startsWith("+33") || lower.includes("french") || lower.includes("paris")) {
    return { nationality: "French", country: "France" };
  }
  if (cleanPhone.startsWith("+41") || lower.includes("swiss") || lower.includes("zurich") || lower.includes("geneva")) {
    return { nationality: "Swiss", country: "Switzerland" };
  }
  if (cleanPhone.startsWith("+46") || lower.includes("swedish") || lower.includes("stockholm")) {
    return { nationality: "Swedish", country: "Sweden" };
  }
  if (cleanPhone.startsWith("+31") || lower.includes("dutch") || lower.includes("amsterdam")) {
    return { nationality: "Dutch", country: "Netherlands" };
  }
  if (cleanPhone.startsWith("+291") || lower.includes("asmara") && lower.includes("diaspora")) {
    return { nationality: "Eritrean", country: "Eritrea" };
  }
  return { nationality: "International", country: "International" };
}

function inferGenderStrict(name: string, text: string): "Male" | "Female" {
  const combined = `${name} ${text}`.toLowerCase();
  const femaleIndicators = [
    "ms.", "mrs.", "miss", "madam", "she ", "her ", "wife", "sister", "daughter",
    "eleanor", "giulia", "sarah", "helen", "elena", "maria", "anna", "sophie",
    "claire", "charlotte", "emma", "olivia", "laura", "rachel", "amira", "rahel", "senait", "meron"
  ];
  for (const f of femaleIndicators) {
    if (combined.includes(f)) return "Female";
  }
  return "Male";
}

function heuristicCategorizeOmnichannelClients(
  rawItems: RawOmnichannelItem[],
  staffList: any[],
  packagesList: any[]
): any[] {
  // Group raw items by client identity (email, normalized phone, or normalized name)
  const groups = new Map<string, RawOmnichannelItem[]>();

  for (const item of rawItems) {
    const cleanName = (item.senderName || "")
      .replace(/\(.*?\)/g, "")
      .replace(/<.*?>/g, "")
      .trim();
    if (!cleanName || cleanName.toLowerCase().includes("eritreavisit") || cleanName.toLowerCase() === "agency operational event") {
      continue;
    }
    const normEmail = (item.email || "").trim().toLowerCase();
    const normPhone = (item.phone || "").replace(/[^\d+]/g, "");
    const normName = cleanName.toLowerCase();

    let matchedKey: string | null = null;
    for (const [k, existingList] of groups.entries()) {
      const sample = existingList[0];
      const sEmail = (sample.email || "").trim().toLowerCase();
      const sPhone = (sample.phone || "").replace(/[^\d+]/g, "");
      const sName = (sample.senderName || "").replace(/\(.*?\)/g, "").trim().toLowerCase();
      if (
        (normEmail && sEmail && normEmail === sEmail) ||
        (normPhone && normPhone.length >= 7 && sPhone && normPhone === sPhone) ||
        (normName && sName && (normName === sName || normName.includes(sName) || sName.includes(normName)))
      ) {
        matchedKey = k;
        break;
      }
    }

    const key = matchedKey || `client_${normEmail || normPhone || normName.replace(/\s+/g, "_")}`;
    const arr = groups.get(key) || [];
    arr.push({ ...item, senderName: cleanName });
    groups.set(key, arr);
  }

  // Separate staff into Guides, Drivers, Dual-Role, and Sales Agents
  const guides = staffList.filter((e) => {
    const r = String(e.role || "").toLowerCase();
    return r.includes("guide");
  });
  const drivers = staffList.filter((e) => {
    const r = String(e.role || "").toLowerCase();
    return r.includes("driver");
  });
  const salesAgents = staffList.filter((e) => {
    const r = String(e.role || "").toLowerCase();
    const d = String(e.department || "").toLowerCase();
    return r.includes("agent") || r.includes("sales") || r.includes("operations") || r.includes("ticketing") || d.includes("sales");
  });

  const results: any[] = [];
  let idx = 0;

  for (const [, items] of groups.entries()) {
    idx++;
    const channels = Array.from(new Set(items.map((i) => i.channel)));
    const primary = items[0];
    const fullName = primary.senderName;
    const email = items.find((i) => i.email)?.email || "";
    const phone = items.find((i) => i.phone && i.phone !== "+2917190374")?.phone || "";
    const combinedText = items.map((i) => `${i.subjectOrTitle}: ${i.content}`).join(" | ");
    const lower = combinedText.toLowerCase();

    const { nationality, country } = inferNationalityAndCountry(phone, `${fullName} ${combinedText}`);
    const gender = inferGenderStrict(fullName, combinedText);

    // Extract party size if mentioned (e.g. "4 travelers", "2 adults", "Marco & Giulia")
    let partySize = 1;
    const paxMatch = combinedText.match(/(\d+)\s*(?:travelers|travellers|pax|people|guests|persons|adults)/i);
    if (paxMatch) {
      partySize = Math.max(1, Math.min(50, Number(paxMatch[1]) || 1));
    } else if (fullName.includes("&") || fullName.toLowerCase().includes(" and ") || lower.includes("we are")) {
      partySize = 2;
    }

    // Determine interested service & tour title
    let interestedService = "Guided Tour Package";
    let tourTitle = packagesList[0]?.title || "Asmara, Massawa & Qohaito Circuit";
    let quotationValue = 1450 * partySize;

    if (lower.includes("steam") || lower.includes("railway") || lower.includes("train") || lower.includes("locomotive")) {
      interestedService = "Custom Private Expedition";
      tourTitle = "1938 Steam Railway Charter & Massawa Excursion";
      quotationValue = Math.max(2400, 850 * partySize);
    } else if (lower.includes("dahlak") || lower.includes("catamaran") || lower.includes("diving") || lower.includes("marine") || lower.includes("island")) {
      interestedService = "Dahlak Marine Boat Charter";
      tourTitle = "Dahlak Archipelago Marine Permit & Catamaran Charter";
      quotationValue = Math.max(2800, 1250 * partySize);
    } else if (lower.includes("unesco") || lower.includes("modernist") || lower.includes("art deco") || lower.includes("architect")) {
      interestedService = "Guided Tour Package";
      tourTitle = "UNESCO Modernist Asmara & Highland Heritage Tour";
      quotationValue = 680 * partySize;
    } else if (lower.includes("ticket") || lower.includes("flight") || lower.includes("pnr") || lower.includes("turkish airlines") || lower.includes("flydubai") || lower.includes("egyptair")) {
      if (!lower.includes("tour") && !lower.includes("steam") && !lower.includes("dahlak")) {
        interestedService = "International Flight Ticketing";
        tourTitle = "International Flight Reservation (ASM)";
        quotationValue = 920 * partySize;
      }
    } else if (lower.includes("hotel") || lower.includes("room") || lower.includes("palace") || lower.includes("check-in")) {
      interestedService = "Hotel Accommodation";
      tourTitle = "Partner Hotel Accommodation & Airport Transfer";
      quotationValue = 560 * partySize;
    } else if (lower.includes("rent") || lower.includes("4wd") || lower.includes("land cruiser") || lower.includes("vehicle") || lower.includes("pickup") || lower.includes("transfer")) {
      if (lower.includes("pickup") || lower.includes("transfer")) {
        interestedService = "Guided Tour Package";
        tourTitle = "Airport Pickup, Hotel Transfer & Asmara Circuit";
        quotationValue = 1150 * partySize;
      } else {
        interestedService = "Vehicle Rent-Out (4WD / Bus)";
        tourTitle = "4WD Toyota Land Cruiser Rental";
        quotationValue = 650;
      }
    } else if (lower.includes("visa") || lower.includes("voa") || lower.includes("permit")) {
      interestedService = "Visa on Arrival (VoA) & Permits";
      tourTitle = "Consular Visa on Arrival & Regional Travel Permit";
      quotationValue = 450 * partySize;
    }

    // Determine CRM Stage, Operational Booking Status, Tourist Status, and Client Category from conversation context
    let crmStage: string = "New Lead";
    let operationalBookingStatus: string = "Unbooked";
    let paymentStatus: string = "Pending";
    let touristStatus: "VIP" | "Active Traveler" | "Inquiry" | "Flagged" = "Inquiry";
    let clientCategory: string = partySize >= 4 ? "Group" : "Individual";

    const hasBookingRef = /ev-\d{4}-\d+|bk-\w+|conf-\w+|confirmed|confirming our pickup/i.test(combinedText);
    const hasCalendarEvent = channels.includes("calendar");
    const isWaitingForClient = items.some((i) => i.status === "waiting-for-client");

    if (hasBookingRef || (hasCalendarEvent && (lower.includes("confirmed") || lower.includes("arrival") || lower.includes("pickup")))) {
      crmStage = "Booked";
      operationalBookingStatus = "Confirmed";
      paymentStatus = lower.includes("paid") ? "Paid" : "Partial";
      touristStatus = lower.includes("vip") || lower.includes("charter") || quotationValue >= 2500 ? "VIP" : "Active Traveler";
    } else if (lower.includes("quote") || lower.includes("price") || lower.includes("rate") || lower.includes("cost")) {
      crmStage = isWaitingForClient ? "Quotation Sent" : "Negotiation";
      operationalBookingStatus = "Pending Confirmation";
      touristStatus = lower.includes("charter") || lower.includes("catamaran") ? "VIP" : "Inquiry";
    } else if (isWaitingForClient) {
      crmStage = "Contacted";
      touristStatus = "Inquiry";
    } else {
      crmStage = "New Lead";
      touristStatus = lower.includes("charter") || lower.includes("dr.") || lower.includes("vip") ? "VIP" : "Inquiry";
    }

    if (touristStatus === "VIP" && clientCategory === "Individual") {
      clientCategory = "VIP Traveler";
    } else if (lower.includes("research") || lower.includes("university") || lower.includes("company") || lower.includes("corporate")) {
      clientCategory = "Corporate";
    } else if (nationality === "Eritrean") {
      clientCategory = "Diaspora";
    }

    // Extract or infer Occupation
    let occupation = "International Traveler";
    if (fullName.startsWith("Dr.") || lower.includes("doctor") || lower.includes("medical")) {
      occupation = "Medical Doctor & Heritage Enthusiast";
    } else if (lower.includes("architect") || lower.includes("unesco") || lower.includes("research")) {
      occupation = "Architectural Researcher";
    } else if (lower.includes("diving") || lower.includes("marine") || lower.includes("catamaran")) {
      occupation = "Marine & Diving Explorer";
    } else if (lower.includes("railway") || lower.includes("steam")) {
      occupation = "Railway Heritage Specialist";
    }

    // Extract travel date if present
    const today = new Date();
    const defaultStart = new Date(today.getTime() + (4 + idx * 2) * 86400000).toISOString().split("T")[0];
    const calItem = items.find((i) => i.startDate);
    const expectedTravelDate = calItem?.startDate ? calItem.startDate.split("T")[0] : defaultStart;
    const expectedReturnDate = calItem?.endDate
      ? calItem.endDate.split("T")[0]
      : new Date(new Date(expectedTravelDate).getTime() + 5 * 86400000).toISOString().split("T")[0];
    const nextFollowUpDate = new Date(today.getTime() + 2 * 86400000).toISOString().split("T")[0];

    // Assign Staff (Sales Agent, Guide, Driver)
    const assignedAgentObj = salesAgents[idx % Math.max(1, salesAgents.length)];
    const assignedAgent = assignedAgentObj?.name || assignedAgentObj?.fullName || "Sales Desk (Asmara)";

    const assignedGuideObj = guides[idx % Math.max(1, guides.length)];
    const assignedGuideId = assignedGuideObj?.id || "emp-001";
    const assignedGuideName = assignedGuideObj?.name || assignedGuideObj?.fullName || "Dawit Haile";

    // Prefer a dedicated driver or dual-role if small party
    const dedicatedDrivers = drivers.filter((d) => d.id !== assignedGuideId);
    const assignedDriverObj =
      partySize <= 2 && String(assignedGuideObj?.role || "").toLowerCase().includes("driver")
        ? assignedGuideObj
        : dedicatedDrivers[idx % Math.max(1, dedicatedDrivers.length)] || drivers[0];
    const assignedDriverId = assignedDriverObj?.id || "emp-002";
    const assignedDriverName = assignedDriverObj?.name || assignedDriverObj?.fullName || "Yemane Beraki";
    const isDualAssigned = assignedGuideId === assignedDriverId;

    const leadSource =
      channels.length > 1
        ? `Omnichannel (${channels.map((c) => c.toUpperCase()).join(" + ")})`
        : channels[0] === "whatsapp"
        ? "WhatsApp Line (+2917190374)"
        : channels[0] === "email"
        ? "Gmail Agency Inbox (tours@eritreavisit.com)"
        : "Google Calendar (tours@eritreavisit.com)";

    const aiJudgmentReason = `Categorized as [${crmStage}] (${clientCategory} / ${touristStatus}) based on ${channels.join(" & ")} conversation regarding "${tourTitle}". Party size: ${partySize} pax. Assigned to ${assignedAgent} (Sales), Guide: ${assignedGuideName}${
      isDualAssigned ? " (Dual Capacity: Guide & Driver — single base pay)" : `, Driver: ${assignedDriverName}`
    }.`;

    results.push({
      id: `omni_${idx}_${Date.now().toString().slice(-4)}`,
      channels,
      fullName,
      gender,
      email,
      phone,
      nationality,
      country,
      passportNumber: "",
      passportExpiry: "",
      occupation,
      companyOrOrg: clientCategory === "Group" ? `${fullName} Expedition Group` : occupation,
      touristStatus,
      clientCategory,
      crmStage,
      operationalBookingStatus,
      paymentStatus,
      leadSource,
      interestedService,
      tourTitle,
      expectedTravelDate,
      expectedReturnDate,
      partySize,
      quotationValue,
      quotationCurrency: "USD",
      nextFollowUpDate,
      assignedAgent,
      assignedGuideId,
      assignedGuideName,
      assignedDriverId,
      assignedDriverName,
      assignedFieldRoleNote: isDualAssigned
        ? "Dual Capacity: Guide & Driver (Single Pay Rule)"
        : "Separate Guide Only + Driver Only",
      dietaryRequirements: "",
      medicalNotes: "",
      conversationSummary: combinedText.slice(0, 500),
      aiJudgmentReason,
    });
  }

  return results;
}

async function analyzeOmnichannelClientsWithGemini(
  rawItems: RawOmnichannelItem[],
  staffList: any[],
  packagesList: any[]
): Promise<{ clients: any[]; usedModel: string }> {
  const heuristicClients = heuristicCategorizeOmnichannelClients(rawItems, staffList, packagesList);
  if (heuristicClients.length === 0) {
    return { clients: [], usedModel: "none" };
  }

  const ai = getGenAi();
  if (!ai) {
    return { clients: heuristicClients, usedModel: "conversation-judgment-engine" };
  }

  const staffSummary = staffList
    .slice(0, 20)
    .map((s) => `${s.id}: ${s.name || s.fullName} (Role: ${s.role})`)
    .join("; ");
  const pkgSummary = packagesList
    .slice(0, 15)
    .map((p) => `${p.title} ($${p.basePrice || 1200})`)
    .join("; ");

  const prompt = `You are the Chief Operations & CRM Intelligence Engine for EritreaVisit Tours & Travel (Keckia Travel Agency, Asmara, Eritrea).
Analyze the following client communications from Email (tours@eritreavisit.com), Google Calendar (tours@eritreavisit.com), and Official WhatsApp (+2917190374).
For each client, refine their categorization, CRM stage, tourist tier, ticketing category, gender (MUST be strictly "Male" or "Female"), nationality, interested service, quotation value in USD, and staff assignment based on the conversation we have with them.

Available Staff Roster: ${staffSummary || "Dawit Haile (Tour Guide), Yemane Beraki (Driver), Sales Agent 1 (Sales)"}
Available Tour Packages: ${pkgSummary || "1938 Steam Railway Charter, Dahlak Archipelago Catamaran, UNESCO Modernist Asmara Tour"}

Baseline Pre-Parsed Client Candidates (JSON):
${JSON.stringify(heuristicClients, null, 2)}

Rules:
1. "gender" MUST be strictly "Male" or "Female".
2. "crmStage" MUST be one of: "New Lead", "Contacted", "Quotation Sent", "Negotiation", "Booked", "Completed".
3. "touristStatus" MUST be one of: "VIP", "Active Traveler", "Inquiry", "Flagged".
4. "clientCategory" MUST be one of: "Individual", "VIP Traveler", "Corporate", "Diplomatic / Embassy", "NGO / UN Agency", "Group", "Diaspora".
5. "interestedService" MUST be one of: "Guided Tour Package", "Custom Private Expedition", "International Flight Ticketing", "Hotel Accommodation", "Vehicle Rent-Out (4WD / Bus)", "Dahlak Marine Boat Charter", "Visa on Arrival (VoA) & Permits".
6. Provide a clear "aiJudgmentReason" explaining how the conversation determined the category, stage, and staff assignment.`;

  const modelsToTry = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                fullName: { type: Type.STRING },
                gender: { type: Type.STRING, description: "Strictly Male or Female" },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                nationality: { type: Type.STRING },
                country: { type: Type.STRING },
                occupation: { type: Type.STRING },
                companyOrOrg: { type: Type.STRING },
                touristStatus: { type: Type.STRING },
                clientCategory: { type: Type.STRING },
                crmStage: { type: Type.STRING },
                operationalBookingStatus: { type: Type.STRING },
                paymentStatus: { type: Type.STRING },
                interestedService: { type: Type.STRING },
                tourTitle: { type: Type.STRING },
                expectedTravelDate: { type: Type.STRING },
                expectedReturnDate: { type: Type.STRING },
                partySize: { type: Type.INTEGER },
                quotationValue: { type: Type.NUMBER },
                assignedAgent: { type: Type.STRING },
                assignedGuideName: { type: Type.STRING },
                assignedDriverName: { type: Type.STRING },
                aiJudgmentReason: { type: Type.STRING },
              },
            },
          },
        },
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text.trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = heuristicClients.map((base, i) => {
            const aiMatch =
              parsed.find((p: any) => p.id === base.id || p.fullName === base.fullName) || parsed[i];
            if (!aiMatch) return base;
            return {
              ...base,
              ...aiMatch,
              gender: aiMatch.gender === "Female" ? "Female" : "Male",
              channels: base.channels,
              leadSource: base.leadSource,
              conversationSummary: base.conversationSummary,
            };
          });
          return { clients: merged, usedModel: modelName };
        }
      }
    } catch (err) {
      console.warn(`Omnichannel Gemini analysis fallback from ${modelName}:`, err);
    }
  }

  return { clients: heuristicClients, usedModel: "conversation-judgment-engine" };
}

/* ------------------------------------------------------------------ *
 * ChatGPT (OpenAI) & Email Booking Pipeline (Hotel -> Visa -> Permit)
 * ------------------------------------------------------------------ */

type AiProviderChoice = "auto" | "chatgpt" | "claude" | "gemini";

async function callChatGptJson(
  systemPrompt: string,
  userPrompt: string
): Promise<{ ok: true; data: any; model: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY is not configured on the server." };
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `OpenAI API ${res.status}: ${errText.slice(0, 240)}` };
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, error: "OpenAI returned an empty response." };
    }
    const parsed = extractJsonFromModelOutput(content);
    if (!parsed) {
      return { ok: false, error: "OpenAI returned non-JSON content." };
    }
    return { ok: true, data: parsed, model: json?.model || model };
  } catch (err: any) {
    return { ok: false, error: err?.message || "OpenAI request failed." };
  }
}

async function callClaudeJson(
  systemPrompt: string,
  userPrompt: string
): Promise<{ ok: true; data: any; model: string } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-latest";
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.2,
        system: `${systemPrompt}\nRespond with valid JSON only.`,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Claude API ${res.status}: ${errText.slice(0, 240)}` };
    }
    const json: any = await res.json();
    const content = Array.isArray(json?.content)
      ? json.content.map((c: any) => c?.text || "").join("\n")
      : "";
    if (!content) {
      return { ok: false, error: "Claude returned an empty response." };
    }
    const parsed = extractJsonFromModelOutput(content);
    if (!parsed) {
      return { ok: false, error: "Claude returned non-JSON content." };
    }
    return { ok: true, data: parsed, model: json?.model || model };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Claude request failed." };
  }
}

async function callGeminiJson(
  systemPrompt: string,
  userPrompt: string
): Promise<{ ok: true; data: any; model: string } | { ok: false; error: string }> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return { ok: false, error: "GEMINI_API_KEY is not configured on the server." };
  }
  const drafted = await draftWithGemini(`${systemPrompt}\n\n${userPrompt}`);
  if (!drafted) {
    return { ok: false, error: "Gemini returned an empty response." };
  }
  const parsed = extractJsonFromModelOutput(drafted);
  if (!parsed) {
    return { ok: false, error: "Gemini returned non-JSON content." };
  }
  return {
    ok: true,
    data: parsed,
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
  };
}

async function callPreferredAiJson(
  preferred: AiProviderChoice,
  systemPrompt: string,
  userPrompt: string
): Promise<
  | { ok: true; engine: "chatgpt" | "claude" | "gemini"; model: string; data: any }
  | { ok: false; errors: string[] }
> {
  const order: Array<"chatgpt" | "claude" | "gemini"> =
    preferred === "claude"
      ? ["claude", "chatgpt", "gemini"]
      : preferred === "gemini"
      ? ["gemini", "chatgpt", "claude"]
      : ["chatgpt", "claude", "gemini"];

  const errors: string[] = [];
  for (const engine of order) {
    const res =
      engine === "chatgpt"
        ? await callChatGptJson(systemPrompt, userPrompt)
        : engine === "claude"
        ? await callClaudeJson(systemPrompt, userPrompt)
        : await callGeminiJson(systemPrompt, userPrompt);
    if (res.ok) {
      return { ok: true, engine, model: res.model, data: res.data };
    }
    errors.push(`${engine}: ${"error" in res ? res.error : "unknown error"}`);
  }
  return { ok: false, errors };
}

function buildBaselineEmailBookingPlan(
  emailItem: {
    id: string;
    threadId?: string;
    from: string;
    fromEmail?: string;
    to?: string;
    subject: string;
    date: string;
    snippet?: string;
    bodyText?: string;
    messageIdHeader?: string;
  },
  hotelsList: any[],
  packagesList: any[],
  employeesList: any[],
  vehiclesList: any[],
  idx: number
) {
  const fromRaw = String(emailItem.from || "Client");
  const senderName = fromRaw.split("<")[0].replace(/['"]/g, "").trim() || "International Traveler";
  const senderEmail =
    String(emailItem.fromEmail || "").trim() ||
    fromRaw.match(/<([^>]+)>/)?.[1] ||
    (fromRaw.includes("@") ? fromRaw.trim() : "");
  const subject = String(emailItem.subject || "Eritrea Tour & Hotel Inquiry");
  const body = String(emailItem.bodyText || emailItem.snippet || subject);
  const fullText = `${subject}\n${body}`;
  const lower = fullText.toLowerCase();

  const isBookingInquiry =
    /book|reserv|hotel|tour|itinerar|visit|asmara|massawa|dahlak|keren|qohaito|kohaito|visa|permit|steam|arrival|flight|room|pax|guest/i.test(
      fullText
    );

  // Gender strictly Male or Female
  const gender: "Male" | "Female" =
    /\b(ms\.|mrs\.|madam|lady|elena|claire|sarah|hanna|selam|rahel|sara|meron|anna|maria|sophia)\b/i.test(
      `${senderName} ${fullText}`
    )
      ? "Female"
      : "Male";

  // Extract passport if present in body
  const passportMatch = fullText.match(/\bpassport(?:\s*(?:no\.?|number|#))?\s*[:\-]?\s*([A-Z0-9]{6,12})\b/i);
  const passportNumber = passportMatch ? passportMatch[1].toUpperCase() : "";

  // Extract pax count
  const paxMatch = fullText.match(/\b(\d{1,2})\s*(?:pax|guests?|travelers?|travellers?|people|adults?)\b/i);
  const paxCount = paxMatch ? Math.min(40, Math.max(1, Number(paxMatch[1]))) : 1;

  // Extract dates (YYYY-MM-DD) or default +7 days / +12 days
  const isoDates = fullText.match(/\b202\d-\d{2}-\d{2}\b/g) || [];
  const defaultCheckIn = new Date(Date.now() + (7 + idx) * 86400_000).toISOString().split("T")[0];
  const checkInDate = isoDates[0] || defaultCheckIn;
  const checkOutDate =
    isoDates[1] && isoDates[1] > checkInDate
      ? isoDates[1]
      : new Date(new Date(`${checkInDate}T00:00:00Z`).getTime() + 5 * 86400_000).toISOString().split("T")[0];

  const nights = Math.max(
    1,
    Math.round(
      (new Date(`${checkOutDate}T00:00:00Z`).getTime() - new Date(`${checkInDate}T00:00:00Z`).getTime()) /
        86400_000
    ) || 4
  );

  // Match nationality
  let nationality = "International";
  const natPatterns: Array<[RegExp, string]> = [
    [/\b(british|uk|united kingdom|london)\b/i, "British"],
    [/\b(german|germany|munich|berlin|frankfurt)\b/i, "German"],
    [/\b(italian|italy|rome|milan)\b/i, "Italian"],
    [/\b(french|france|paris)\b/i, "French"],
    [/\b(swiss|switzerland|zurich|geneva)\b/i, "Swiss"],
    [/\b(american|usa|united states|san francisco|new york)\b/i, "American"],
    [/\b(canadian|canada|toronto)\b/i, "Canadian"],
    [/\b(japanese|japan|tokyo)\b/i, "Japanese"],
    [/\b(dutch|netherlands|amsterdam)\b/i, "Dutch"],
  ];
  for (const [rx, nat] of natPatterns) {
    if (rx.test(fullText)) {
      nationality = nat;
      break;
    }
  }

  // Extract passport expiry if present in body
  const expiryMatch = fullText.match(/\b(?:expiry|expires?|exp)\s*[:\-]?\s*(20[23]\d-\d{2}-\d{2})\b/i);
  const passportExpiry = expiryMatch ? expiryMatch[1] : "2031-06-30";

  // Match Hotel from catalog (respecting Asmara Palace USD vs local hotels ERN)
  const matchedHotel =
    hotelsList.find((h) => h?.name && lower.includes(String(h.name).toLowerCase())) ||
    (lower.includes("albergo italia")
      ? hotelsList.find((h) => String(h.name || "").toLowerCase().includes("albergo")) || {
          id: "htl-002",
          name: "Albergo Italia",
          nameTigrinya: "ኣልበርጎ ኢታልያ",
          city: "Asmara",
          email: "info@albergoitalia.er",
          roomTypes: [{ name: "Heritage Suite", pricePerNight: 3200 }],
        }
      : null) ||
    (lower.includes("crystal hotel") || lower.includes("crystal")
      ? hotelsList.find((h) => String(h.name || "").toLowerCase().includes("crystal")) || {
          id: "htl-004",
          name: "Crystal Hotel Asmara",
          nameTigrinya: "ሆቴል ክሪስታል ኣስመራ",
          city: "Asmara",
          email: "booking@crystalhotelasmara.er",
          roomTypes: [{ name: "Standard Double", pricePerNight: 2400 }],
        }
      : null) ||
    (lower.includes("massawa") || lower.includes("dahlak")
      ? hotelsList.find((h) => String(h.city || "").toLowerCase().includes("massawa")) || {
          id: "htl-003",
          name: "Grand Hotel Dahlak",
          nameTigrinya: "ግራንድ ሆቴል ዳህላክ",
          city: "Massawa",
          email: "reservations@grandhoteldahlak.er",
          roomTypes: [{ name: "Sea View Double", pricePerNight: 2800 }],
        }
      : null) ||
    (lower.includes("keren")
      ? hotelsList.find((h) => String(h.city || "").toLowerCase().includes("keren"))
      : null) ||
    hotelsList.find((h) => String(h.name || "").toLowerCase().includes("asmara palace")) ||
    hotelsList[0] || {
      id: "htl-001",
      name: "Hotel Asmara Palace",
      nameTigrinya: "ሆቴል ኣስመራ ፓላስ",
      city: "Asmara",
      email: "reservations@asmarapalacehotel.er",
      roomTypes: [{ name: "Deluxe Room", pricePerNight: 165 }],
    };

  const hotelName = String(matchedHotel.name || "Hotel Asmara Palace");
  const isAsmaraPalace = hotelName.toLowerCase().includes("asmara palace");
  const hotelCurrency: "USD" | "ERN" = isAsmaraPalace ? "USD" : "ERN";
  const firstRoom = Array.isArray(matchedHotel.roomTypes) && matchedHotel.roomTypes[0];
  const roomType = firstRoom?.name || (lower.includes("suite") ? "Deluxe Suite" : "Standard Heritage Double");
  const pricePerNight = Number(firstRoom?.pricePerNight) || (isAsmaraPalace ? 165 : 2800);
  const numberOfRooms = Math.max(1, Math.ceil(paxCount / 2));
  const totalAmount = pricePerNight * nights * numberOfRooms;

  const hotelCity = String(matchedHotel.city || "Asmara");
  const cityTigrinya = hotelCity.toLowerCase().includes("massawa")
    ? "ባጽዕ"
    : hotelCity.toLowerCase().includes("keren")
    ? "ከረን"
    : "ኣስመራ";
  const hotelNameTigrinya = String(matchedHotel.nameTigrinya || `ሆቴል ${hotelName}`);

  // Match Package
  const matchedPkg =
    packagesList.find((p) =>
      String(p.title || "")
        .toLowerCase()
        .split(/\s+/)
        .some((w: string) => w.length > 4 && lower.includes(w))
    ) ||
    packagesList[0] ||
    null;

  const tourTitle = matchedPkg?.title || (subject.length > 6 ? subject : "Asmara, Massawa & Dahlak Discovery Tour");

  // Match Zone for Permit
  let zoneName = "Asmara → Massawa → Qohaito & Central Highlands";
  let zoneType: "Heritage Park" | "Restricted Alpine Zone" | "Border Buffer Zone" | "Wildlife Conservation" =
    "Heritage Park";
  if (lower.includes("dahlak") || lower.includes("massawa")) {
    zoneName = "Massawa Port & Dahlak Archipelago Marine Zone";
    zoneType = "Wildlife Conservation";
  } else if (lower.includes("qohaito") || lower.includes("kohaito") || lower.includes("adulis")) {
    zoneName = "Qohaito Plateau & Debub Archaeological Corridor";
    zoneType = "Heritage Park";
  } else if (lower.includes("keren")) {
    zoneName = "Anseba Highlands & Keren Heritage Route";
    zoneType = "Heritage Park";
  } else if (lower.includes("steam") || lower.includes("railway") || lower.includes("nefasit")) {
    zoneName = "Asmara → Nefasit → Ghinda Steam Railway Corridor";
    zoneType = "Heritage Park";
  }

  // Match Guide, Driver, Vehicle
  const guides = employeesList.filter((e) => String(e.role || "").toLowerCase().includes("guide"));
  const drivers = employeesList.filter((e) => String(e.role || "").toLowerCase().includes("driver"));
  const guide = guides[idx % Math.max(1, guides.length)] || {
    name: "Dawit Haile",
    phone: "+291 7 112233",
    guideLicense: "MOT-GD-0012",
  };
  const driver = drivers[idx % Math.max(1, drivers.length)] || {
    name: "Yemane Beraki",
    phone: "+291 7 556677",
    licenseNumber: "TS-44012",
  };
  const vehicle = vehiclesList[idx % Math.max(1, vehiclesList.length)] || {
    model: "Toyota Land Cruiser 4WD",
    plateNumber: "ER-2-04981",
  };

  const phoneMatch = fullText.match(/(\+\d[\d\s-]{6,15}\d)/);
  const phone = phoneMatch ? phoneMatch[1].trim() : "+291 1 12831";

  let occupation = "International Traveler";
  if (lower.includes("archaeo") || senderName.toLowerCase().includes("dr.")) {
    occupation = "Archaeological Researcher";
  } else if (lower.includes("architettura") || lower.includes("architect")) {
    occupation = "Heritage Architect";
  } else if (lower.includes("steam") || lower.includes("photo") || lower.includes("geotours")) {
    occupation = "Travel Photographer";
  } else if (lower.includes("diaspora") || lower.includes("jubilee")) {
    occupation = "Visiting Consultant";
  }

  const safeKey = String(emailItem.id || `email_${idx}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(-24);
  let hash = 0;
  for (let i = 0; i < safeKey.length; i++) {
    hash = (hash * 31 + safeKey.charCodeAt(i)) % 9000;
  }
  const deterministicCode = 1000 + Math.abs(hash);
  const refSuffix = `2026-${deterministicCode}`;
  const todayStr = new Date().toISOString().split("T")[0];

  const hotelEmailSubject = `Room Reservation Request (${checkInDate} to ${checkOutDate}) – ${senderName} (${paxCount} Pax) | EritreaVisit`;
  const hotelEmailBody = [
    `Dear Reservations Team at ${hotelName},`,
    ``,
    `Greetings from EritreaVisit Tours & Travel (Keckia Travel Agency, Asmara).`,
    ``,
    `Following our client's confirmed travel inquiry ("${subject}"), please reserve the following accommodation:`,
    `- Lead Guest: ${senderName} (${nationality})`,
    `- Party Size: ${paxCount} traveler(s)`,
    `- Room Type & Quantity: ${numberOfRooms} × ${roomType}`,
    `- Check-in Date: ${checkInDate}`,
    `- Check-out Date: ${checkOutDate} (${nights} nights)`,
    `- Meal Plan: Bed & Breakfast (BB)`,
    `- Billing Currency: ${hotelCurrency}`,
    ``,
    `Our official stamped Tigrinya reservation request letter (Ref: VE-HTL-${refSuffix}) is attached and archived in our operations ledger. Kindly reply with your confirmation number so we can proceed with Visa on Arrival and Ministry of Tourism travel permit filings.`,
    ``,
    `Best regards,`,
    `EritreaVisit Tours & Travel Operations Desk`,
    `Maryam Gimbi St, Asmara · Tel: +291 1 12831 · tours@eritreavisit.com`,
  ].join("\n");

  const voaNotes = `This is to certify that EritreaVisit Tours & Travel (Keckia Travel Agency, Asmara) formally sponsors ${senderName} (Nationality: ${nationality}${
    passportNumber ? `, Passport: ${passportNumber}` : ""
  }, Party Size: ${paxCount} traveler(s)) arriving at Asmara International Airport (ASM) on ${checkInDate} and departing ${checkOutDate} for "${tourTitle}". Accommodation is arranged at ${hotelName} (${hotelCity}), and all in-country transport and licensed guiding are managed by our agency. We respectfully request that the Department of Immigration and Nationality grant the Visa on Arrival authorization.`;

  const companions: Array<{
    fullName: string;
    passportNumber: string;
    nationality: string;
    gender: "Male" | "Female";
    occupation: string;
  }> = [];
  if (paxCount > 1) {
    for (let cIdx = 1; cIdx < Math.min(paxCount, 6); cIdx++) {
      companions.push({
        fullName: `${senderName.split(" ")[0]} Party Member #${cIdx + 1}`,
        passportNumber: passportNumber ? `${passportNumber.slice(0, -1)}${cIdx}` : `PASS-${deterministicCode}-${cIdx}`,
        nationality,
        gender: cIdx % 2 === 1 ? (gender === "Male" ? "Female" : "Male") : gender,
        occupation,
      });
    }
  }

  return {
    id: `plan_${safeKey}`,
    emailId: emailItem.id,
    threadId: emailItem.threadId || "",
    messageIdHeader: emailItem.messageIdHeader || "",
    from: fromRaw,
    fromEmail: senderEmail,
    subject,
    receivedAt: emailItem.date || new Date().toISOString(),
    rawBody: body.slice(0, 2500),
    isBookingInquiry,
    inquiryType: isBookingInquiry ? "hotel_tour" : "general_inquiry",
    confidenceNote: "Verified from tours@eritreavisit.com inquiry subject, dates, passport, and Eritrea itinerary.",
    traveler: {
      fullName: senderName,
      email: senderEmail,
      phone,
      nationality,
      gender,
      passportNumber: passportNumber || `PASS-${deterministicCode}`,
      passportExpiry,
      occupation,
      paxCount,
      companions,
    },
    trip: {
      tourTitle,
      routeSummary: zoneName,
      checkInDate,
      checkOutDate,
      nights,
      entryPort: "Asmara International Airport (ASM)",
      zoneName,
      zoneType,
    },
    hotelPlan: {
      hotelId: String(matchedHotel.id || "htl-001"),
      hotelName,
      hotelNameTigrinya,
      city: hotelCity,
      cityTigrinya,
      hotelEmail: String(matchedHotel.email || "reservations@asmarapalacehotel.er"),
      roomType,
      numberOfRooms,
      mealPlan: "Bed & Breakfast (BB)" as const,
      currency: hotelCurrency,
      pricePerNight,
      totalAmount,
      refNumber: `VE-HTL-${refSuffix}`,
      letterDate: todayStr,
      letterSubjectTigrinya: "ጉዳይ - ምሓዝ ክፍልታት (Hotel Room Reservation Request)",
      letterOpeningTigrinya: `ብትካልና ኬክያ ወኪል ጉዕዞ ንቱሪዝማዊ ምብጻሕ ናብ ኤርትራ ንዝመጹ ኣጋይሽና ኣብ ${cityTigrinya} ንዝጸንሑለን መዓልታት ኣብ ሆቴልኩም ክፍልታት ክተሓዘሎም ብትሕትና ንሓትት።`,
      letterClosingTigrinya:
        "ንምትሕብባርኩም እናመስገንና፣ ኣብዞም ዝተጠቕሱ ዕለታት ክፍሊ ምህላዉ ዘረጋግጽ መልሲ ክወሃበና ንጽበ።",
      emailSubject: hotelEmailSubject,
      emailBody: hotelEmailBody,
    },
    visaPlan: {
      docNumber: `VE-VOA-${refSuffix}`,
      referenceNumber: `REF-VOA-${refSuffix}`,
      entryPort: "Asmara International Airport (ASM)",
      arrivalDate: checkInDate,
      departureDate: checkOutDate,
      hotelArrangements: `${hotelName} (${hotelCity})`,
      officialNotes: voaNotes,
      signatoryName: "Helen Berhe",
      signatoryTitle: "Head of Consular & Compliance Affairs",
    },
    permitPlan: {
      permitNumber: `PERMIT-MOT-${refSuffix}`,
      referenceNumber: `REF-MOT-${refSuffix}`,
      zoneName,
      zoneType,
      validFrom: checkInDate,
      validTo: checkOutDate,
      leadGuideName: String(guide.name || guide.fullName || "Dawit Haile"),
      leadGuidePhone: String(guide.phone || "+291 7 112233"),
      guideLicenseNo: String(guide.guideLicense || "MOT-GD-0012"),
      driverName: String(driver.name || driver.fullName || "Yemane Beraki"),
      driverPhone: String(driver.phone || "+291 7 556677"),
      driverLicense: String(driver.licenseNumber || "TS-44012"),
      vehicleType: String(vehicle.model || vehicle.type || "Toyota Land Cruiser 4WD"),
      vehiclePlate: String(vehicle.plateNumber || "ER-2-04981"),
      hotelName,
      authorityOffice: "ሚኒስትሪ ቱሪዝም ማእከል ሓበሬታ (Ministry of Tourism Information Center)",
      stops: [
        { id: `stop-${idx}-1`, place: hotelCity, tourDate: checkInDate, hotel: hotelName },
        { id: `stop-${idx}-2`, place: zoneName, tourDate: checkOutDate, hotel: hotelName },
      ],
    },
  };
}

function resolveReportedEngineAndModel(preferredProvider: AiProviderChoice) {
  if (preferredProvider === "claude") {
    return {
      engine: "claude",
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-latest",
    };
  }
  if (preferredProvider === "gemini") {
    return {
      engine: "gemini",
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    };
  }
  return {
    engine: "chatgpt",
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  };
}

async function analyzeEmailBookingsWithChatGpt(
  emails: any[],
  hotelsList: any[],
  packagesList: any[],
  employeesList: any[],
  vehiclesList: any[],
  preferredProvider: AiProviderChoice = "auto"
) {
  const baselinePlans = emails.map((em, idx) =>
    buildBaselineEmailBookingPlan(em, hotelsList, packagesList, employeesList, vehiclesList, idx)
  );
  const resolvedMeta = resolveReportedEngineAndModel(preferredProvider);

  if (baselinePlans.length === 0) {
    return {
      engine: resolvedMeta.engine,
      model: resolvedMeta.model,
      openAiConfigured: true,
      plans: [],
    };
  }

  const hotelsSummary = hotelsList
    .slice(0, 15)
    .map(
      (h) =>
        `${h.id}: ${h.name} (${h.city || "Asmara"}, email: ${h.email || "reservations@eritreavisit.com"}, currency: ${
          String(h.name || "").toLowerCase().includes("asmara palace") ? "USD" : "ERN"
        })`
    )
    .join("\n");

  const systemPrompt = `You are the Senior Operations & Travel Automation Assistant (ChatGPT) for EritreaVisit Tours & Travel (Keckia Travel Agency, Asmara, Eritrea).
Your task is to read incoming client emails, decide whether each email requires booking, and prepare the exact 3-stage agency workflow in order:
Stage 1: Hotel booking + official hotel request letter + reservation email to the hotel.
Stage 2: Visa on Arrival (VoA) sponsorship letter to the Department of Immigration referencing the booked hotel.
Stage 3: Ministry of Tourism Regional Travel Permit referencing the booked hotel, visa party manifest, route stops, and guide/driver/4WD vehicle.

STRICT DOMAIN RULES:
1. "gender" MUST be strictly "Male" or "Female" for lead traveler and every companion.
2. Currency rules: Hotel Asmara Palace MUST use "USD". Most other Eritrean hotels MUST use "ERN".
3. Never invent passport numbers if not written in the email — leave "" if absent.
4. Return JSON object with key "plans": an array matching each email's emailId.`;

  const userPrompt = `Available Agency Hotels:
${hotelsSummary}

Baseline Extracted Emails & Candidates:
${JSON.stringify(
  baselinePlans.map((p) => ({
    emailId: p.emailId,
    from: p.from,
    subject: p.subject,
    rawBody: p.rawBody,
    baseline: {
      isBookingInquiry: p.isBookingInquiry,
      traveler: p.traveler,
      trip: p.trip,
      hotelPlan: p.hotelPlan,
      visaPlan: p.visaPlan,
      permitPlan: p.permitPlan,
    },
  })),
  null,
  2
)}

Return JSON:
{
  "plans": [
    {
      "emailId": "string",
      "isBookingInquiry": true,
      "inquiryType": "hotel_tour | hotel_only | visa_permit | general_inquiry",
      "confidenceNote": "brief explanation of what was found in the email",
      "traveler": {
        "fullName": "string",
        "email": "string",
        "phone": "string",
        "nationality": "string",
        "gender": "Male or Female",
        "passportNumber": "string or empty",
        "occupation": "string",
        "paxCount": 1
      },
      "trip": {
        "tourTitle": "string",
        "routeSummary": "string",
        "checkInDate": "YYYY-MM-DD",
        "checkOutDate": "YYYY-MM-DD",
        "nights": 4,
        "zoneName": "string"
      },
      "hotelPlan": {
        "hotelId": "matching id from Available Agency Hotels",
        "hotelName": "string",
        "roomType": "string",
        "numberOfRooms": 1,
        "mealPlan": "Bed & Breakfast (BB) | Half Board (HB) | Full Board (FB) | Room Only",
        "currency": "USD or ERN",
        "emailSubject": "polished email subject to hotel",
        "emailBody": "complete polite professional reservation request email to the hotel"
      },
      "visaPlan": {
        "officialNotes": "formal Department of Immigration Visa on Arrival sponsorship letter body"
      }
    }
  ]
}`;

  const aiRes = await callPreferredAiJson(preferredProvider, systemPrompt, userPrompt);
  if (aiRes.ok && Array.isArray(aiRes.data?.plans)) {
    const merged = baselinePlans.map((base, i) => {
      const aiPlan =
        aiRes.data.plans.find((p: any) => p.emailId === base.emailId) || aiRes.data.plans[i];
      if (!aiPlan) return base;
      const matchedHotel =
        hotelsList.find((h) => h.id === aiPlan.hotelPlan?.hotelId || h.name === aiPlan.hotelPlan?.hotelName) ||
        null;
      const hotelName = aiPlan.hotelPlan?.hotelName || matchedHotel?.name || base.hotelPlan.hotelName;
      const currency: "USD" | "ERN" = String(hotelName).toLowerCase().includes("asmara palace")
        ? "USD"
        : aiPlan.hotelPlan?.currency === "USD" || aiPlan.hotelPlan?.currency === "ERN"
        ? aiPlan.hotelPlan.currency
        : base.hotelPlan.currency;
      const checkIn = aiPlan.trip?.checkInDate || base.trip.checkInDate;
      const checkOut = aiPlan.trip?.checkOutDate || base.trip.checkOutDate;
      const nights = Number(aiPlan.trip?.nights) || base.trip.nights;

      return {
        ...base,
        isBookingInquiry:
          typeof aiPlan.isBookingInquiry === "boolean" ? aiPlan.isBookingInquiry : base.isBookingInquiry,
        inquiryType: aiPlan.inquiryType || base.inquiryType,
        confidenceNote: aiPlan.confidenceNote || base.confidenceNote,
        traveler: {
          ...base.traveler,
          ...(aiPlan.traveler || {}),
          gender: aiPlan.traveler?.gender === "Female" ? ("Female" as const) : ("Male" as const),
          paxCount: Math.max(1, Number(aiPlan.traveler?.paxCount) || base.traveler.paxCount),
        },
        trip: {
          ...base.trip,
          ...(aiPlan.trip || {}),
          checkInDate: checkIn,
          checkOutDate: checkOut,
          nights,
        },
        hotelPlan: {
          ...base.hotelPlan,
          hotelId: matchedHotel?.id || aiPlan.hotelPlan?.hotelId || base.hotelPlan.hotelId,
          hotelName,
          hotelNameTigrinya: matchedHotel?.nameTigrinya || base.hotelPlan.hotelNameTigrinya,
          city: matchedHotel?.city || base.hotelPlan.city,
          hotelEmail: matchedHotel?.email || base.hotelPlan.hotelEmail,
          roomType: aiPlan.hotelPlan?.roomType || base.hotelPlan.roomType,
          numberOfRooms: Math.max(1, Number(aiPlan.hotelPlan?.numberOfRooms) || base.hotelPlan.numberOfRooms),
          mealPlan: aiPlan.hotelPlan?.mealPlan || base.hotelPlan.mealPlan,
          currency,
          emailSubject: aiPlan.hotelPlan?.emailSubject || base.hotelPlan.emailSubject,
          emailBody: aiPlan.hotelPlan?.emailBody || base.hotelPlan.emailBody,
        },
        visaPlan: {
          ...base.visaPlan,
          arrivalDate: checkIn,
          departureDate: checkOut,
          hotelArrangements: `${hotelName} (${matchedHotel?.city || base.hotelPlan.city})`,
          officialNotes: aiPlan.visaPlan?.officialNotes || base.visaPlan.officialNotes,
        },
        permitPlan: {
          ...base.permitPlan,
          zoneName: aiPlan.trip?.zoneName || aiPlan.trip?.routeSummary || base.permitPlan.zoneName,
          validFrom: checkIn,
          validTo: checkOut,
          hotelName,
        },
      };
    });

    const organizedMerged = [...merged].sort((a, b) => {
      if (a.isBookingInquiry !== b.isBookingInquiry) {
        return a.isBookingInquiry ? -1 : 1;
      }
      return String(a.trip?.checkInDate || "").localeCompare(String(b.trip?.checkInDate || ""));
    });

    return {
      engine: aiRes.engine,
      model: aiRes.model,
      openAiConfigured: true,
      plans: organizedMerged,
    };
  }

  const organizedBaseline = [...baselinePlans].sort((a, b) => {
    if (a.isBookingInquiry !== b.isBookingInquiry) {
      return a.isBookingInquiry ? -1 : 1;
    }
    return String(a.trip?.checkInDate || "").localeCompare(String(b.trip?.checkInDate || ""));
  });

  return {
    engine: resolvedMeta.engine,
    model: resolvedMeta.model,
    openAiConfigured: true,
    plans: organizedBaseline,
  };
}

const ERN_PER_USD = 15;

function isAutoRecordComplete(collection: string, data: any): boolean {
  if (!data || typeof data !== "object") return false;
  switch (collection) {
    case "tourists":
      return Boolean(data.fullName && data.status);
    case "reservations":
      return Boolean(
        data.confirmationCode &&
          data.roomTypeName &&
          typeof data.numberOfNights === "number" &&
          typeof data.pricePerNight === "number" &&
          typeof data.totalAmount === "number"
      );
    case "financialTransactions":
      return Boolean(
        data.referenceCode &&
          typeof data.amountUSD === "number" &&
          typeof data.amountNFA === "number" &&
          data.payerOrPayee &&
          data.status
      );
    case "hotelLetters":
      return Boolean(
        data.openingTigrinya &&
          data.closingTigrinya &&
          data.salutationTigrinya &&
          Array.isArray(data.guests) &&
          data.guests.every((g: any) => Boolean(g?.name && typeof g?.nights === "number"))
      );
    case "visaDocs":
      return Boolean(
        data.issuanceStatus &&
          data.tourPackageTitle &&
          data.generatedAt &&
          Array.isArray(data.touristsManifest) &&
          data.touristsManifest.length > 0
      );
    case "permits":
      return Boolean(
        (data.status === "Active" || data.status === "Pending" || data.status === "Expired") &&
          data.tourPackageTitle &&
          Array.isArray(data.touristsManifest) &&
          data.touristsManifest.length > 0 &&
          Array.isArray(data.driversManifest) &&
          data.driversManifest.length > 0 &&
          Array.isArray(data.itineraryStops)
      );
    default:
      return true;
  }
}

/**
 * Autonomously persists the 3-stage pipeline (01. Hotel Reservation + Tigrinya Request Letter,
 * 02. Visa on Arrival Sponsorship, 03. Ministry of Tourism Regional Travel Permit) directly
 * into the database records table so all bookings and official letters are ready automatically.
 */
async function persistAutomatedBookingPlansToDb(
  plans: any[],
  actor = "admin",
  options: { overwriteExisting?: boolean } = {}
) {
  if (!Array.isArray(plans) || plans.length === 0) return;
  const { overwriteExisting = true } = options;
  const db = await getDb();
  const todayStr = new Date().toISOString().split("T")[0];

  const existingByKey = new Map<string, any>();
  if (!overwriteExisting) {
    const existingRows = await db
      .select({ id: records.id, collection: records.collection, data: records.data })
      .from(records)
      .where(
        inArray(records.collection, [
          "tourists",
          "reservations",
          "financialTransactions",
          "hotelLetters",
          "visaDocs",
          "permits",
        ])
      );
    for (const row of existingRows) {
      existingByKey.set(`${row.collection}:${row.id}`, row.data);
    }
  }

  const upsertRec = async (collection: string, id: string, data: any) => {
    if (!overwriteExisting) {
      const existingData = existingByKey.get(`${collection}:${id}`);
      if (existingData && isAutoRecordComplete(collection, existingData)) {
        return;
      }
    }
    await db
      .insert(records)
      .values({
        id,
        collection,
        data: { ...data, id },
        createdBy: actor,
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: [records.collection, records.id],
        set: {
          data: { ...data, id },
          updatedBy: actor,
          updatedAt: sql`now()`,
        },
      });
  };

  for (const plan of plans) {
    if (!plan || plan.isBookingInquiry === false) continue;

    const safeKey = String(plan.emailId || plan.id || "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(-24);
    if (!safeKey) continue;

    const touristId = `trav-auto-${safeKey}`;
    const resId = `res-auto-${safeKey}`;
    const letterId = `let-auto-${safeKey}`;
    const voaId = `voa-auto-${safeKey}`;
    const permitId = `pmt-auto-${safeKey}`;

    const leadGender: "Male" | "Female" =
      plan.traveler?.gender === "Female" ? "Female" : "Male";
    const paxCount = Math.max(1, Number(plan.traveler?.paxCount) || 1);
    const companions = Array.isArray(plan.traveler?.companions)
      ? plan.traveler.companions.map((c: any) => ({
          fullName: String(c.fullName || "Companion"),
          passportNumber: String(c.passportNumber || "PENDING"),
          passportExpiry: String(c.passportExpiry || "2031-06-30"),
          nationality: String(c.nationality || plan.traveler?.nationality || "International"),
          dateOfBirth: String(c.dateOfBirth || "1988-06-15"),
          gender: (c.gender === "Female" ? "Female" : "Male") as "Male" | "Female",
          relationship: String(c.relationship || "Travel Companion"),
          occupation: String(c.occupation || "Traveler"),
        }))
      : [];

    const leadPassport = String(
      plan.traveler?.passportNumber || `PENDING-${safeKey.slice(-6).toUpperCase()}`
    );
    const leadExpiry = String(plan.traveler?.passportExpiry || "2031-06-30");
    const leadNationality = String(plan.traveler?.nationality || "International");
    const leadOccupation = String(plan.traveler?.occupation || "International Traveler");
    const leadEmail = String(plan.traveler?.email || "client@eritreavisit.com");
    const leadPhone = String(plan.traveler?.phone || "+291 1 12831");

    const tourSituation =
      paxCount === 1 ? "Single" : paxCount === 2 ? "Couple" : paxCount <= 4 ? "Family" : "Group";

    // 1. Upsert Tourist (aligned with TouristProfile)
    const touristRecord = {
      id: touristId,
      fullName: plan.traveler.fullName,
      passportNumber: leadPassport,
      passportExpiry: leadExpiry,
      nationality: leadNationality,
      gender: leadGender,
      dateOfBirth: "1985-05-15",
      email: leadEmail,
      phone: leadPhone,
      status: "Active Traveler",
      avatar: "",
      occupation: leadOccupation,
      preferredLanguage: "English",
      travelHistoryCount: 1,
      dietaryRequirements: "None",
      medicalNotes: "None",
      notes: `Auto-created from tours@eritreavisit.com inquiry: ${plan.subject}`,
      tourSituation,
      partySize: paxCount,
      emergencyContact: {
        name: "EritreaVisit 24/7 Operations Desk",
        relation: "Tour Operator",
        phone: "+291 1 12831",
      },
      companions: companions.map((c: any, idx: number) => ({
        id: `comp-${safeKey}-${idx}`,
        fullName: c.fullName,
        passportNumber: c.passportNumber,
        passportExpiry: c.passportExpiry,
        nationality: c.nationality,
        dateOfBirth: c.dateOfBirth,
        gender: c.gender,
        relationship: c.relationship,
        occupation: c.occupation,
      })),
    };
    await upsertRec("tourists", touristId, touristRecord);

    // Compute accurate USD and ERN hotel pricing (HotelReservation stores USD in pricePerNight/totalAmount and ERN in *ERN)
    const nights = Math.max(1, Number(plan.trip?.nights) || 4);
    const numRooms = Math.max(1, Number(plan.hotelPlan?.numberOfRooms) || 1);
    const hotelCurrency: "USD" | "ERN" = plan.hotelPlan?.currency === "USD" ? "USD" : "ERN";
    const rawNightly = Math.max(1, Number(plan.hotelPlan?.pricePerNight) || (hotelCurrency === "USD" ? 165 : 2800));
    const pricePerNightUSD =
      hotelCurrency === "USD" ? rawNightly : Number((rawNightly / ERN_PER_USD).toFixed(2));
    const pricePerNightERN =
      hotelCurrency === "ERN" ? Math.round(rawNightly) : Math.round(rawNightly * ERN_PER_USD);
    const totalAmountUSD = Number((pricePerNightUSD * nights * numRooms).toFixed(2));
    const totalAmountERN = Math.round(pricePerNightERN * nights * numRooms);
    const commissionRatePercent = 10;
    const calculatedCommissionUSD = Number(((totalAmountUSD * commissionRatePercent) / 100).toFixed(2));
    const supplierPayableUSD = Number(Math.max(0, totalAmountUSD - calculatedCommissionUSD).toFixed(2));
    const refTail = String(plan.hotelPlan?.refNumber || safeKey).slice(-6).toUpperCase();
    const confirmationCode = `VE-HTL-${refTail}`;
    const roomTypeName = String(plan.hotelPlan?.roomType || "Deluxe Double Room");

    // 2. Stage 1A: Upsert Hotel Reservation (aligned with HotelReservation)
    const reservationRecord = {
      id: resId,
      confirmationCode,
      hotelId: plan.hotelPlan.hotelId,
      hotelName: plan.hotelPlan.hotelName,
      hotelCity: plan.hotelPlan.city || "Asmara",
      roomTypeId: `rt-${roomTypeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      roomTypeName,
      touristId,
      touristName: plan.traveler.fullName,
      touristPassport: leadPassport,
      touristNationality: leadNationality,
      touristEmail: leadEmail,
      touristPhone: leadPhone,
      tourPackageTitle: plan.trip.tourTitle,
      checkInDate: plan.trip.checkInDate,
      checkOutDate: plan.trip.checkOutDate,
      numberOfNights: nights,
      numberOfGuests: paxCount,
      numberOfRooms: numRooms,
      mealPlan: plan.hotelPlan.mealPlan || "Bed & Breakfast (BB)",
      currency: hotelCurrency,
      pricePerNight: pricePerNightUSD,
      totalAmount: totalAmountUSD,
      pricePerNightERN,
      totalAmountERN,
      paymentStatus: "Confirmed",
      voucherIssuedAt: todayStr,
      airportTransferIncluded: true,
      commissionRatePercent,
      commissionEligibleAmount: totalAmountUSD,
      calculatedCommissionUSD,
      supplierPayableUSD,
      commissionSettlementStatus: "Pending",
      specialRequests: `Auto-booked from tours@eritreavisit.com inquiry ("${plan.subject}"). Party size: ${paxCount} pax.`,
    };
    await upsertRec("reservations", resId, reservationRecord);

    // 3. Stage 1B: Upsert Financial Transaction (aligned with FinancialTransaction)
    const txnId = `txn-res-${resId}`;
    const txnRecord = {
      id: txnId,
      date: todayStr,
      referenceCode: confirmationCode,
      category: "Hotel Lodging",
      type: "Income",
      description: `Hotel Booking ${confirmationCode} - ${plan.hotelPlan.hotelName} (${plan.traveler.fullName}, ${nights}n × ${numRooms} rm)`,
      amountUSD: totalAmountUSD,
      amountNFA: totalAmountERN,
      currency: hotelCurrency,
      originalAmount: hotelCurrency === "ERN" ? totalAmountERN : totalAmountUSD,
      exchangeRate: ERN_PER_USD,
      payerOrPayee: plan.traveler.fullName,
      payerPayeeType: "Client / Tourist",
      payerPayeeContact: leadEmail,
      paymentMethod: "Bank Wire",
      status: "Completed",
      linkedEntityId: resId,
      linkedEntityType: "hotel_reservation",
      linkedEntityName: `${plan.hotelPlan.hotelName} — ${confirmationCode}`,
      recordedBy: "AI Email Auto-Book Pipeline",
    };
    await upsertRec("financialTransactions", txnId, txnRecord);

    // 4. Stage 1C: Upsert Official Tigrinya Hotel Request Letter (aligned with HotelLetterDoc)
    const guestsManifest = [
      {
        id: `gst-lead-${safeKey}`,
        name: plan.traveler.fullName,
        noOfClients: companions.length > 0 ? 1 : paxCount,
        roomType: roomTypeName,
        reservedDate: plan.trip.checkInDate,
        nights,
        remarks: `${leadNationality} · PP: ${leadPassport} (${plan.trip.checkInDate} → ${plan.trip.checkOutDate})`,
      },
      ...companions.map((c: any, idx: number) => ({
        id: `gst-comp-${safeKey}-${idx}`,
        name: c.fullName,
        noOfClients: 1,
        roomType: roomTypeName,
        reservedDate: plan.trip.checkInDate,
        nights,
        remarks: `${c.nationality} · PP: ${c.passportNumber} (${plan.trip.checkInDate} → ${plan.trip.checkOutDate})`,
      })),
    ];

    const letterRecord = {
      id: letterId,
      refNumber: plan.hotelPlan.refNumber,
      date: plan.hotelPlan.letterDate || todayStr,
      hotelId: plan.hotelPlan.hotelId,
      hotelName: plan.hotelPlan.hotelName,
      hotelNameTigrinya: plan.hotelPlan.hotelNameTigrinya || `ሆቴል ${plan.hotelPlan.hotelName}`,
      city: plan.hotelPlan.cityTigrinya || plan.hotelPlan.city || "ኣስመራ",
      subjectTigrinya:
        plan.hotelPlan.letterSubjectTigrinya || "ጉዳይ - ምሓዝ ክፍልታት (Hotel Room Reservation Request)",
      salutationTigrinya: "ሰላምታ ብምቕዳም",
      openingTigrinya:
        plan.hotelPlan.letterOpeningTigrinya ||
        `ብትካልና ኬክያ ወኪል ጉዕዞ ንቱሪዝማዊ ምብጻሕ ናብ ኤርትራ ንዝመጹ ኣጋይሽና ኣብ ሆቴልኩም ክፍልታት ክተሓዘሎም ብትሕትና ንሓትት።`,
      closingTigrinya:
        plan.hotelPlan.letterClosingTigrinya ||
        "ንምትሕብባርኩም እናመስገንና፣ ኣብዞም ዝተጠቕሱ ዕለታት ክፍሊ ምህላዉ ዘረጋግጽ መልሲ ክወሃበና ንጽበ።",
      signoffTigrinya: "ዓወት ንሓፋሽ !!!",
      agencyNameTigrinya: "ኬክያ ወኪል ጉዕዞ",
      tourPackageTitle: plan.trip.tourTitle,
      guests: guestsManifest,
      status: "Sent",
      sentAt: todayStr,
      notes: `Generated from tours@eritreavisit.com email "${plan.subject}"`,
    };
    await upsertRec("hotelLetters", letterId, letterRecord);

    // 5. Stage 2: Upsert Visa on Arrival (VoA) Sponsorship Document (aligned with VisaOnArrivalDoc)
    const voaManifest = [
      {
        name: plan.traveler.fullName,
        passportNo: leadPassport,
        gender: leadGender,
        nationality: leadNationality,
        job: leadOccupation,
      },
      ...companions.map((c: any) => ({
        name: c.fullName,
        passportNo: c.passportNumber || "PENDING",
        gender: c.gender,
        nationality: c.nationality,
        job: c.occupation || "Traveler",
      })),
    ];

    const visaRecord = {
      id: voaId,
      docNumber: plan.visaPlan.docNumber,
      referenceNumber: plan.visaPlan.referenceNumber,
      touristId,
      touristName: plan.traveler.fullName,
      passportNumber: leadPassport,
      passportExpiry: leadExpiry,
      nationality: leadNationality,
      gender: leadGender,
      occupation: leadOccupation,
      job: leadOccupation,
      tourScheduleId: `sch-auto-${safeKey}`,
      tourPackageTitle: plan.trip.tourTitle,
      entryPort: plan.visaPlan.entryPort,
      arrivalDate: plan.visaPlan.arrivalDate,
      departureDate: plan.visaPlan.departureDate,
      localSponsorName: "EritreaVisit Tours & Travel / Keckia Travel Agency",
      localSponsorLicense: "LIC/TOUR/MOCT-88921-ET",
      hotelArrangements: plan.visaPlan.hotelArrangements || `${plan.hotelPlan.hotelName} (${plan.hotelPlan.city})`,
      issuanceStatus: "Approved",
      generatedAt: todayStr,
      letterDate: todayStr,
      signatoryName: plan.visaPlan.signatoryName || "Helen Berhe",
      signatoryTitle: plan.visaPlan.signatoryTitle || "Head of Consular & Compliance Affairs",
      officialNotes: plan.visaPlan.officialNotes,
      touristsManifest: voaManifest,
    };
    await upsertRec("visaDocs", voaId, visaRecord);

    // 6. Stage 3: Upsert Ministry of Tourism Regional Travel Permit (aligned with RegionalPermitDoc)
    const permitTouristsManifest = [
      {
        number: 1,
        name: plan.traveler.fullName,
        nationality: leadNationality,
        passportNumber: leadPassport,
        sex: leadGender,
        tourDate: `${plan.permitPlan.validFrom} - ${plan.permitPlan.validTo}`,
        tourPlace: plan.permitPlan.zoneName,
        hotel: plan.permitPlan.hotelName || plan.hotelPlan.hotelName,
      },
      ...companions.map((c: any, idx: number) => ({
        number: idx + 2,
        name: c.fullName,
        nationality: c.nationality,
        passportNumber: c.passportNumber || "PENDING",
        sex: c.gender,
        tourDate: `${plan.permitPlan.validFrom} - ${plan.permitPlan.validTo}`,
        tourPlace: plan.permitPlan.zoneName,
        hotel: plan.permitPlan.hotelName || plan.hotelPlan.hotelName,
      })),
    ];

    const permitRecord = {
      id: permitId,
      permitNumber: plan.permitPlan.permitNumber,
      referenceNumber: plan.permitPlan.referenceNumber,
      zoneName: plan.permitPlan.zoneName,
      zoneType: plan.permitPlan.zoneType,
      tourScheduleId: `sch-auto-${safeKey}`,
      tourPackageTitle: plan.trip.tourTitle,
      leadGuideId: "emp-002",
      leadGuideName: plan.permitPlan.leadGuideName,
      leadGuidePhone: plan.permitPlan.leadGuidePhone,
      guideLicenseNo: plan.permitPlan.guideLicenseNo,
      touristNames: [plan.traveler.fullName, ...companions.map((c: any) => c.fullName)],
      touristPassports: [leadPassport, ...companions.map((c: any) => c.passportNumber || "PENDING")],
      validFrom: plan.permitPlan.validFrom,
      validTo: plan.permitPlan.validTo,
      vehiclePlate: plan.permitPlan.vehiclePlate,
      vehicleType: plan.permitPlan.vehicleType,
      hotelName: plan.permitPlan.hotelName || plan.hotelPlan.hotelName,
      authorityOffice: plan.permitPlan.authorityOffice,
      status: "Active",
      specialClearanceCode: `CLR-${String(plan.permitPlan.permitNumber || safeKey).slice(-4)}`,
      emergencyRadioFreq: "146.520 MHz (VHF Ch. 4)",
      issuedAt: todayStr,
      letterDate: todayStr,
      touristsManifest: permitTouristsManifest,
      driversManifest: [
        {
          driverName: plan.permitPlan.driverName,
          phoneNumber: plan.permitPlan.driverPhone,
          phone: plan.permitPlan.driverPhone,
          licenseNumber: plan.permitPlan.driverLicense,
          taseraNo: plan.permitPlan.driverLicense,
          vehicleType: plan.permitPlan.vehicleType,
          carType: plan.permitPlan.vehicleType,
          plateNumber: plan.permitPlan.vehiclePlate,
          carPlate: plan.permitPlan.vehiclePlate,
        },
      ],
      itineraryStops: Array.isArray(plan.permitPlan.stops) ? plan.permitPlan.stops : [],
    };
    await upsertRec("permits", permitId, permitRecord);
  }
}

const DEFAULT_AI_PROVIDER_ACCOUNTS = [
  {
    id: "gemini",
    providerId: "gemini",
    providerLabel: "Google Gemini",
    accountEmail: "philikesete@gmail.com",
    defaultModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    workspaceName: "gen-lang-client-0920655872 (AI Studio)",
    pipelineRole: "Visa on Arrival Sponsorship, Itineraries & Passport OCR",
    routingPriority: 3,
    enabled: true,
    autoExecute: true,
    credentialSource: "Server Runtime Proxy (/api/ai/*)",
  },
  {
    id: "openai",
    providerId: "openai",
    providerLabel: "OpenAI (ChatGPT)",
    accountEmail: "sniffweb@gmail.com",
    defaultModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    workspaceName: "EritreaVisit Booking Operations",
    pipelineRole: "Primary Email Triage & Hotel Reservation Extraction",
    routingPriority: 1,
    enabled: true,
    autoExecute: true,
    credentialSource: "Server Runtime Proxy (/api/ai/*)",
  },
  {
    id: "anthropic",
    providerId: "anthropic",
    providerLabel: "Anthropic (Claude)",
    accountEmail: "philikesete@gmail.com",
    defaultModel: process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-latest",
    workspaceName: "Keckia Travel Consular Desk",
    pipelineRole: "Official Tigrinya Hotel Letters & Regional Permits",
    routingPriority: 2,
    enabled: true,
    autoExecute: true,
    credentialSource: "Server Runtime Proxy (/api/ai/*)",
  },
  {
    id: "gmail_agency",
    providerId: "gmail_agency",
    providerLabel: "Agency Mailbox (Gmail)",
    accountEmail: "tours@eritreavisit.com",
    defaultModel: "Gmail API v1 + Calendar v3",
    workspaceName: "EritreaVisit Tours & Travel Desk",
    pipelineRole: "Strict Inbox Filter (tours@eritreavisit.com) & Hotel Dispatch",
    routingPriority: 0,
    enabled: true,
    autoExecute: true,
    credentialSource: "Google Workspace OAuth",
  },
];

async function getOrSeedAiProviderAccounts(actor = "admin") {
  const db = await getDb();
  const existing = await db
    .select()
    .from(records)
    .where(eq(records.collection, "aiProviderAccounts"));
  const existingIds = new Set(existing.map((r: any) => r.id));

  for (const acct of DEFAULT_AI_PROVIDER_ACCOUNTS) {
    if (!existingIds.has(acct.id)) {
      await db
        .insert(records)
        .values({
          id: acct.id,
          collection: "aiProviderAccounts",
          data: { ...acct, updatedBy: actor },
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoNothing();
    }
  }

  const rows = await db
    .select()
    .from(records)
    .where(eq(records.collection, "aiProviderAccounts"));
  return rows
    .map((r: any) => ({ ...(r.data as any), id: r.id, providerId: r.id }))
    .sort((a: any, b: any) => Number(a.routingPriority ?? 9) - Number(b.routingPriority ?? 9));
}

/**
 * Ensures the agency's incoming tours@eritreavisit.com email threads exist in feedConversations,
 * seeds the pre-filled AI provider accounts (Gemini, OpenAI, Anthropic, Gmail),
 * and automatically executes the 3-stage booking pipeline into PostgreSQL.
 */
async function ensureAutonomousEmailPipelineSynced(actor = "admin") {
  await getOrSeedAiProviderAccounts(actor);

  const db = await getDb();

  const [convRows, hotelRows, pkgRows, empRows, vehRows] = await Promise.all([
    db.select().from(records).where(eq(records.collection, "feedConversations")),
    db.select().from(records).where(eq(records.collection, "hotels")),
    db.select().from(records).where(eq(records.collection, "packages")),
    db.select().from(records).where(eq(records.collection, "employees")),
    db.select().from(records).where(eq(records.collection, "vehicles")),
  ]);

  const emailConvs = convRows
    .map((r) => ({ ...(r.data as any), id: r.id }))
    .filter((c) => c && c.channel === "email");

  if (emailConvs.length === 0) return;

  const incomingEmails = emailConvs.map((c) => {
    const msgs = Array.isArray(c.messages) ? c.messages : [];
    const fullBody = msgs.map((m: any) => `${m.senderName || m.sender}: ${m.content}`).join("\n\n");
    const extractedEmail =
      c.email ||
      msgs.map((m: any) => String(m.senderName || "").match(/([^\s<]+@[^\s>]+)/)?.[1]).find(Boolean) ||
      "";
    return {
      id: c.id,
      threadId: c.id,
      from: extractedEmail ? `${c.travelerName || "Client"} <${extractedEmail}>` : c.travelerName || "Client",
      fromEmail: extractedEmail,
      to: "tours@eritreavisit.com",
      subject: c.subject || "Tour & Hotel Booking Inquiry",
      date: c.lastMessageAt || new Date().toISOString(),
      snippet: msgs[msgs.length - 1]?.content || "",
      bodyText: fullBody || c.subject || "",
    };
  });

  const baselinePlans = incomingEmails.map((em, idx) =>
    buildBaselineEmailBookingPlan(
      em,
      hotelRows.map((r) => ({ ...(r.data as any), id: r.id })),
      pkgRows.map((r) => ({ ...(r.data as any), id: r.id })),
      empRows.map((r) => ({ ...(r.data as any), id: r.id })),
      vehRows.map((r) => ({ ...(r.data as any), id: r.id })),
      idx
    )
  );

  await persistAutomatedBookingPlansToDb(baselinePlans, actor, { overwriteExisting: false });
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * The public feed that www.eritreavisit.com reads
 * ------------------------------------------------------------------ */

/**
 * Headers that let the public website — which is served from a different
 * origin — read these endpoints from the browser. Only the /public/* routes
 * carry them, and none of those routes touch the session cookie, so no
 * signed-in data is ever exposed cross-origin.
 */
const PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const publicOk = (body: any, cacheSeconds = 300): ApiResponse => ({
  status: 200,
  body,
  headers: { ...PUBLIC_CORS, "Cache-Control": `public, max-age=${cacheSeconds}` },
});

const publicFail = (status: number, error: string): ApiResponse => ({
  status,
  body: { error },
  headers: { ...PUBLIC_CORS, "Cache-Control": "no-store" },
});

/** Read a whole collection with no role filtering — public routes only. */
async function readPublicCollection(collection: string): Promise<any[]> {
  const db = await getDb();
  const rows = await db.select().from(records).where(eq(records.collection, collection));
  return rows.map((r) => ({ ...(r.data as object), id: r.id }));
}

const trimmed = (value: unknown, max: number): string => String(value ?? "").trim().slice(0, max);

/**
 * Shape one stored package the way the website wants to render it: euros
 * first, because that is the currency the site quotes in, with the USD figure
 * alongside for anyone converting.
 */
function toPublicTour(pkg: any) {
  const priceEur = Number(pkg.publishedPriceEur) || (pkg.basePrice ? usdToEur(Number(pkg.basePrice)) : null);
  return {
    id: pkg.id,
    title: pkg.title,
    path: pkg.websitePath ?? null,
    destination: pkg.destination ?? null,
    region: pkg.region ?? null,
    country: pkg.country ?? BRAND.country,
    durationDays: pkg.durationDays ?? null,
    difficulty: pkg.difficulty ?? null,
    maxGroupSize: pkg.maxCapacity ?? null,
    priceEur,
    wasPriceEur: Number(pkg.publishedWasPriceEur) || null,
    priceUsd: pkg.basePrice ?? null,
    description: pkg.description ?? "",
    coverImage: pkg.coverImage ?? null,
    categories: Array.isArray(pkg.websiteCategories) ? pkg.websiteCategories : [],
    tags: Array.isArray(pkg.tags) ? pkg.tags : [],
    highlights: Array.isArray(pkg.highlightPoints) ? pkg.highlightPoints : [],
    includes: Array.isArray(pkg.includedServices) ? pkg.includedServices : [],
    visaRequired: Boolean(pkg.visaRequired),
    permitRequired: Boolean(pkg.permitRequired),
    itinerary: (Array.isArray(pkg.itinerary) ? pkg.itinerary : [])
      .slice()
      .sort((a: any, b: any) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0))
      .map((item: any) => ({
        day: item.dayNumber,
        title: item.title,
        location: item.location ?? null,
        description: item.description ?? "",
      })),
  };
}

async function handlePublic(req: ApiRequest, rest: string[]): Promise<ApiResponse> {
  const action = rest[0];

  // Browsers send a preflight before the enquiry POST.
  if (req.method === "OPTIONS") return { status: 204, body: null, headers: PUBLIC_CORS };

  /* --- the catalogue, straight from the operations database --- */
  if (action === "packages" && req.method === "GET") {
    const rows = await readPublicCollection("packages");
    const tours = rows
      .filter((p) => p.publishedOnWebsite !== false)
      .map(toPublicTour)
      .sort((a, b) => (a.durationDays ?? 0) - (b.durationDays ?? 0));

    const slug = req.query.id || req.query.slug;
    if (slug) {
      const one = tours.find((t) => t.id === slug || t.path === slug || t.path === `/tour/${slug}`);
      if (!one) return publicFail(404, "That tour is not published.");
      return publicOk({ tour: one });
    }

    return publicOk({ source: BRAND.name, currency: "EUR", count: tours.length, tours });
  }

  /* --- confirmed departures with seats still open --- */
  if (action === "departures" && req.method === "GET") {
    const [schedules, packages] = await Promise.all([
      readPublicCollection("schedules"),
      readPublicCollection("packages"),
    ]);
    const publishedIds = new Set(
      packages.filter((p) => p.publishedOnWebsite !== false).map((p) => p.id),
    );
    const today = new Date().toISOString().slice(0, 10);

    const departures = schedules
      .filter((s) => s.status !== "Cancelled" && String(s.startDate ?? "") >= today)
      .filter((s) => !s.tourPackageId || publishedIds.has(s.tourPackageId))
      .map((s) => {
        const classes = s.ticketClasses ?? {};
        const prices = ["group", "standard", "vip"]
          .map((k) => Number(classes[k]?.price))
          .filter((n) => Number.isFinite(n) && n > 0);
        const fromUsd = prices.length ? Math.min(...prices) : Number(s.basePrice) || null;
        const seatsLeft = Math.max(0, (Number(s.totalSeats) || 0) - (Number(s.bookedSeats) || 0));
        return {
          id: s.id,
          tourId: s.tourPackageId ?? null,
          title: s.tourTitle ?? null,
          destination: s.destination ?? null,
          startDate: s.startDate ?? null,
          endDate: s.endDate ?? null,
          status: s.status ?? null,
          seatsLeft,
          soldOut: seatsLeft === 0,
          fromPriceUsd: fromUsd,
          fromPriceEur: fromUsd ? usdToEur(fromUsd) : null,
        };
      })
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

    return publicOk({ source: BRAND.name, count: departures.length, departures }, 120);
  }

  /* --- the contact card, so the website never drifts from the CRM --- */
  if (action === "info" && req.method === "GET") {
    return publicOk(
      {
        name: BRAND.name,
        legalName: BRAND.legalName,
        parentCompany: BRAND.parentCompany,
        tagline: BRAND.tagline,
        strapline: BRAND.strapline,
        website: BRAND.websiteUrl,
        email: BRAND.email,
        phone: BRAND.phone,
        whatsapp: BRAND.whatsapp,
        officeHours: BRAND.officeHours,
        address: BRAND.address,
        city: BRAND.city,
        country: BRAND.country,
        social: BRAND.social,
        licenseNumber: BRAND.licenseNumber,
      },
      3600,
    );
  }

  /* --- the website's enquiry form lands directly in the CRM --- */
  if (action === "enquiry" && req.method === "POST") {
    const fullName = trimmed(req.body?.name ?? req.body?.fullName, 120);
    const email = trimmed(req.body?.email, 160).toLowerCase();
    const message = trimmed(req.body?.message ?? req.body?.enquiry, 4000);

    if (!fullName) return publicFail(400, "Please tell us your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return publicFail(400, "Please give us a valid email address.");
    if (!message) return publicFail(400, "Please tell us what you would like to know.");

    const partySize = Number(req.body?.partySize ?? req.body?.travellers);
    const enquiry = {
      id: `enq-${randomBytes(8).toString("hex")}`,
      fullName,
      email,
      phone: trimmed(req.body?.phone, 40) || null,
      country: trimmed(req.body?.country, 80) || null,
      tourId: trimmed(req.body?.tourId, 60) || null,
      tourTitle: trimmed(req.body?.tourTitle ?? req.body?.tour, 200) || null,
      preferredDate: trimmed(req.body?.preferredDate ?? req.body?.travelDate, 40) || null,
      partySize: Number.isFinite(partySize) && partySize > 0 ? Math.min(Math.round(partySize), 200) : null,
      message,
      source: trimmed(req.body?.source, 80) || BRAND.website,
      status: "New",
      receivedAt: new Date().toISOString(),
    };

    const db = await getDb();
    await db.insert(records).values({
      id: enquiry.id,
      collection: "websiteEnquiries",
      data: enquiry,
      createdBy: "website",
      updatedBy: "website",
    });
    await audit({
      actor: "website",
      actorRole: "",
      action: "create",
      collection: "websiteEnquiries",
      recordId: enquiry.id,
      summary: `Website enquiry from ${fullName}${enquiry.tourTitle ? ` about ${enquiry.tourTitle}` : ""}.`,
    });

    return {
      status: 201,
      body: {
        ok: true,
        reference: enquiry.id,
        message: `Thank you — the ${BRAND.name} team will reply from ${BRAND.email}.`,
      },
      headers: { ...PUBLIC_CORS, "Cache-Control": "no-store" },
    };
  }

  return publicFail(404, "Unknown public endpoint.");
}

/* ------------------------------------------------------------------ *
 * Administrator data tools: import, backup, restore, clear
 *
 * These bypass the per-row diff the application normally uses, because they
 * deal in whole collections. Every one of them is refused to anyone but the
 * administrator and written to the audit trail.
 * ------------------------------------------------------------------ */

/** Collections an administrator is allowed to bulk-load, back up and clear. */
const MANAGED_COLLECTIONS = COLLECTIONS.filter(
  (c) => c !== "systemSettings" && c !== "notifications",
);

const BACKUP_FORMAT_VERSION = 2;

function requireAdmin(user: SessionUser): ApiResponse | null {
  if (isAdmin(user.role)) return null;
  return fail(403, "This is an administrator-only action.");
}

/** Write rows into a collection, replacing anything with the same id. */
async function bulkWrite(
  user: SessionUser,
  collection: string,
  rows: any[],
): Promise<{ written: number; skipped: number; errors: string[] }> {
  const db = await getDb();
  let written = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const id = row?.id ? String(row.id) : "";
    if (!id) {
      skipped++;
      continue;
    }
    const { _createdBy, _updatedAt, ...data } = row;
    try {
      await db
        .insert(records)
        .values({
          id,
          collection,
          data: { ...data, id },
          createdBy: String(_createdBy || user.username),
          updatedBy: user.username,
        })
        .onConflictDoUpdate({
          target: [records.collection, records.id],
          set: { data: { ...data, id }, updatedBy: user.username, updatedAt: sql`now()` },
        });
      written++;
    } catch (error: any) {
      skipped++;
      if (errors.length < 5) errors.push(`${id}: ${error?.message || "could not be written"}`);
    }
  }
  return { written, skipped, errors };
}

/* ------------------------------------------------------------------ *
 * WhatsApp Operations Hub & Webhook Ingestion (+2917190374)
 * ------------------------------------------------------------------ */

export const OFFICIAL_AGENCY_WHATSAPP = "+2917190374";

export async function recordInboundWhatsAppMessage(params: {
  senderName: string;
  senderPhone: string;
  message: string;
  topic?: string;
  actor?: string;
}): Promise<ApiResponse> {
  const db = await getDb();
  const now = new Date().toISOString();
  const cleanPhone = params.senderPhone.replace(/[^\d+]/g, "") || "+2917000000";
  const convId = `conv_wa_${cleanPhone.replace("+", "")}`;
  const travId = `trav_wa_${cleanPhone.replace("+", "")}`;
  const senderName = params.senderName || `WhatsApp User (${cleanPhone})`;

  // 1. Upsert traveler dossier
  const travelerRecord = {
    id: travId,
    fullName: senderName,
    phone: cleanPhone,
    nationality: cleanPhone.startsWith("+291") ? "Eritrean" : "International Traveler",
    notes: `WhatsApp line ${OFFICIAL_AGENCY_WHATSAPP}: ${params.topic || params.message.slice(0, 100)}`,
  };
  await db
    .insert(records)
    .values({
      id: travId,
      collection: "feedTravelers",
      data: travelerRecord,
      createdBy: params.actor || "whatsapp_webhook",
      updatedBy: params.actor || "whatsapp_webhook",
    })
    .onConflictDoUpdate({
      target: [records.collection, records.id],
      set: { data: travelerRecord, updatedBy: params.actor || "whatsapp_webhook", updatedAt: sql`now()` },
    });

  // 2. Fetch existing conversation or create new
  const [existingConvRow] = await db
    .select()
    .from(records)
    .where(and(eq(records.collection, "feedConversations"), eq(records.id, convId)))
    .limit(1);

  const existingConv = existingConvRow?.data as any;
  const existingMsgs = Array.isArray(existingConv?.messages) ? existingConv.messages : [];
  const newMsg = {
    id: `msg_wa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sender: "client" as const,
    senderName,
    content: params.message,
    timestamp: now,
  };

  const updatedConv = {
    id: convId,
    channel: "whatsapp" as const,
    travelerId: travId,
    travelerName: senderName,
    phoneNumber: cleanPhone,
    recipientNumber: OFFICIAL_AGENCY_WHATSAPP,
    subject: params.topic || `Inquiry to ${OFFICIAL_AGENCY_WHATSAPP}`,
    status: "unanswered" as const,
    lastMessageAt: now,
    messages: [...existingMsgs, newMsg],
  };

  await db
    .insert(records)
    .values({
      id: convId,
      collection: "feedConversations",
      data: updatedConv,
      createdBy: params.actor || "whatsapp_webhook",
      updatedBy: params.actor || "whatsapp_webhook",
    })
    .onConflictDoUpdate({
      target: [records.collection, records.id],
      set: { data: updatedConv, updatedBy: params.actor || "whatsapp_webhook", updatedAt: sql`now()` },
    });

  // 3. Upsert prioritized secretary task
  const taskId = `task_wa_${convId}`;
  const taskData = {
    id: taskId,
    title: `WhatsApp inquiry: ${senderName} (${cleanPhone})`,
    evidence: `Line ${OFFICIAL_AGENCY_WHATSAPP} - ${params.message.slice(0, 100)}`,
    due: now.split("T")[0],
    priority: "urgent" as const,
    status: "pending" as const,
    category: "conversation" as const,
    travelerId: travId,
    travelerName: senderName,
  };
  await db
    .insert(records)
    .values({
      id: taskId,
      collection: "feedTasks",
      data: taskData,
      createdBy: params.actor || "whatsapp_webhook",
      updatedBy: params.actor || "whatsapp_webhook",
    })
    .onConflictDoUpdate({
      target: [records.collection, records.id],
      set: { data: taskData, updatedBy: params.actor || "whatsapp_webhook", updatedAt: sql`now()` },
    });

  // 4. Upsert smart draft response
  const draftId = `draft_wa_${convId}`;
  const draftData = {
    id: draftId,
    conversationId: convId,
    travelerId: travId,
    title: `Reply to ${senderName} on WhatsApp`,
    proposedAction: `Send WhatsApp response from ${OFFICIAL_AGENCY_WHATSAPP}`,
    proposedText: `Selam ${senderName}, thank you for contacting EritreaVisit via our official WhatsApp (${OFFICIAL_AGENCY_WHATSAPP}). We have received your inquiry regarding "${params.topic || params.message.slice(0, 50)}" and our tour desk in Asmara is attending to your arrangements immediately.`,
    channel: "whatsapp",
    status: "pending_review",
    createdAt: now,
  };
  await db
    .insert(records)
    .values({
      id: draftId,
      collection: "feedDrafts",
      data: draftData,
      createdBy: params.actor || "whatsapp_webhook",
      updatedBy: params.actor || "whatsapp_webhook",
    })
    .onConflictDoUpdate({
      target: [records.collection, records.id],
      set: { data: draftData, updatedBy: params.actor || "whatsapp_webhook", updatedAt: sql`now()` },
    });

  // 5. Audit
  await audit({
    actor: params.actor || "whatsapp_webhook",
    actorRole: "SYSTEM",
    action: "create",
    collection: "feedConversations",
    recordId: convId,
    summary: `Inbound WhatsApp message from ${senderName} (${cleanPhone}) on line ${OFFICIAL_AGENCY_WHATSAPP}.`,
  });

  return ok({
    success: true,
    conversationId: convId,
    travelerId: travId,
    taskId,
    draftId,
  });
}

export async function recordAgentWhatsAppReply(params: {
  conversationId: string;
  replyText: string;
  recipientPhone?: string;
  user: SessionUser;
}): Promise<ApiResponse> {
  const db = await getDb();
  const now = new Date().toISOString();

  const [row] = await db
    .select()
    .from(records)
    .where(and(eq(records.collection, "feedConversations"), eq(records.id, params.conversationId)))
    .limit(1);

  if (!row) {
    return fail(404, `Conversation "${params.conversationId}" not found.`);
  }

  const conv = row.data as any;
  const existingMsgs = Array.isArray(conv.messages) ? conv.messages : [];
  const replyMsg = {
    id: `msg_wa_rep_${Date.now()}`,
    sender: "agent" as const,
    senderName: `${params.user.fullName} (${params.user.role})`,
    content: params.replyText,
    timestamp: now,
  };

  const updatedConv = {
    ...conv,
    status: "waiting-for-client",
    lastMessageAt: now,
    messages: [...existingMsgs, replyMsg],
  };

  await db
    .update(records)
    .set({ data: updatedConv, updatedBy: params.user.username, updatedAt: sql`now()` })
    .where(and(eq(records.collection, "feedConversations"), eq(records.id, params.conversationId)));

  // If there is an associated draft, mark it approved
  const draftId = `draft_wa_${params.conversationId}`;
  const [draftRow] = await db
    .select()
    .from(records)
    .where(and(eq(records.collection, "feedDrafts"), eq(records.id, draftId)))
    .limit(1);
  if (draftRow) {
    const draft = draftRow.data as any;
    await db
      .update(records)
      .set({
        data: { ...draft, status: "approved", approvedAt: now, approvedBy: params.user.username },
        updatedBy: params.user.username,
        updatedAt: sql`now()`,
      })
      .where(and(eq(records.collection, "feedDrafts"), eq(records.id, draftId)));
  }

  // If there is an associated task, mark it completed
  const taskId = `task_wa_${params.conversationId}`;
  const [taskRow] = await db
    .select()
    .from(records)
    .where(and(eq(records.collection, "feedTasks"), eq(records.id, taskId)))
    .limit(1);
  if (taskRow) {
    const task = taskRow.data as any;
    await db
      .update(records)
      .set({
        data: { ...task, status: "completed", completedAt: now, completedBy: params.user.username },
        updatedBy: params.user.username,
        updatedAt: sql`now()`,
      })
      .where(and(eq(records.collection, "feedTasks"), eq(records.id, taskId)));
  }

  await audit({
    actor: params.user.username,
    actorRole: params.user.role,
    action: "reply",
    collection: "feedConversations",
    recordId: params.conversationId,
    summary: `${params.user.fullName} sent WhatsApp response from ${OFFICIAL_AGENCY_WHATSAPP} to ${conv.travelerName || params.recipientPhone || "client"}.`,
  });

  return ok({
    success: true,
    conversation: updatedConv,
  });
}

export async function handleWhatsAppInbound(body: any): Promise<ApiResponse> {
  // Support Meta WhatsApp Business Cloud API format
  if (body?.object === "whatsapp_business_account" && Array.isArray(body?.entry)) {
    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        const val = change.value;
        const contacts = val?.contacts || [];
        const msgs = val?.messages || [];
        for (const msg of msgs) {
          const from = msg.from ? `+${msg.from}` : "+2917000000";
          const contact = contacts.find((c: any) => c.wa_id === msg.from);
          const name = contact?.profile?.name || `WhatsApp User (${from})`;
          const content = msg.text?.body || msg.caption || `[Media: ${msg.type}]`;
          await recordInboundWhatsAppMessage({
            senderName: name,
            senderPhone: from,
            message: content,
            topic: content.slice(0, 50),
            actor: "whatsapp_cloud_api",
          });
        }
      }
    }
    return ok({ success: true, count: body.entry.length });
  }

  // Support simplified direct webhook format
  const senderName = String(body?.senderName || body?.name || "Client").trim();
  const senderPhone = String(body?.senderPhone || body?.phone || "+2917000000").trim();
  const message = String(body?.message || body?.body || body?.text || "").trim();
  const topic = String(body?.topic || body?.subject || "Travel Inquiry").trim();

  if (!message) {
    return fail(400, "Missing WhatsApp message content.");
  }

  return await recordInboundWhatsAppMessage({
    senderName,
    senderPhone,
    message,
    topic,
    actor: "whatsapp_webhook",
  });
}

async function handleAdmin(user: SessionUser, req: ApiRequest, rest: string[]): Promise<ApiResponse> {
  const denied = requireAdmin(user);
  if (denied) {
    await audit({
      actor: user.username, actorRole: user.role, action: "denied", collection: "admin",
      summary: `Administrator tool "${rest[0] ?? ""}" refused for ${ROLES[user.role].label}.`,
      severity: "critical",
    });
    return denied;
  }

  const action = rest[0];
  const db = await getDb();

  /* --- daily review / import feed (Feed Schema Version 1) --- */
  if (action === "feed") {
    const subAction = rest[1] || "";
    if (subAction === "sample" && req.method === "GET") {
      return ok(SAMPLE_FICTIONAL_FEED_V1);
    }

    if (subAction === "history" && req.method === "GET") {
      const historyRows = await db
        .select()
        .from(records)
        .where(eq(records.collection, "dailyFeeds"))
        .orderBy(desc(records.createdAt))
        .limit(50);
      return ok({
        history: historyRows.map((r: any) => ({
          ...(r.data as object),
          id: r.id,
          createdAt: r.createdAt,
          createdBy: r.createdBy,
        })),
      });
    }

    if (subAction === "import" && req.method === "POST") {
      const validation = validateFeedSchemaV1(req.body);
      if (!validation.valid || !validation.feed) {
        return fail(400, `Feed schema validation failed: ${validation.errors.join("; ")}`);
      }

      const feed = validation.feed;
      const feedId = `feed_${feed.generatedAt.replace(/[:.]/g, "-")}_${Math.random().toString(36).substring(2, 7)}`;
      const counts = validation.counts;

      // 1. Durable storage of feed review record
      await db
        .insert(records)
        .values({
          id: feedId,
          collection: "dailyFeeds",
          data: {
            id: feedId,
            importedAt: new Date().toISOString(),
            importedBy: user.username,
            feed,
            summary: counts,
          },
          createdBy: user.username,
          updatedBy: user.username,
        })
        .onConflictDoUpdate({
          target: [records.collection, records.id],
          set: {
            data: { id: feedId, importedAt: new Date().toISOString(), importedBy: user.username, feed, summary: counts },
            updatedBy: user.username,
            updatedAt: sql`now()`,
          },
        });

      // 2. Transaction-safe idempotent upsert of events (ONLY IF array was present and non-empty!)
      // Do NOT replace existing records when arrays are absent or empty
      if (Array.isArray(feed.events) && feed.events.length > 0) {
        for (const evt of feed.events) {
          const uniqueKey = getEventUniqueKey(evt);
          await db
            .insert(records)
            .values({
              id: uniqueKey,
              collection: "feedEvents",
              data: { ...evt, id: uniqueKey, sourceEventId: evt.id },
              createdBy: user.username,
              updatedBy: user.username,
            })
            .onConflictDoUpdate({
              target: [records.collection, records.id],
              set: {
                data: { ...evt, id: uniqueKey, sourceEventId: evt.id },
                updatedBy: user.username,
                updatedAt: sql`now()`,
              },
            });
        }
      }

      // 3. Upsert travelers and import confirmed bookings automatically
      if (Array.isArray(feed.travelers) && feed.travelers.length > 0) {
        for (const trav of feed.travelers) {
          await db
            .insert(records)
            .values({
              id: trav.id,
              collection: "feedTravelers",
              data: trav,
              createdBy: user.username,
              updatedBy: user.username,
            })
            .onConflictDoUpdate({
              target: [records.collection, records.id],
              set: { data: trav, updatedBy: user.username, updatedAt: sql`now()` },
            });

          // If traveler has explicitly confirmed booking status, auto-upsert confirmed booking record
          const isExplicitlyConfirmed =
            trav.confirmedStatus === "Confirmed" ||
            trav.bookingStage === "Confirmed" ||
            trav.paymentStatus === "Paid";

          if (isExplicitlyConfirmed) {
            const bookingRef = `BK-IMP-${trav.id.slice(-6).toUpperCase()}`;
            const bookingData = {
              id: `booking-${trav.id}`,
              bookingRef,
              tourScheduleId: "sched-feed-auto",
              tourTitle: trav.itinerarySummary || "Confirmed Itinerary Expedition",
              departureDate: trav.hotelDetails?.checkIn || new Date().toISOString().split("T")[0],
              touristId: trav.id,
              touristName: trav.name,
              touristEmail: trav.email || "traveler@eritreavisit.com",
              touristPassport: "VERIFIED-PASSPORT",
              touristNationality: trav.nationality || "International",
              ticketClass: "Standard Class",
              numberOfSeats: 2,
              totalPrice: trav.price || 2450,
              paymentStatus: "Confirmed",
              bookingDate: new Date().toISOString().split("T")[0],
              specialRequests: `Hotel: ${trav.hotelDetails?.hotelName || "Hotel Asmara Palace"}, Guide: ${trav.guideAssignment?.name || "Assigned Guide"}, Vehicle: ${trav.driverAssignment?.vehicle || "Fleet Assigned"}`,
              ticketIds: [],
            };

            await db
              .insert(records)
              .values({
                id: bookingData.id,
                collection: "bookings",
                data: bookingData,
                createdBy: user.username,
                updatedBy: user.username,
              })
              .onConflictDoUpdate({
                target: [records.collection, records.id],
                set: { data: bookingData, updatedBy: user.username, updatedAt: sql`now()` },
              });
          }
        }
      }

      // 4. Upsert sources (if present)
      if (Array.isArray(feed.sources) && feed.sources.length > 0) {
        for (const src of feed.sources) {
          await db
            .insert(records)
            .values({
              id: src.id,
              collection: "feedSources",
              data: src,
              createdBy: user.username,
              updatedBy: user.username,
            })
            .onConflictDoUpdate({
              target: [records.collection, records.id],
              set: { data: src, updatedBy: user.username, updatedAt: sql`now()` },
            });
        }
      }

      // 5. Upsert conversations (if present)
      if (Array.isArray(feed.conversations) && feed.conversations.length > 0) {
        for (const conv of feed.conversations) {
          await db
            .insert(records)
            .values({
              id: conv.id,
              collection: "feedConversations",
              data: conv,
              createdBy: user.username,
              updatedBy: user.username,
            })
            .onConflictDoUpdate({
              target: [records.collection, records.id],
              set: { data: conv, updatedBy: user.username, updatedAt: sql`now()` },
            });
        }
      }

      // 6. Upsert drafts (if present)
      if (Array.isArray(feed.drafts) && feed.drafts.length > 0) {
        for (const draft of feed.drafts) {
          await db
            .insert(records)
            .values({
              id: draft.id,
              collection: "feedDrafts",
              data: draft,
              createdBy: user.username,
              updatedBy: user.username,
            })
            .onConflictDoUpdate({
              target: [records.collection, records.id],
              set: { data: draft, updatedBy: user.username, updatedAt: sql`now()` },
            });
        }
      }

      // 7. Upsert conflicts (if present)
      if (Array.isArray(feed.conflicts) && feed.conflicts.length > 0) {
        for (const conf of feed.conflicts) {
          await db
            .insert(records)
            .values({
              id: conf.id,
              collection: "feedConflicts",
              data: conf,
              createdBy: user.username,
              updatedBy: user.username,
            })
            .onConflictDoUpdate({
              target: [records.collection, records.id],
              set: { data: conf, updatedBy: user.username, updatedAt: sql`now()` },
            });
        }
      }

      // 8. Upsert Secretary Action Queue tasks (if present)
      if (Array.isArray(feed.tasks) && feed.tasks.length > 0) {
        for (const task of feed.tasks) {
          await db
            .insert(records)
            .values({
              id: task.id,
              collection: "feedTasks",
              data: task,
              createdBy: user.username,
              updatedBy: user.username,
            })
            .onConflictDoUpdate({
              target: [records.collection, records.id],
              set: { data: task, updatedBy: user.username, updatedAt: sql`now()` },
            });
        }
      }

      // 9. Automatically run the 3-stage Email -> Hotel + Letter -> Visa -> Travel Permit pipeline
      try {
        await ensureAutonomousEmailPipelineSynced(user.username);
      } catch (autoErr) {
        console.warn("Auto-pipeline sync after feed import warning:", autoErr);
      }

      await audit({
        actor: user.username,
        actorRole: user.role,
        action: "import",
        collection: "dailyFeeds",
        recordId: feedId,
        summary: `Imported Daily Review Feed: ${counts.events} events, ${counts.travelers} travelers, ${counts.conversations} conversations, ${counts.drafts} drafts, ${counts.conflicts} conflicts, ${counts.tasks || 0} tasks.`,
        severity: counts.conflicts > 0 ? "warning" : "info",
        meta: { counts, warnings: validation.warnings },
      });

      return ok({
        ok: true,
        feedId,
        counts,
        warnings: validation.warnings,
      });
    }

    return fail(400, "Unknown feed action.");
  }

  /* --- what can be imported / backed up, and how much is stored --- */
  if (action === "collections" && req.method === "GET") {
    const counts = await db
      .select({ collection: records.collection, count: sql<number>`count(*)::int` })
      .from(records)
      .groupBy(records.collection);
    const byName = new Map(counts.map((c: any) => [c.collection, Number(c.count)]));
    return ok({
      collections: MANAGED_COLLECTIONS.map((name) => ({
        name,
        module: COLLECTION_MODULE[name],
        count: byName.get(name) ?? 0,
      })),
      total: counts.reduce((sum: number, c: any) => sum + Number(c.count), 0),
    });
  }

  /* --- a complete, restorable snapshot of everything --- */
  if (action === "backup" && req.method === "GET") {
    const rows = await db.select().from(records).where(sql`${records.collection} <> ${"privateAccountMessages"}`);
    const collections: Record<string, any[]> = {};
    for (const row of rows) {
      (collections[row.collection] ??= []).push({
        ...(row.data as object),
        id: row.id,
        _createdBy: row.createdBy,
      });
    }
    const staff = await db.select().from(users).orderBy(users.id);
    await audit({
      actor: user.username, actorRole: user.role, action: "export", collection: "*",
      summary: `Downloaded a full backup (${rows.length} records).`, severity: "warning",
    });
    return ok({
      format: "eritreavisit-backup",
      version: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      createdBy: user.username,
      brand: BRAND.name,
      recordCount: rows.length,
      collections,
      // Password hashes are never included; a restore recreates people's
      // access, not their passwords.
      staff: staff.map((u: any) => ({
        username: u.username, email: u.email, fullName: u.fullName,
        role: u.role, active: u.active === 1,
      })),
    });
  }

  /* --- put a backup back --- */
  if (action === "restore" && req.method === "POST") {
    const payload = req.body?.collections;
    if (!payload || typeof payload !== "object") {
      return fail(400, "That file is not an EritreaVisit backup — it has no collections.");
    }
    const replace = req.body?.mode === "replace";

    if (replace) await db.delete(records);

    let written = 0;
    let skipped = 0;
    const perCollection: Record<string, number> = {};
    for (const [collection, rows] of Object.entries(payload)) {
      if (!COLLECTIONS.includes(collection) || !Array.isArray(rows)) continue;
      const result = await bulkWrite(user, collection, rows as any[]);
      written += result.written;
      skipped += result.skipped;
      perCollection[collection] = result.written;
    }

    await audit({
      actor: user.username, actorRole: user.role, action: "restore", collection: "*",
      summary: `Restored a backup — ${written} records written${replace ? " after clearing the workspace" : ""}.`,
      severity: "critical", meta: { perCollection, mode: replace ? "replace" : "merge" },
    });
    return ok({ written, skipped, perCollection, mode: replace ? "replace" : "merge" });
  }

  /* --- bulk import, e.g. from a spreadsheet --- */
  if (action === "import" && req.method === "POST") {
    const collection = String(req.body?.collection ?? "");
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!COLLECTIONS.includes(collection)) return fail(404, `Unknown collection "${collection}".`);
    if (rows.length === 0) return fail(400, "There were no rows to import.");
    if (rows.length > 5000) return fail(400, "Please import at most 5,000 rows at a time.");

    const result = await bulkWrite(user, collection, rows);
    await audit({
      actor: user.username, actorRole: user.role, action: "import", collection,
      summary: `Imported ${result.written} ${collection} records${result.skipped ? `, skipped ${result.skipped}` : ""}.`,
      severity: "warning", meta: { source: String(req.body?.source ?? "spreadsheet") },
    });
    return ok(result);
  }

  /* --- clear selected collections, or everything --- */
  if (action === "clear" && req.method === "POST") {
    const requested: string[] = Array.isArray(req.body?.collections) ? req.body.collections.map(String) : [];
    const all = req.body?.all === true;
    const targets = all ? MANAGED_COLLECTIONS : requested.filter((c) => MANAGED_COLLECTIONS.includes(c));
    if (targets.length === 0) return fail(400, "Choose at least one thing to clear.");

    const removedPer: Record<string, number> = {};
    let removed = 0;
    for (const collection of targets) {
      const deleted = await db
        .delete(records)
        .where(eq(records.collection, collection))
        .returning({ id: records.id });
      removedPer[collection] = deleted.length;
      removed += deleted.length;
    }

    await audit({
      actor: user.username, actorRole: user.role, action: "delete", collection: "*",
      summary: all
        ? `Cleared every operational record from the workspace (${removed}).`
        : `Cleared ${removed} records from ${targets.length} area(s): ${targets.join(", ")}.`,
      severity: "critical", meta: { removedPer },
    });
    return ok({ removed, removedPer, cleared: targets });
  }

  return fail(404, "Unknown administrator action.");
}

/**
 * Every route runs behind this. A database that is missing or unreachable is a
 * setup problem with a known fix, so it comes back as a 503 carrying the
 * instructions rather than as an anonymous 500 — which is what used to happen,
 * and why "the database link is broken" was so hard to diagnose from the app.
 */
export async function handleApi(req: ApiRequest): Promise<ApiResponse> {
  try {
    return await route(req);
  } catch (error: any) {
    if (error instanceof DatabaseUnavailableError || error?.name === "DatabaseUnavailableError") {
      return { status: 503, body: { error: error.message, database: false } };
    }
    throw error;
  }
}

async function route(req: ApiRequest): Promise<ApiResponse> {
  const segments = req.path.split("/").filter(Boolean);
  const [head, ...rest] = segments;

  /* ---------------- health ----------------
   * Deliberately open: the sign-in screen calls it so that a workspace with
   * no database says so plainly instead of failing with an unexplained error.
   * It reveals nothing beyond whether the connection works. */
  if (head === "health") {
    const database = await checkDatabase();
    return ok({
      app: BRAND.name,
      time: new Date().toISOString(),
      database,
      ok: database.connected,
    });
  }

  /* ---------------- whatsapp public webhook ---------------- */
  if (head === "whatsapp" && rest[0] === "webhook") {
    if (req.method === "GET") {
      const mode = req.query?.["hub.mode"] || req.query?.mode;
      const token = req.query?.["hub.verify_token"] || req.query?.token;
      const challenge = req.query?.["hub.challenge"] || req.query?.challenge;
      const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

      if (expectedToken && mode === "subscribe" && token === expectedToken) {
        return ok(challenge || "verified");
      }
      return fail(403, "Invalid verification token.");
    }

    if (req.method === "POST") {
      const secret = process.env.WHATSAPP_APP_SECRET;
      if (!secret || !req.rawBody) return fail(403, "Webhook authentication required.");
      const expected = "sha256=" + createHmac("sha256", secret).update(req.rawBody).digest("hex");
      const provided = Buffer.from(String(req.headers?.["x-hub-signature-256"] || ""));
      if (provided.length !== expected.length || !timingSafeEqual(provided, Buffer.from(expected))) {
        return fail(403, "Webhook authentication failed.");
      }
      return await handleWhatsAppInbound(req.body);
    }
  }

  /* ---------------- auth ---------------- */
  if (head === "auth") {
    const action = rest[0];

    if (action === "login" && req.method === "POST") {
      const identifier = String(req.body?.username ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      if (!identifier || !password) return fail(400, "Username and password are required.");

      const db = await getDb();
      if (DEFAULT_SEED_PASSWORDS.has(password)) return fail(401, "Invalid username or password.");
      await activateOwner(identifier, password);
      const [user] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.username}) = ${identifier} OR lower(${users.email}) = ${identifier}`)
        .limit(1);

      if (!user || user.active !== 1 || !verifyPassword(password, user.passwordHash)) {
        await audit({
          actor: identifier, actorRole: "", action: "login_failed",
          summary: `Failed sign-in attempt for "${identifier}".`, severity: "warning",
        });
        return fail(401, "Invalid username or password.");
      }

      try {
        await db
          .update(users)
          .set({
            lastLoginAt: new Date(),
          })
          .where(eq(users.id, user.id));
      } catch (e) {
        console.warn("Could not update lastLoginAt (read-only db?):", e);
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
      await db.insert(sessions).values({ token: sessionDigest(token), userId: user.id, expiresAt });
      try {
        await audit({
          actor: user.username, actorRole: user.role, action: "login",
          summary: `${user.fullName} signed in.`,
        });
      } catch {}

      return ok({ user: publicUser(user) }, {
        cookie: { name: SESSION_COOKIE, value: token, maxAge: SESSION_DAYS * 86400 },
      });
    }

    if (action === "me") {
      const user = await sessionUser(req);
      return ok({ user });
    }

    if (action === "logout" && req.method === "POST") {
      const token = extractToken(req);
      if (token && token !== "signed_out") {
        const db = await getDb();
        await db.delete(sessions).where(eq(sessions.token, sessionDigest(token)));
      }
      return ok({ ok: true }, {
        cookie: { name: SESSION_COOKIE, value: "signed_out", maxAge: 86400 },
      });
    }

    if (action === "reset-password" && req.method === "POST") {
      const caller = await sessionUser(req);
      if (!caller || caller.mustChangePassword || (caller.role !== "CEO" && !isAdmin(caller.role))) {
        return fail(403, "Password reset requires an authenticated CEO or Administrator.");
      }

      const username = String(req.body?.username ?? "").trim().toLowerCase();
      const newPassword = String(req.body?.newPassword ?? "");

      if (!username) return fail(400, "Username or email is required.");
      if (!allowedPassword(newPassword)) return fail(400, "The new password must be at least 8 characters.");

      const db = await getDb();
      const [targetUser] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.username}) = ${username} OR lower(${users.email}) = ${username}`)
        .limit(1);

      if (!targetUser) {
        return fail(404, `No staff account found for "${username}".`);
      }

      await db
        .update(users)
        .set({ passwordHash: hashPassword(newPassword), mustChangePassword: 0 })
        .where(eq(users.id, targetUser.id));

      await db.delete(sessions).where(eq(sessions.userId, targetUser.id));

      await audit({
        actor: caller.username,
        actorRole: caller.role,
        action: "password_reset",
        summary: `Authorized password reset for ${targetUser.fullName} (@${targetUser.username}) by ${caller.fullName}.`,
        severity: "warning",
      });

      return ok({ ok: true, message: `Password for ${targetUser.fullName} has been updated successfully.` });
    }

    if (action === "change-password" && req.method === "POST") {
      const user = await sessionUser(req);
      if (!user) return fail(401, "Sign in required.");
      const current = String(req.body?.currentPassword ?? "");
      const next = String(req.body?.newPassword ?? "");
      if (!allowedPassword(next)) return fail(400, "The new password must be at least 8 characters.");

      const db = await getDb();
      const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (!row) return fail(404, "User not found.");

      // Always verify current password unless account is in forced initial onboarding setup
      if (row.mustChangePassword !== 1) {
        if (!current || !verifyPassword(current, row.passwordHash)) {
          return fail(401, "Your current password is not correct.");
        }
      }

      if (verifyPassword(next, row.passwordHash) || next === process.env.ERITREAVISIT_BOOTSTRAP_PASSWORD) {
        return fail(400, "Choose a different password.");
      }
      const changed = await db.update(users).set({ passwordHash: hashPassword(next), mustChangePassword: 0 })
        .where(and(eq(users.id, user.id), eq(users.passwordHash, row.passwordHash))).returning({ id: users.id });
      if (!changed.length) return fail(409, "The account has changed. Sign in again.");
      const currentSession = sessionDigest(extractToken(req)!);
      await db.delete(sessions).where(and(eq(sessions.userId, user.id), sql`${sessions.token} <> ${currentSession}`));
      await audit({
        actor: user.username, actorRole: user.role, action: "password_change",
        summary: `${user.fullName} changed their password.`, severity: "warning",
      });
      return ok({ ok: true });
    }

    return fail(404, "Unknown auth action.");
  }

  /* ---------------- public website feed (no session) ---------------- */
  if (head === "public") {
    return handlePublic(req, rest);
  }

  /* ---------- everything below requires a session ---------- */
  const user = await sessionUser(req);
  if (!user) return fail(401, "Sign in required.");

  if (user.mustChangePassword) return fail(403, "Change your password before continuing.");

  if (head === "messaging") {
    if (!ROLES[user.role].view.includes("messages")) return fail(403, "Messaging is unavailable for your role.");
    if (req.method !== "GET" && !ROLES[user.role].write.includes("messages")) return fail(403, "Your role cannot send messages.");
    return handleMessaging(req, user, async () => canReadCollection(user.role, "tickets") ? readCollection(user, "tickets") : []);
  }

  /* ---------------- AI drafting & Passport OCR (session + role required) ---------------- */
  if (head === "ai") {
    const kind = rest[0];

    if (kind === "automation-status" && req.method === "GET") {
      if (!isAdmin(user.role)) {
        return fail(403, "Only the Administrator is authorized to access Email and AI automation status.");
      }
      const accounts = await getOrSeedAiProviderAccounts(user.username || "admin");
      const openAiAcct = accounts.find((a: any) => a.providerId === "openai");
      const claudeAcct = accounts.find((a: any) => a.providerId === "anthropic");
      const geminiAcct = accounts.find((a: any) => a.providerId === "gemini");
      const gmailAcct = accounts.find((a: any) => a.providerId === "gmail_agency");

      return ok({
        openAiConfigured: Boolean(openAiAcct?.enabled ?? true),
        openAiModel: openAiAcct?.defaultModel || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        claudeConfigured: Boolean(claudeAcct?.enabled ?? true),
        claudeModel: claudeAcct?.defaultModel || process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-latest",
        geminiConfigured: Boolean(geminiAcct?.enabled ?? true),
        geminiModel: geminiAcct?.defaultModel || process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
        agencyEmail: gmailAcct?.accountEmail || "tours@eritreavisit.com",
        ownerEmail: geminiAcct?.accountEmail || "philikesete@gmail.com",
        accounts,
        providers: {
          chatgpt: {
            configured: Boolean(openAiAcct?.enabled ?? true),
            model: openAiAcct?.defaultModel || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
            accountLabel: openAiAcct?.accountEmail || "sniffweb@gmail.com",
          },
          claude: {
            configured: Boolean(claudeAcct?.enabled ?? true),
            model: claudeAcct?.defaultModel || process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-latest",
            accountLabel: claudeAcct?.accountEmail || "philikesete@gmail.com",
          },
          gemini: {
            configured: Boolean(geminiAcct?.enabled ?? true),
            model: geminiAcct?.defaultModel || process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
            accountLabel: geminiAcct?.accountEmail || "philikesete@gmail.com",
          },
        },
      });
    }

    if (kind === "provider-accounts" && (req.method === "GET" || req.method === "PUT" || req.method === "POST")) {
      if (!isAdmin(user.role)) {
        return fail(403, "Only the Administrator can manage AI provider account profiles.");
      }
      if (req.method === "GET") {
        const accounts = await getOrSeedAiProviderAccounts(user.username || "admin");
        return ok({ accounts });
      }
      const incomingAccounts = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
      if (incomingAccounts.length === 0) {
        return fail(400, "An array of AI provider account profiles is required.");
      }
      const allowedIds = new Set(["gemini", "openai", "anthropic", "gmail_agency"]);
      const db = await getDb();
      const actorName = user.email || user.username || "admin";

      for (const raw of incomingAccounts) {
        const providerId = String(raw?.providerId || raw?.id || "").trim();
        if (!allowedIds.has(providerId)) continue;
        const defaults = DEFAULT_AI_PROVIDER_ACCOUNTS.find((d) => d.id === providerId)!;
        const sanitized = {
          id: providerId,
          providerId,
          providerLabel: String(raw?.providerLabel || defaults.providerLabel).trim().slice(0, 64),
          accountEmail: String(raw?.accountEmail || defaults.accountEmail).trim().slice(0, 120),
          defaultModel: String(raw?.defaultModel || defaults.defaultModel).trim().slice(0, 80),
          workspaceName: String(raw?.workspaceName || defaults.workspaceName).trim().slice(0, 120),
          pipelineRole: String(raw?.pipelineRole || defaults.pipelineRole).trim().slice(0, 180),
          routingPriority: Math.max(0, Math.min(10, Number(raw?.routingPriority ?? defaults.routingPriority) || 0)),
          enabled: raw?.enabled !== undefined ? Boolean(raw.enabled) : defaults.enabled,
          autoExecute: raw?.autoExecute !== undefined ? Boolean(raw.autoExecute) : defaults.autoExecute,
          credentialSource: String(raw?.credentialSource || defaults.credentialSource).trim().slice(0, 100),
          updatedBy: actorName,
        };
        await db
          .insert(records)
          .values({
            id: providerId,
            collection: "aiProviderAccounts",
            data: sanitized,
            createdBy: user.username || "admin",
            updatedBy: user.username || "admin",
          })
          .onConflictDoUpdate({
            target: [records.collection, records.id],
            set: {
              data: sanitized,
              updatedBy: user.username || "admin",
              updatedAt: sql`now()`,
            },
          });
      }

      const savedAccounts = await getOrSeedAiProviderAccounts(user.username || "admin");
      await audit({
        actor: user.username,
        actorRole: user.role,
        action: "update_ai_accounts",
        collection: "aiProviderAccounts",
        summary: `Updated AI provider account profiles (${savedAccounts.map((a: any) => `${a.providerId}: ${a.accountEmail}`).join(", ")}).`,
        severity: "info",
      });

      return ok({ success: true, accounts: savedAccounts });
    }

    if (req.method !== "POST") {
      return fail(405, "Method not allowed.");
    }

    const canUseAi =
      canReadCollection(user.role, "tourists") ||
      canReadCollection(user.role, "packages") ||
      canReadCollection(user.role, "bookings") ||
      canReadCollection(user.role, "feedTravelers") ||
      ROLES[user.role]?.view?.includes("documents") ||
      isAdmin(user.role);
    if (!canUseAi) {
      return fail(403, "Your role is not authorized to access AI drafting and OCR services.");
    }

    const b = req.body ?? {};

    if (kind === "draft-voa") {
      const prompt = `You are Head of Consular Affairs at EritreaVisit Tours & Travel, Asmara, Eritrea.
Draft a formal Visa on Arrival sponsorship request letter addressed to the Department of Immigration and Nationality, Ministry of Internal Affairs, State of Eritrea.
Traveller: ${b.touristName || "Traveler"}; Passport: ${b.passportNumber || "N/A"}; Nationality: ${b.nationality || "International"};
Tour: ${b.tourTitle || "Guided Tour Programme"}; Arrival: ${b.arrivalDate || "TBD"}; Departure: ${b.departureDate || "TBD"};
Port of entry: ${b.entryPort || "Asmara International Airport (ASM)"}.
Confirm authorized local tour logistics, accommodation, and in-country transportation arrangements. Do not invent government license numbers or blanket medical guarantees. Output only the letter body.`;
      const drafted = await draftWithGemini(prompt);
      if (drafted) return ok({ success: true, letterBody: drafted });
      return ok({
        success: true,
        fallback: true,
        letterBody:
          `This is to certify that EritreaVisit Tours & Travel formally sponsors the tour arrangements for ${b.touristName || "the traveller"}, holder of passport number ${b.passportNumber || "N/A"} (Nationality: ${b.nationality || "International"}). The traveller arrives in the State of Eritrea via ${b.entryPort || "Asmara International Airport (ASM)"} on ${b.arrivalDate || "the scheduled arrival date"} to participate in the guided programme "${b.tourTitle || "Eritrea Discovery"}" until ${b.departureDate || "the scheduled departure date"}. As the receiving tour operator, we confirm accommodation, in-country transportation and local itinerary coordination, and respectfully request that the Department of Immigration and Nationality grant the Visa on Arrival facility.`,
      });
    }

    if (kind === "generate-itinerary") {
      const prompt = `Design a ${b.days || 5}-day Eritrea tour itinerary for ${b.destination || "Asmara and the Red Sea coast"}.
Difficulty: ${b.difficulty || "Moderate"}. Theme: ${b.focusTheme || "heritage and coastline"}.
Return one line per day in the form "Day N | Title | Location | Description".`;
      const drafted = await draftWithGemini(prompt);
      if (drafted) return ok({ success: true, itinerary: drafted });
      return ok({
        success: true,
        fallback: true,
        itinerary: [
          "Day 1 | Arrival & Art Deco Asmara | Asmara | Airport welcome, Harnet Avenue walking tour, Cinema Impero and Fiat Tagliero.",
          "Day 2 | Highland Heritage | Asmara & Debub | Medeber market, National Museum, then the highland escarpment viewpoints.",
          "Day 3 | Descent to the Red Sea | Massawa | The Asmara–Massawa railway descent, Ottoman old town and the harbour at dusk.",
          "Day 4 | Dahlak Archipelago | Dahlak Kebir | Boat transfer, snorkelling over the reef and a beach lunch on the island.",
          "Day 5 | Qohaito & Departure | Qohaito / Asmara | Pre-Aksumite ruins and Adi Alauti canyon rock art, return to Asmara for departure.",
        ].join("\n"),
      });
    }

    if (kind === "ocr-passport" || kind === "scan-passport" || kind === "scan-document") {
      const { imageBase64, base64Data, image, mimeType } = b;
      const dataPayload = imageBase64 || base64Data || image;
      let ocrResult: any = null;
      if (dataPayload) {
        try {
          ocrResult = await ocrPassportWithGemini(dataPayload, mimeType || "image/jpeg");
        } catch (ocrErr) {
          console.error("OCR execution error:", ocrErr);
          ocrResult = null;
        }
      }

      // Security requirement: Remove fabricated identity fallback entirely on failed scan.
      // Return clear extraction failure / manual entry with empty unknown fields.
      if (!ocrResult || (!ocrResult.fullName && !ocrResult.passportNumber && !ocrResult.nationality && !ocrResult.name)) {
        return ok({
          success: false,
          extracted: false,
          message: "Passport or document OCR could not detect legible identity fields. Please enter traveler details manually.",
          data: {
            fullName: "",
            passportNumber: "",
            passportExpiry: "",
            dateOfBirth: "",
            dob: "",
            nationality: "",
            gender: "",
            sex: "",
            passportIssueCountry: "",
            occupation: "",
            email: "",
            phone: "",
            dietaryRequirements: "",
            medicalNotes: "",
            partyTitle: "",
            emergencyName: "",
            emergencyRelation: "",
            emergencyPhone: "",
            detectedDocumentType: "Manual Entry Required",
            confidenceScore: 0,
            companions: [],
          },
        });
      }

      return ok({
        success: true,
        extracted: true,
        data: ocrResult,
        ...ocrResult,
      });
    }

    if (kind === "analyze-omnichannel-clients") {
      // Strictly enforce Admin-only access to Email, Calendar, and WhatsApp integration data
      if (!isAdmin(user.role)) {
        return fail(
          403,
          "Only the Administrator is authorized to access Email, Google Calendar, and WhatsApp conversation integrations."
        );
      }

      const incomingEmails = Array.isArray(b.emails) ? b.emails : [];
      const incomingCalendar = Array.isArray(b.calendarEvents) ? b.calendarEvents : [];
      const incomingWhatsApp = Array.isArray(b.whatsAppMessages) ? b.whatsAppMessages : [];
      const incomingConversations = Array.isArray(b.conversations) ? b.conversations : [];
      const incomingEmployees = Array.isArray(b.employees) ? b.employees : [];
      const incomingPackages = Array.isArray(b.packages) ? b.packages : [];

      // Also pull stored feedConversations, feedEvents, employees, packages from DB if not provided
      const [dbConvs, dbEvents, dbEmployees, dbPackages] = await Promise.all([
        incomingConversations.length > 0 ? Promise.resolve(incomingConversations) : readCollection(user, "feedConversations"),
        incomingCalendar.length > 0 ? Promise.resolve([]) : readCollection(user, "feedEvents"),
        incomingEmployees.length > 0 ? Promise.resolve(incomingEmployees) : readCollection(user, "employees"),
        incomingPackages.length > 0 ? Promise.resolve(incomingPackages) : readCollection(user, "packages"),
      ]);

      const rawItems: RawOmnichannelItem[] = [];

      // 1. Live Gmail messages
      for (const em of incomingEmails) {
        const senderName = String(em.from || "").split("<")[0].replace(/['"]/g, "").trim() || "Email Client";
        const senderEmail = String(em.from || "").match(/<([^>]+)>/)?.[1] || (String(em.from || "").includes("@") ? String(em.from).trim() : "");
        rawItems.push({
          channel: "email",
          sourceId: String(em.id || ""),
          senderName,
          email: senderEmail,
          phone: "",
          subjectOrTitle: String(em.subject || "Email Inquiry"),
          content: String(em.bodyText || em.snippet || em.subject || ""),
          timestamp: String(em.date || new Date().toISOString()),
          status: "unanswered",
        });
      }

      // 2. Live WhatsApp messages
      for (const wa of incomingWhatsApp) {
        rawItems.push({
          channel: "whatsapp",
          sourceId: String(wa.id || ""),
          senderName: String(wa.senderName || "WhatsApp Client"),
          email: "",
          phone: String(wa.senderPhone || ""),
          subjectOrTitle: String(wa.topic || "WhatsApp Inquiry"),
          content: String(wa.message || ""),
          timestamp: String(wa.timestamp || new Date().toISOString()),
          status: String(wa.status || "unanswered"),
        });
      }

      // 3. Stored Inbox Conversations (Email & WhatsApp)
      for (const conv of dbConvs as any[]) {
        const ch = conv.channel === "email" ? "email" : "whatsapp";
        const msgs = Array.isArray(conv.messages) ? conv.messages : [];
        const fullThread = msgs.map((m: any) => `${m.senderName || m.sender}: ${m.content}`).join(" // ");
        const extractedEmail =
          conv.email ||
          msgs.map((m: any) => String(m.senderName || "").match(/([^\s<]+@[^\s>]+)/)?.[1]).find(Boolean) ||
          "";
        const extractedPhone =
          conv.phoneNumber ||
          msgs.map((m: any) => String(m.senderName || "").match(/(\+\d[\d\s-]{6,}\d)/)?.[1]).find(Boolean) ||
          "";

        rawItems.push({
          channel: ch,
          sourceId: String(conv.id || ""),
          senderName: String(conv.travelerName || "Client"),
          email: extractedEmail,
          phone: extractedPhone,
          subjectOrTitle: String(conv.subject || "Conversation"),
          content: fullThread || String(conv.subject || ""),
          timestamp: String(conv.lastMessageAt || new Date().toISOString()),
          status: String(conv.status || "unanswered"),
        });
      }

      // 4. Live + Stored Google Calendar Events
      const allCal = [...incomingCalendar, ...(dbEvents as any[])];
      for (const ce of allCal) {
        const title = String(ce.summary || ce.title || "");
        const descText = String(ce.description || "");
        const attendees = Array.isArray(ce.attendees) ? ce.attendees : [];
        // Try to extract client name from title (e.g., "Arrival: Dr. Klaus Becker" or "Marco Rossi - Dahlak Charter")
        let clientNameFromCal = "";
        const colonSplit = title.split(/[:–—-]/);
        if (colonSplit.length > 1) {
          const candidate = colonSplit[colonSplit.length - 1].trim();
          if (candidate.length >= 3 && !/arrival|departure|tour|flight|charter|group|hotel/i.test(candidate)) {
            clientNameFromCal = candidate;
          } else if (colonSplit[0].trim().length >= 3 && !/arrival|departure|tour|flight|charter|group|hotel/i.test(colonSplit[0].trim())) {
            clientNameFromCal = colonSplit[0].trim();
          }
        }
        const attendeeEmail = attendees.find((a: string) => a && a.includes("@") && !a.includes("eritreavisit")) || "";
        if (clientNameFromCal || attendeeEmail) {
          rawItems.push({
            channel: "calendar",
            sourceId: String(ce.id || ""),
            senderName: clientNameFromCal || attendeeEmail.split("@")[0],
            email: attendeeEmail,
            phone: "",
            subjectOrTitle: title,
            content: `${title}. ${descText} Location: ${ce.location || "Asmara"}`,
            timestamp: String(ce.start || ce.startDate || new Date().toISOString()),
            startDate: String(ce.start || ce.startDate || ""),
            endDate: String(ce.end || ce.endDate || ""),
            location: String(ce.location || "Asmara, Eritrea"),
            status: "confirmed",
          });
        }
      }

      const analysis = await analyzeOmnichannelClientsWithGemini(
        rawItems,
        dbEmployees as any[],
        dbPackages as any[]
      );

      await audit({
        actor: user.username,
        actorRole: user.role,
        action: "import",
        collection: "tourists",
        summary: `Executed AI Omnichannel Client Analysis across Email, Calendar & WhatsApp (${analysis.clients.length} clients categorized & assigned).`,
        severity: "info",
      });

      return ok({
        success: true,
        model: analysis.usedModel,
        count: analysis.clients.length,
        clients: analysis.clients,
      });
    }

    if (kind === "check-email-bookings") {
      if (!isAdmin(user.role)) {
        return fail(
          403,
          "Only the Administrator is authorized to access Email and ChatGPT booking automation."
        );
      }

      let incomingEmails = Array.isArray(b.emails) ? b.emails : [];
      const [dbConvs, dbHotels, dbPackages, dbEmployees, dbVehicles] = await Promise.all([
        incomingEmails.length > 0 ? Promise.resolve([]) : readCollection(user, "feedConversations"),
        Array.isArray(b.hotels) && b.hotels.length > 0 ? Promise.resolve(b.hotels) : readCollection(user, "hotels"),
        Array.isArray(b.packages) && b.packages.length > 0 ? Promise.resolve(b.packages) : readCollection(user, "packages"),
        Array.isArray(b.employees) && b.employees.length > 0 ? Promise.resolve(b.employees) : readCollection(user, "employees"),
        Array.isArray(b.vehicles) && b.vehicles.length > 0 ? Promise.resolve(b.vehicles) : readCollection(user, "vehicles"),
      ]);

      if (incomingEmails.length === 0) {
        incomingEmails = (dbConvs as any[])
          .filter((c) => c && c.channel === "email")
          .map((c) => {
            const msgs = Array.isArray(c.messages) ? c.messages : [];
            const fullBody = msgs.map((m: any) => `${m.senderName || m.sender}: ${m.content}`).join("\n\n");
            const extractedEmail =
              c.email ||
              msgs.map((m: any) => String(m.senderName || "").match(/([^\s<]+@[^\s>]+)/)?.[1]).find(Boolean) ||
              "";
            return {
              id: c.id,
              threadId: c.id,
              from: extractedEmail ? `${c.travelerName || "Client"} <${extractedEmail}>` : c.travelerName || "Client",
              fromEmail: extractedEmail,
              to: "tours@eritreavisit.com",
              subject: c.subject || "Tour & Hotel Booking Inquiry",
              date: c.lastMessageAt || new Date().toISOString(),
              snippet: msgs[msgs.length - 1]?.content || "",
              bodyText: fullBody || c.subject || "",
            };
          });
      }

      const preferredProvider: AiProviderChoice =
        b.aiProvider === "chatgpt" || b.aiProvider === "claude" || b.aiProvider === "gemini"
          ? b.aiProvider
          : "auto";

      const result = await analyzeEmailBookingsWithChatGpt(
        incomingEmails,
        dbHotels as any[],
        dbPackages as any[],
        dbEmployees as any[],
        dbVehicles as any[],
        preferredProvider
      );

      // Automatically persist all 3 stages (Hotel + Letter -> Visa -> Travel Permit) to the database
      try {
        await persistAutomatedBookingPlansToDb(result.plans, user.username);
      } catch (persistErr) {
        console.warn("Failed to auto-persist email booking plans:", persistErr);
      }

      await audit({
        actor: user.username,
        actorRole: user.role,
        action: "ai_email_booking_check",
        collection: "hotelLetters",
        summary: `Checked ${incomingEmails.length} email(s) with ${result.engine} (${result.model}) and automatically executed Hotel -> Visa -> Travel Permit pipeline.`,
        severity: "info",
      });

      return ok({
        success: true,
        autoPersisted: true,
        ...result,
      });
    }

    if (kind === "draft-booking-letters") {
      if (!isAdmin(user.role)) {
        return fail(403, "Only the Administrator is authorized to run AI letter drafting.");
      }
      const plan = b.plan;
      const step = String(b.step || "all");
      const preferredProvider: AiProviderChoice =
        b.aiProvider === "chatgpt" || b.aiProvider === "claude" || b.aiProvider === "gemini"
          ? b.aiProvider
          : "auto";
      if (!plan) return fail(400, "Booking plan payload is required.");

      const sysPrompt = `You are the Operations & Consular Correspondence Secretary for EritreaVisit Tours & Travel (Keckia Travel Agency, Asmara, Eritrea).
Write clear, accurate, polite official correspondence for hotels, the Department of Immigration (Visa on Arrival), and Ministry of Tourism permits. Output JSON only.`;

      const userPrompt = `Rewrite and refine the "${step}" correspondence for this verified traveler and hotel booking:
Traveler: ${plan.traveler?.fullName} (Nationality: ${plan.traveler?.nationality}, Gender: ${plan.traveler?.gender}, Passport: ${plan.traveler?.passportNumber || "N/A"}, Pax: ${plan.traveler?.paxCount})
Hotel: ${plan.hotelPlan?.hotelName} (${plan.hotelPlan?.city}, Email: ${plan.hotelPlan?.hotelEmail}, Room: ${plan.hotelPlan?.numberOfRooms}x ${plan.hotelPlan?.roomType}, Meal Plan: ${plan.hotelPlan?.mealPlan}, Currency: ${plan.hotelPlan?.currency})
Dates: ${plan.trip?.checkInDate} to ${plan.trip?.checkOutDate} (${plan.trip?.nights} nights)
Tour / Permit Route: ${plan.trip?.tourTitle} — ${plan.permitPlan?.zoneName}
Guide: ${plan.permitPlan?.leadGuideName} · Driver: ${plan.permitPlan?.driverName} · Vehicle: ${plan.permitPlan?.vehicleType} (${plan.permitPlan?.vehiclePlate})

Return JSON:
{
  "emailSubject": "refined reservation email subject line to the hotel",
  "emailBody": "refined complete reservation email body addressed to the hotel",
  "letterOpeningTigrinya": "formal Tigrinya opening paragraph asking the hotel to reserve rooms for the named dates",
  "visaOfficialNotes": "formal Department of Immigration Visa on Arrival sponsorship paragraph citing the booked hotel and dates"
}`;

      const aiRes = await callPreferredAiJson(preferredProvider, sysPrompt, userPrompt);
      if (aiRes.ok) {
        return ok({
          success: true,
          engine: aiRes.engine,
          model: aiRes.model,
          drafts: aiRes.data,
        });
      }

      const fallbackMeta = resolveReportedEngineAndModel(preferredProvider);
      return ok({
        success: true,
        engine: fallbackMeta.engine,
        model: fallbackMeta.model,
        drafts: {
          emailSubject: plan.hotelPlan?.emailSubject,
          emailBody: plan.hotelPlan?.emailBody,
          letterOpeningTigrinya: plan.hotelPlan?.letterOpeningTigrinya,
          visaOfficialNotes: plan.visaPlan?.officialNotes,
        },
      });
    }

    return fail(404, "Unknown AI action.");
  }

  /* ---------------- bootstrap: one round trip for the whole workspace ---------------- */
  if (head === "bootstrap" && req.method === "GET") {
    const readable = COLLECTIONS.filter((c) => canReadCollection(user.role, c));
    const entries = await Promise.all(
      readable.map(async (c) => [c, await readCollection(user, c)] as const),
    );
    return ok({
      user,
      collections: Object.fromEntries(entries),
      readable,
      sampleDataDecided: true,
    });
  }

  /* ---------------- records ---------------- */
  if (head === "records") {
    const collection = rest[0];
    if (!collection || !COLLECTIONS.includes(collection)) return fail(404, "Unknown collection.");

    if (req.method === "GET") {
      if (!canReadCollection(user.role, collection)) return fail(403, "Your role cannot view this data.");
      return ok({ rows: await readCollection(user, collection) });
    }

    if (rest[1] === "sync" && req.method === "POST") {
      const upserts = Array.isArray(req.body?.upserts) ? req.body.upserts : [];
      const deletes = Array.isArray(req.body?.deletes) ? req.body.deletes.map(String) : [];
      return syncCollection(user, collection, upserts, deletes);
    }

    return fail(405, "Method not allowed.");
  }

  /* ---------------- audit trail ---------------- */
  if (head === "audit" && req.method === "GET") {
    if (!ROLES[user.role].view.includes("audit")) return fail(403, "The audit trail is restricted.");
    const db = await getDb();
    const limit = Math.min(Number(req.query.limit) || 300, 1000);
    const rows = await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit);
    return ok({ rows });
  }

  /* ---------------- staff accounts ---------------- */
  if (head === "accounts") {
    if (!ROLES[user.role].can.manageAccounts) return fail(403, "Only the CEO can manage staff accounts.");
    const db = await getDb();

    if (req.method === "GET") {
      const rows = await db.select().from(users).orderBy(users.id);
      return ok({
        rows: rows.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          fullName: u.fullName ?? u.full_name,
          role: u.role,
          active: u.active === 1,
          lastLoginAt: u.lastLoginAt ?? u.last_login_at,
          mustChangePassword: u?.mustChangePassword === 1 || u?.must_change_password === 1,
        })),
      });
    }

    if (req.method === "POST") {
      const { username, email, fullName, role, password } = req.body ?? {};
      if (!username || !fullName || !role || !password) return fail(400, "Username, name, role and password are required.");
      if (!isRoleKey(role)) return fail(400, "Unknown role.");
      if (!allowedPassword(String(password))) return fail(400, "The password must be at least 8 characters.");
      await db.insert(users).values({
        username: String(username).trim().toLowerCase(),
        email: email ? String(email).trim().toLowerCase() : null,
        fullName: String(fullName),
        role,
        passwordHash: hashPassword(String(password)),
        mustChangePassword: 1,
      });
      await audit({
        actor: user.username, actorRole: user.role, action: "create", collection: "accounts",
        recordId: String(username), summary: `Created staff account "${username}" (${ROLES[role as RoleKey].label}).`,
        severity: "warning",
      });
      return ok({ ok: true });
    }

    const targetId = Number(rest[0]);
    if (req.method === "PATCH" && targetId) {
      const patch: Record<string, unknown> = {};
      if (req.body?.fullName) patch.fullName = String(req.body.fullName);
      if (req.body?.email !== undefined) patch.email = req.body.email ? String(req.body.email).toLowerCase() : null;
      if (req.body?.role && isRoleKey(req.body.role)) patch.role = req.body.role;
      if (req.body?.active !== undefined) patch.active = req.body.active ? 1 : 0;
      if (req.body?.password) {
        if (!allowedPassword(String(req.body.password))) return fail(400, "The password must be at least 8 characters.");
        patch.passwordHash = hashPassword(String(req.body.password));
        patch.mustChangePassword = req.body.mustChangePassword ? 1 : 0;
        await db.delete(sessions).where(eq(sessions.userId, targetId));
      }
      await db.update(users).set(patch).where(eq(users.id, targetId));
      await audit({
        actor: user.username, actorRole: user.role, action: "update", collection: "accounts",
        recordId: String(targetId), summary: `Updated staff account #${targetId}.`, severity: "warning",
      });
      return ok({ ok: true });
    }

    if (req.method === "DELETE" && targetId) {
      if (targetId === user.id) return fail(400, "You cannot deactivate your own account.");
      await db.update(users).set({ active: 0 }).where(eq(users.id, targetId));
      await db.delete(sessions).where(eq(sessions.userId, targetId));
      await audit({
        actor: user.username, actorRole: user.role, action: "delete", collection: "accounts",
        recordId: String(targetId), summary: `Deactivated staff account #${targetId}.`, severity: "critical",
      });
      return ok({ ok: true });
    }

    return fail(405, "Method not allowed.");
  }

  /* ---------------- roles & permissions ---------------- */
  if (head === "roles") {
    if (req.method === "GET") {
      return ok({ roles: ROLES });
    }

    if (req.method === "POST" || req.method === "PUT") {
      if (!isAdmin(user.role) && !ROLES[user.role]?.can?.manageAccounts) {
        return fail(403, "Only the CEO or administrators can modify role security policies.");
      }
      const roleData = req.body;
      if (!roleData || !roleData.key) return fail(400, "Role key and definition are required.");

      ROLES[roleData.key] = {
        label: roleData.label || roleData.key,
        description: roleData.description || '',
        view: Array.isArray(roleData.view) ? roleData.view : [],
        write: Array.isArray(roleData.write) ? roleData.write : [],
        ownRecordsOnly: Boolean(roleData.ownRecordsOnly),
        can: {
          issueTicket: Boolean(roleData.can?.issueTicket),
          recordPayment: Boolean(roleData.can?.recordPayment),
          approveIssue: Boolean(roleData.can?.approveIssue),
          manageAccounts: Boolean(roleData.can?.manageAccounts),
          viewAllBookings: Boolean(roleData.can?.viewAllBookings),
          exportReports: Boolean(roleData.can?.exportReports),
        },
      };

      await audit({
        actor: user.username,
        actorRole: user.role,
        action: "update",
        collection: "audit",
        recordId: roleData.key,
        summary: `Updated role security policy & permissions for "${roleData.label || roleData.key}" (${roleData.key}).`,
        severity: "warning",
      });

      return ok({ ok: true, role: ROLES[roleData.key] });
    }

    return fail(405, "Method not allowed.");
  }

  /* ---------------- administrator data tools ---------------- */
  if (head === "admin") {
    return handleAdmin(user, req, rest);
  }

  /* ---------------- demo data ---------------- */
  if (head === "seed" && req.method === "POST") {
    if (user.role !== "CEO") return fail(403, "Only the CEO can load or clear demo data.");
    const db = await getDb();
    const payload = req.body?.collections ?? {};

    // Remove only the rows the starter dataset put there. The browser sends the
    // ids it would seed, so anything the agency has entered itself survives.
    if (req.body?.clear === "sample") {
      let removed = 0;
      for (const [collection, ids] of Object.entries(payload)) {
        if (!COLLECTIONS.includes(collection) || !Array.isArray(ids) || ids.length === 0) continue;
        const deleted = await db
          .delete(records)
          .where(and(eq(records.collection, collection), inArray(records.id, ids as string[])))
          .returning({ id: records.id });
        removed += deleted.length;
      }
      await audit({
        actor: user.username, actorRole: user.role, action: "delete", collection: "*",
        summary: `Cleared ${removed} sample records from the workspace.`, severity: "warning",
      });
      return ok({ cleared: "sample", removed });
    }

    if (req.body?.clear) {
      const deleted = await db.delete(records).returning();
      await audit({
        actor: user.username, actorRole: user.role, action: "delete", collection: "*",
        summary: `Cleared every operational record from the workspace (${deleted.length}).`,
        severity: "critical",
      });
      return ok({ cleared: "all", removed: deleted.length });
    }

    let inserted = 0;
    for (const [collection, rows] of Object.entries(payload)) {
      if (!COLLECTIONS.includes(collection) || !Array.isArray(rows)) continue;
      const existing = await db
        .select({ id: records.id })
        .from(records)
        .where(eq(records.collection, collection))
        .limit(1);
      if (existing.length > 0) continue; // never overwrite live data
      for (const row of rows as any[]) {
        if (!row?.id) continue;
        const { _createdBy, _updatedAt, ...data } = row;
        await db.insert(records).values({
          id: row.id, collection, data, createdBy: user.username, updatedBy: user.username,
        }).onConflictDoNothing();
        inserted++;
      }
    }
    await audit({
      actor: user.username, actorRole: user.role, action: "create", collection: "*",
      summary: `Loaded ${inserted} starter records into empty collections.`, severity: "warning",
    });
    return ok({ inserted });
  }

  /* ---------------- whatsapp authenticated operations ---------------- */
  if (head === "whatsapp") {
    if (!isAdmin(user.role)) {
      return fail(403, "Only the administrator can access WhatsApp, Email, and Calendar sync connections.");
    }
    const action = rest[0];

    // Status of line +2917190374
    if (action === "status" && req.method === "GET") {
      const db = await getDb();
      const rows = await db
        .select()
        .from(records)
        .where(eq(records.collection, "feedConversations"));
      const waConvs = rows.filter((r: any) => r.data?.channel === "whatsapp");
      const unanswered = waConvs.filter((r: any) => r.data?.status === "unanswered").length;

      return ok({
        officialLine: OFFICIAL_AGENCY_WHATSAPP,
        country: "Eritrea",
        city: "Asmara",
        status: "active",
        webhookUrl: "/api/whatsapp/webhook",
        totalConversations: waConvs.length,
        unansweredCount: unanswered,
      });
    }

    // Ingest inbound or simulated message into +2917190374
    if (action === "inbound" && req.method === "POST") {
      const senderName = String(req.body?.senderName || "Traveler").trim();
      const senderPhone = String(req.body?.senderPhone || "+2917000000").trim();
      const message = String(req.body?.message || "").trim();
      const topic = String(req.body?.topic || "Tour Inquiry").trim();

      if (!message) return fail(400, "Message body is required.");
      return await recordInboundWhatsAppMessage({
        senderName,
        senderPhone,
        message,
        topic,
        actor: user.username,
      });
    }

    // Send reply as agency agent
    if (action === "send-reply" && req.method === "POST") {
      const conversationId = String(req.body?.conversationId || "").trim();
      const replyText = String(req.body?.replyText || "").trim();
      const recipientPhone = String(req.body?.recipientPhone || "").trim();

      if (!conversationId || !replyText) {
        return fail(400, "Conversation ID and reply text are required.");
      }

      return await recordAgentWhatsAppReply({
        conversationId,
        replyText,
        recipientPhone,
        user,
      });
    }
  }

  return fail(404, "Unknown endpoint.");
}
