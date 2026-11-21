import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export const AGENCY_EMAIL = "tours@eritreavisit.com";
export const CALENDAR_EMAIL = "philikesete@gmail.com";
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
    return false;
  }
}

// Validate Firestore connection on client boot
if (typeof window !== "undefined") {
  void testConnection();
}

export interface AiProviderAccountProfile {
  providerId: "gemini" | "openai" | "anthropic" | "gmail_agency";
  providerLabel: string;
  accountEmail: string;
  defaultModel: string;
  workspaceName: string;
  pipelineRole: string;
  routingPriority: number;
  enabled: boolean;
  autoExecute: boolean;
  credentialSource: string;
  updatedBy?: string;
}

export const DEFAULT_AI_PROVIDER_ACCOUNTS: AiProviderAccountProfile[] = [
  {
    providerId: "gemini",
    providerLabel: "Google Gemini",
    accountEmail: "philikesete@gmail.com",
    defaultModel: "gemini-2.5-flash",
    workspaceName: "gen-lang-client-0920655872 (AI Studio)",
    pipelineRole: "Visa on Arrival Sponsorship, Itineraries & Passport OCR",
    routingPriority: 3,
    enabled: true,
    autoExecute: true,
    credentialSource: "Server Runtime Proxy (/api/ai/*)",
  },
  {
    providerId: "openai",
    providerLabel: "OpenAI (ChatGPT)",
    accountEmail: "sniffweb@gmail.com",
    defaultModel: "gpt-4o-mini",
    workspaceName: "EritreaVisit Booking Operations",
    pipelineRole: "Primary Email Triage & Hotel Reservation Extraction",
    routingPriority: 1,
    enabled: true,
    autoExecute: true,
    credentialSource: "Server Runtime Proxy (/api/ai/*)",
  },
  {
    providerId: "anthropic",
    providerLabel: "Anthropic (Claude)",
    accountEmail: "philikesete@gmail.com",
    defaultModel: "claude-3-5-sonnet-latest",
    workspaceName: "Keckia Travel Consular Desk",
    pipelineRole: "Official Tigrinya Hotel Letters & Regional Permits",
    routingPriority: 2,
    enabled: true,
    autoExecute: true,
    credentialSource: "Server Runtime Proxy (/api/ai/*)",
  },
  {
    providerId: "gmail_agency",
    providerLabel: "Agency Mailbox (Gmail)",
    accountEmail: AGENCY_EMAIL,
    defaultModel: "Gmail API v1 + Calendar v3",
    workspaceName: "EritreaVisit Tours & Travel Desk",
    pipelineRole: "Strict Inbox Filter (tours@eritreavisit.com) & Hotel Dispatch",
    routingPriority: 0,
    enabled: true,
    autoExecute: true,
    credentialSource: "Google Workspace OAuth",
  },
];

export async function syncAiAccountsToFirestore(
  accounts: AiProviderAccountProfile[]
): Promise<{ synced: number; mode: "firestore" | "backend-only" }> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return { synced: 0, mode: "backend-only" };
  }

  const collectionPath = "ai_accounts";
  let synced = 0;
  for (const acct of accounts) {
    const docPath = `${collectionPath}/${acct.providerId}`;
    const docRef = doc(db, collectionPath, acct.providerId);
    try {
      const existingSnap = await getDoc(docRef);
      const createdAtVal = existingSnap.exists()
        ? existingSnap.data()?.createdAt || serverTimestamp()
        : serverTimestamp();
      const ownerUidVal = existingSnap.exists()
        ? existingSnap.data()?.ownerUid || currentUser.uid
        : currentUser.uid;
      await setDoc(docRef, {
        providerId: acct.providerId,
        providerLabel: String(acct.providerLabel || acct.providerId).slice(0, 64),
        accountEmail: String(acct.accountEmail || "philikesete@gmail.com").slice(0, 120),
        defaultModel: String(acct.defaultModel || "default").slice(0, 80),
        workspaceName: String(acct.workspaceName || "EritreaVisit").slice(0, 120),
        pipelineRole: String(acct.pipelineRole || "Booking Automation").slice(0, 180),
        routingPriority: Math.max(0, Math.min(10, Math.round(Number(acct.routingPriority) || 0))),
        enabled: Boolean(acct.enabled),
        autoExecute: Boolean(acct.autoExecute),
        credentialSource: String(acct.credentialSource || "Server Runtime Proxy").slice(0, 100),
        ownerUid: ownerUidVal,
        updatedBy: String(currentUser.email || acct.updatedBy || "philikesete@gmail.com").slice(0, 120),
        createdAt: createdAtVal,
        updatedAt: serverTimestamp(),
      });
      synced++;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }
  return { synced, mode: "firestore" };
}

