import { createHash } from "node:crypto";
// Isolated test database: remove connection configuration before loading app code.
import assert from 'node:assert/strict';
for (const key of Object.keys(process.env)) {
  if (/^(SQL_|NETLIFY_DB|NETLIFY_DATABASE|DATABASE_URL$|NEON_DATABASE_URL$|POSTGRES_URL)/.test(key)) delete process.env[key];
}
const { getDb, checkDatabase } = await import('../db/index.ts');
const { users, sessions, records } = await import('../db/schema.ts');
const { handleApi } = await import('../server/api.ts');
const db = await getDb();
assert.equal((await checkDatabase()).isTemporary, true, 'Tests must never use a persistent database');
const people = await db.insert(users).values([
  { username: 'test-agent-a', fullName: 'Test Agent A', role: 'AGENT', passwordHash: 'unused' },
  { username: 'test-agent-b', fullName: 'Test Agent B', role: 'AGENT', passwordHash: 'unused' },
  { username: 'test-agent-c', fullName: 'Test Agent C', role: 'AGENT', passwordHash: 'unused' },
  { username: 'test-ceo', fullName: 'Test Admin', role: 'CEO', passwordHash: 'unused' },
]).returning();
for (const person of people) await db.insert(sessions).values({ token: "sha256:" + createHash("sha256").update(`test-session-${person.id}`).digest("hex"), userId: person.id, expiresAt: new Date(Date.now() + 60000) });
const [a, b, c, admin] = people;
const call = (actor: any, method: string, path: string, body?: any, query = {}) => handleApi({ method, path: `messaging/${path}`, body, query, cookies: {}, headers: actor ? { authorization: `Bearer test-session-${actor.id}` } : {} });
assert.equal((await call(null, 'GET', 'accounts')).status, 401, 'No automatic CEO fallback for private messages');
const directory = await call(a, 'GET', 'accounts');
assert.equal(directory.status, 200);
assert.equal(directory.body.rows.some((row: any) => row.id === a.id), false);
assert.equal('passwordHash' in directory.body.rows[0], false);
const sent = await call(a, 'POST', 'messages', { recipientId: b.id, content: 'Please check the booking.', senderId: c.id });
assert.equal(sent.status, 200);
assert.equal(sent.body.message.senderId, a.id, 'Sender must come from session');
const request = await call(a, 'POST', 'messages', { recipientId: b.id, kind: 'passport_request', content: 'Passenger Test / booking TEST' });
assert.equal(request.status, 200);
assert.equal((await call(b, 'GET', 'messages', undefined, { peer: String(a.id) })).body.rows.length, 2);
assert.equal((await call(c, 'GET', 'messages', undefined, { peer: String(a.id) })).body.rows.length, 0, 'Third parties cannot read conversation');
assert.equal((await call(c, 'GET', `attachment/${sent.body.message.id}`)).status, 404);
assert.equal((await call(c, 'POST', `fulfill/${request.body.message.id}`)).status, 404);
assert.equal((await call(b, 'POST', `fulfill/${request.body.message.id}`)).status, 403);
const inbox = await call(b, 'GET', 'inbox');
assert.equal(inbox.body.rows[0].unread, 2);
assert.equal((await call(b, 'POST', 'read', { peerId: a.id })).status, 200);
assert.equal((await call(b, 'GET', 'inbox')).body.rows[0].unread, 0);
assert.equal((await call(a, 'GET', 'messages', undefined, { peer: String(b.id) })).body.rows.every((row: any) => row.readAt), true);
assert.equal((await call(a, 'POST', `fulfill/${request.body.message.id}`)).status, 200);
assert.equal((await call(a, 'POST', 'messages', { recipientId: b.id, kind: 'ticket', ticketId: 'unavailable' })).status, 403);
await db.insert(records).values({ id: 'test-ticket', collection: 'tickets', createdBy: a.username, updatedBy: a.username, data: { id: 'test-ticket', ticketNumber: 'TEST-172', passengerName: 'Test Passenger', departureDate: '2026-12-01', status: 'Valid', touristPassport: 'excluded-test-value' } });
const ticket = await call(a, 'POST', 'messages', { recipientId: b.id, kind: 'ticket', ticketId: 'test-ticket' });
assert.equal(ticket.status, 200);
assert.equal(ticket.body.message.ticket.ticketNumber, 'TEST-172');
assert.equal(ticket.body.message.ticket.touristPassport, undefined, 'Ticket sharing includes only the intended ticket fields');
assert.equal((await call(c, 'POST', 'messages', { recipientId: b.id, kind: 'ticket', ticketId: 'test-ticket' })).status, 403, 'Agents cannot share another agent’s ticket');
assert.equal((await call(a, 'GET', 'inbox')).body.rows.length, 1);
assert.equal((await call(c, 'GET', 'inbox')).body.rows.length, 0);

assert.equal((await call(a, 'POST', 'messages', { recipientId: a.id, content: 'self' })).status, 400);
assert.equal((await call(a, 'POST', 'messages', { recipientId: b.id, content: '' })).status, 400);
assert.equal((await call(a, 'POST', 'messages', { recipientId: b.id, attachment: { name: 'fake.pdf', type: 'application/pdf', base64: 'ZmFrZQ==' } })).status, 400);
const backup = await handleApi({ method: 'GET', path: 'admin/backup', query: {}, cookies: {}, headers: { authorization: `Bearer test-session-${admin.id}` }, body: undefined });
assert.equal(backup.status, 200);
assert.equal(backup.body.collections.privateAccountMessages, undefined, 'Private conversations must not leak through operational backups');
console.log('Messaging regression checks passed: sessions, sender identity, participant isolation, unread/read state, request completion, ticket permissions, file validation, and backup privacy.');
process.exit(0);
