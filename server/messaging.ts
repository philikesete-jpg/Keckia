import { randomUUID } from 'node:crypto';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { getStore } from '@netlify/blobs';
import { getDb } from '../db/index.ts';
import { records, users } from '../db/schema.ts';
import type { ApiRequest, ApiResponse } from './api.ts';

const collection = 'privateAccountMessages';
const fileLimit = 2 * 1024 * 1024;
const reply = (status: number, body: unknown): ApiResponse => ({ status, body, headers: { 'Cache-Control': 'no-store' } });
const error = (status: number, message: string) => reply(status, { error: message });

export async function handleMessaging(req: ApiRequest, user: { id: number; username: string; fullName: string; role: string }, getTickets: () => Promise<any[]>): Promise<ApiResponse> {
  const db = await getDb();
  const [, action, key] = req.path.split('/');
  const mine = or(sql`${records.data}->>'senderId' = ${String(user.id)}`, sql`${records.data}->>'recipientId' = ${String(user.id)}`);
  if (action === 'accounts' && req.method === 'GET') {
    const rows = await db.select({ id: users.id, fullName: users.fullName, username: users.username, role: users.role }).from(users).where(eq(users.active, 1));
    return reply(200, { rows: rows.filter((row: any) => row.id !== user.id) });
  }
  if (action === 'inbox' && req.method === 'GET') {
    // Latest message and unread count per counterpart, without returning document contents.
    const rows = await db.execute(sql`WITH visible AS (
      SELECT data, created_at, CASE WHEN data->>'senderId' = ${String(user.id)} THEN data->>'recipientId' ELSE data->>'senderId' END AS peer
      FROM records WHERE collection = ${collection} AND (data->>'senderId' = ${String(user.id)} OR data->>'recipientId' = ${String(user.id)})
    ) SELECT DISTINCT ON (peer) peer, data AS latest,
      count(*) FILTER (WHERE data->>'recipientId' = ${String(user.id)} AND data->>'readAt' IS NULL) OVER (PARTITION BY peer)::int AS unread
      FROM visible ORDER BY peer, created_at DESC`);
    return reply(200, { rows: rows.rows ?? rows });
  }
  if (action === 'messages' && req.method === 'GET') {
    const peerId = Number(req.query.peer);
    if (!Number.isInteger(peerId) || peerId < 1) return error(400, 'Choose an account.');
    const rows = await db.select().from(records).where(and(eq(records.collection, collection), mine,
      or(sql`${records.data}->>'senderId' = ${String(peerId)}`, sql`${records.data}->>'recipientId' = ${String(peerId)}`)))
      .orderBy(desc(records.createdAt), desc(records.id)).limit(200);
    return reply(200, { rows: rows.reverse().map((row: any) => row.data) });
  }
  if (action === 'read' && req.method === 'POST') {
    const peerId = Number(req.body?.peerId);
    if (!Number.isInteger(peerId)) return error(400, 'Choose an account.');
    await db.update(records).set({ data: sql`${records.data} || jsonb_build_object('readAt', ${new Date().toISOString()}::text)` })
      .where(and(eq(records.collection, collection), sql`${records.data}->>'recipientId' = ${String(user.id)}`,
        sql`${records.data}->>'senderId' = ${String(peerId)}`, sql`${records.data}->>'readAt' IS NULL`));
    return reply(200, { ok: true });
  }
  if ((action === 'attachment' || action === 'fulfill') && key) {
    const [row] = await db.select().from(records).where(and(eq(records.collection, collection), eq(records.id, key), mine)).limit(1);
    if (!row) return error(404, 'Message not found.');
    const message = row.data as any;
    if (action === 'fulfill' && req.method === 'POST') {
      if (message.kind !== 'passport_request' || message.senderId !== user.id) return error(403, 'Only the requesting agent can mark a passport request received.');
      await db.update(records).set({ data: { ...message, fulfilledAt: new Date().toISOString() } }).where(and(eq(records.collection, collection), eq(records.id, key)));
      return reply(200, { ok: true });
    }
    if (action === 'attachment' && req.method === 'GET' && message.attachment) {
      const bytes = await getStore({ name: 'private-message-files', consistency: 'strong' }).get(key, { type: 'arrayBuffer' });
      if (!bytes) return error(404, 'Attachment unavailable.');
      return reply(200, { ...message.attachment, base64: Buffer.from(bytes).toString('base64') });
    }
  }
  if (action === 'messages' && req.method === 'POST') {
    const recipientId = Number(req.body?.recipientId);
    if (!Number.isInteger(recipientId) || recipientId === user.id) return error(400, 'Choose another account.');
    const [recipient] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, recipientId), eq(users.active, 1))).limit(1);
    if (!recipient) return error(400, 'This account is unavailable.');
    const kind = req.body?.kind ?? 'text';
    if (!['text', 'ticket', 'passport_request'].includes(kind)) return error(400, 'Invalid message type.');
    const content = String(req.body?.content ?? '').trim();
    if (content.length > 4000) return error(400, 'Messages can contain up to 4,000 characters.');
    const message: any = { id: randomUUID(), senderId: user.id, senderName: user.fullName, recipientId, kind, content, timestamp: new Date().toISOString() };
    if (kind === 'passport_request' && !content) return error(400, 'Enter the passenger name and passport request details.');
    if (kind === 'ticket') {
      const ticket = (await getTickets()).find((item: any) => item.id === req.body?.ticketId);
      if (!ticket) return error(403, 'Choose a ticket you have access to.');
      const fields = ['id', 'ticketNumber', 'bookingRef', 'passengerName', 'touristName', 'airline', 'flightNumber', 'origin', 'destination', 'route', 'departureDate', 'departureTime', 'status', 'pnr'];
      message.ticket = Object.fromEntries(fields.filter(field => ticket[field] != null).map(field => [field, ticket[field]]));
    }
    const file = req.body?.attachment;
    let bytes: Buffer | undefined;
    if (file) {
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || typeof file.base64 !== 'string' || file.base64.length > Math.ceil(fileLimit / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) return error(400, 'Attach a PDF, JPG, or PNG up to 2 MB.');
      bytes = Buffer.from(file.base64, 'base64');
      const valid = file.type === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      if (!valid || bytes.length > fileLimit) return error(400, 'The file contents do not match its document type.');
      message.attachment = { name: String(file.name || 'Document').replace(/[\x00-\x1f/\\]/g, '_').slice(0, 160), type: file.type, size: bytes.length };
    }
    if (!content && !message.ticket && !bytes) return error(400, 'Write a message or attach a document.');
    const store = bytes ? getStore({ name: 'private-message-files', consistency: 'strong' }) : undefined;
    if (bytes) await store!.set(message.id, new Uint8Array(bytes).buffer);
    try {
      await db.insert(records).values({ id: message.id, collection, data: message, createdBy: user.username, updatedBy: user.username });
    } catch (cause) {
      if (store) await store.delete(message.id).catch(() => {});
      throw cause;
    }
    return reply(200, { message });
  }
  return error(404, 'Unknown messaging action.');
}