export async function loadAiAccountsFromFirestore(): Promise<AiProviderAccountProfile[] | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return null;
  }
  const collectionPath = "ai_accounts";
  try {
    const snap = await getDocs(collection(db, collectionPath));
    if (snap.empty) return null;
    const rows: AiProviderAccountProfile[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d?.providerId) {
        rows.push({
          providerId: d.providerId,
          providerLabel: String(d.providerLabel || d.providerId),
          accountEmail: String(d.accountEmail || ""),
          defaultModel: String(d.defaultModel || ""),
          workspaceName: String(d.workspaceName || ""),
          pipelineRole: String(d.pipelineRole || ""),
          routingPriority: Number(d.routingPriority ?? 0),
          enabled: Boolean(d.enabled),
          autoExecute: Boolean(d.autoExecute),
          credentialSource: String(d.credentialSource || "Server Runtime Proxy (/api/ai/*)"),
          updatedBy: String(d.updatedBy || ""),
        });
      }
    });
    return rows.length > 0 ? rows : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function syncAutomationPlanToFirestore(plan: {
  planId: string;
  travelerName: string;
  hotelName: string;
  hotelRefNumber: string;
  visaDocNumber: string;
  permitNumber: string;
  status: "pending" | "in_progress" | "completed";
}): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return false;
  }
  const safeId = String(plan.planId || "plan")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 128);
  const path = `automation_plans/${safeId}`;
  const docRef = doc(db, "automation_plans", safeId);
  try {
    const existingSnap = await getDoc(docRef);
    const createdAtVal = existingSnap.exists()
      ? existingSnap.data()?.createdAt || serverTimestamp()
      : serverTimestamp();
    const ownerUidVal = existingSnap.exists()
      ? existingSnap.data()?.ownerUid || currentUser.uid
      : currentUser.uid;
    await setDoc(docRef, {
      planId: safeId,
      travelerName: String(plan.travelerName || "Traveler").slice(0, 120),
      hotelName: String(plan.hotelName || "Partner Hotel").slice(0, 120),
      hotelRefNumber: String(plan.hotelRefNumber || "VE-HTL-2026").slice(0, 64),
      visaDocNumber: String(plan.visaDocNumber || "VE-VOA-2026").slice(0, 64),
      permitNumber: String(plan.permitNumber || "PERMIT-MOT-2026").slice(0, 64),
      status: plan.status,
      ownerUid: ownerUidVal,
      createdAt: createdAtVal,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
  login_hint: CALENDAR_EMAIL,
});
SCOPES.forEach((scope) => googleProvider.addScope(scope));

// In-memory access token cache (never stored in localStorage or sessionStorage)
let inMemoryAccessToken: string | null = null;

// Clear cached token if user signs out
onAuthStateChanged(auth, (user: User | null) => {
  if (!user) {
    inMemoryAccessToken = null;
  }
});

export function getCachedAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setCachedAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export async function authorizeGoogleWorkspace(
  forceConsent = false,
  loginHint: string = CALENDAR_EMAIL
): Promise<string> {
  if (inMemoryAccessToken && !forceConsent) {
    return inMemoryAccessToken;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: forceConsent ? "consent select_account" : "select_account",
    login_hint: loginHint,
  });
  SCOPES.forEach((scope) => provider.addScope(scope));

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error(
      "Could not obtain Google Workspace access token. Please ensure popup was approved."
    );
  }
  inMemoryAccessToken = credential.accessToken;
  return inMemoryAccessToken;
}

export async function signInFirebaseOperator(loginHint = "philikesete@gmail.com"): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
    login_hint: loginHint,
  });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}
