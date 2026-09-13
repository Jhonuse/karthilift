import bcrypt from 'bcryptjs';
import { tablesDB, DB_ID, TABLES, ID, Query } from './appwriteClient.js';

function genRefCode() {
  return 'KL-' + Math.floor(1000 + Math.random() * 9000);
}

// Strip undefined/null so we never send explicit nulls for typed optional columns
function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

// Appwrite rows come back with $id / $createdAt etc. Normalize to the shape
// the rest of the app (and the frontend) already expects: `id` + `created_at`.
function mapRow(row) {
  if (!row) return row;
  const { $id, $sequence, $tableId, $databaseId, $createdAt, $updatedAt, $permissions, ...rest } = row;
  return { id: $id, ...rest, created_at: $createdAt };
}

function mapRows(rows) {
  return (rows || []).map(mapRow);
}

async function getRowOrNull(tableId, rowId) {
  try {
    return await tablesDB.getRow({ databaseId: DB_ID, tableId, rowId });
  } catch (err) {
    if (err?.code === 404) return null;
    throw err;
  }
}

// Fetch every row matching the given queries, paging past Appwrite's 100-per-request limit.
async function listAll(tableId, queries = []) {
  const pageSize = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const pageQueries = [...queries, Query.limit(pageSize)];
    if (cursor) pageQueries.push(Query.cursorAfter(cursor));
    const res = await tablesDB.listRows({ databaseId: DB_ID, tableId, queries: pageQueries });
    all = all.concat(res.rows);
    if (res.rows.length < pageSize) break;
    cursor = res.rows[res.rows.length - 1].$id;
  }
  return all;
}

async function countRows(tableId, queries = []) {
  const res = await tablesDB.listRows({ databaseId: DB_ID, tableId, queries: [...queries, Query.limit(1)] });
  return res.total;
}

export const dbOps = {
  async getSetting(key) {
    const row = await getRowOrNull(TABLES.SETTINGS, key);
    return row ? row.value : null;
  },

  async setSetting(key, value) {
    await tablesDB.upsertRow({
      databaseId: DB_ID,
      tableId: TABLES.SETTINGS,
      rowId: ID.custom(key),
      data: { key, value: String(value) }
    });
  },

  async getAllSettings() {
    const rows = await listAll(TABLES.SETTINGS);
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return map;
  },

  async createLead(data) {
    const payload = clean({
      ref_code: genRefCode(),
      name: data.name,
      age: data.age ? parseInt(data.age, 10) : undefined,
      gender: data.gender || 'Not specified',
      phone: data.phone,
      email: data.email,
      instagram: data.instagram || '',
      occupation: data.occupation || 'Working person',
      goal: data.goal,
      plan: data.plan || 'Custom Coaching',
      struggles: data.struggles || data.message || '',
      workout_time: data.workout_time || 'Flexible',
      budget: data.budget || 'Flexible',
      payment_method: data.payment_method || 'UPI',
      experience: data.experience || 'Intermediate',
      message: data.message || data.struggles || '',
      macro_profile: data.macro_profile ? JSON.stringify(data.macro_profile) : '',
      status: 'new',
      notes: ''
    });
    const row = await tablesDB.createRow({ databaseId: DB_ID, tableId: TABLES.LEADS, rowId: ID.unique(), data: payload });
    return mapRow(row);
  },

  async getAllLeads() {
    const rows = await listAll(TABLES.LEADS, [Query.orderDesc('$createdAt')]);
    return mapRows(rows);
  },

  async getLeadById(id) {
    const row = await getRowOrNull(TABLES.LEADS, id);
    return mapRow(row);
  },

  async getLeadByRef(ref) {
    const res = await tablesDB.listRows({
      databaseId: DB_ID,
      tableId: TABLES.LEADS,
      queries: [Query.equal('ref_code', ref), Query.limit(1)]
    });
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  },

  async updateLeadStatus(id, status, notes) {
    const patch = clean({ status, notes });
    const row = await tablesDB.updateRow({ databaseId: DB_ID, tableId: TABLES.LEADS, rowId: id, data: patch });
    return mapRow(row);
  },

  async deleteLead(id) {
    // Best-effort cascade: remove dependent progress entries and payments first.
    const [progress, payments] = await Promise.all([
      listAll(TABLES.PROGRESS, [Query.equal('lead_id', String(id))]),
      listAll(TABLES.PAYMENTS, [Query.equal('lead_id', String(id))])
    ]);
    await Promise.all([
      ...progress.map(p => tablesDB.deleteRow({ databaseId: DB_ID, tableId: TABLES.PROGRESS, rowId: p.$id })),
      ...payments.map(p => tablesDB.deleteRow({ databaseId: DB_ID, tableId: TABLES.PAYMENTS, rowId: p.$id }))
    ]);
    await tablesDB.deleteRow({ databaseId: DB_ID, tableId: TABLES.LEADS, rowId: id });
    return true;
  },

  // --- Client registration / auth (free consultation -> paid dashboard) ---
  async registerClient(refCode, password) {
    const lead = await dbOps.getLeadByRef(refCode);
    if (!lead) throw new Error('Consultation reference not found');
    if (lead.is_registered) throw new Error('Account already registered for this reference');
    const password_hash = await bcrypt.hash(password, 10);
    const row = await tablesDB.updateRow({
      databaseId: DB_ID,
      tableId: TABLES.LEADS,
      rowId: lead.id,
      data: { password_hash, is_registered: true }
    });
    return mapRow(row);
  },

  async loginClient(refCode, password) {
    const lead = await dbOps.getLeadByRef(refCode);
    if (!lead || !lead.is_registered || !lead.password_hash) {
      throw new Error('Invalid reference code or password');
    }
    const ok = await bcrypt.compare(password, lead.password_hash);
    if (!ok) throw new Error('Invalid reference code or password');
    return lead;
  },

  // --- Progress ---
  async getProgress(leadId) {
    // Ordered by creation time (an indexed system attribute) rather than the
    // free-text entry_date field, since Appwrite requires a custom index to
    // sort by non-system attributes.
    const rows = await listAll(TABLES.PROGRESS, [Query.equal('lead_id', String(leadId)), Query.orderAsc('$createdAt')]);
    return mapRows(rows);
  },

  async addProgress(leadId, entry) {
    const payload = clean({
      lead_id: String(leadId),
      entry_date: entry.entry_date || new Date().toISOString().slice(0, 10),
      weight: entry.weight,
      photo_url: entry.photo_url,
      note: entry.note || '',
      created_by: entry.created_by || 'admin'
    });
    const row = await tablesDB.createRow({ databaseId: DB_ID, tableId: TABLES.PROGRESS, rowId: ID.unique(), data: payload });
    return mapRow(row);
  },

  async deleteProgress(id) {
    await tablesDB.deleteRow({ databaseId: DB_ID, tableId: TABLES.PROGRESS, rowId: id });
    return true;
  },

  // --- Payments ---
  async createPayment(leadId, amount, method, reference) {
    const payload = clean({ lead_id: String(leadId), amount, method, reference, status: 'pending' });
    const row = await tablesDB.createRow({ databaseId: DB_ID, tableId: TABLES.PAYMENTS, rowId: ID.unique(), data: payload });
    return mapRow(row);
  },

  async getPaymentsForLead(leadId) {
    const rows = await listAll(TABLES.PAYMENTS, [Query.equal('lead_id', String(leadId)), Query.orderDesc('$createdAt')]);
    return mapRows(rows);
  },

  async updatePaymentStatus(paymentId, status) {
    const row = await tablesDB.updateRow({ databaseId: DB_ID, tableId: TABLES.PAYMENTS, rowId: paymentId, data: { status } });
    const payment = mapRow(row);
    if (status === 'confirmed') {
      await tablesDB.updateRow({ databaseId: DB_ID, tableId: TABLES.LEADS, rowId: payment.lead_id, data: { payment_status: 'paid' } });
    }
    return payment;
  },

  // --- Chat ---
  async saveChatMessage(sessionId, sender, text, senderName = '') {
    const payload = clean({ session_id: sessionId, sender, sender_name: senderName, text });
    const row = await tablesDB.createRow({ databaseId: DB_ID, tableId: TABLES.CHAT_MESSAGES, rowId: ID.unique(), data: payload });
    return mapRow(row);
  },

  async getChatHistory(sessionId) {
    const rows = await listAll(TABLES.CHAT_MESSAGES, [Query.equal('session_id', sessionId), Query.orderAsc('$createdAt')]);
    return mapRows(rows);
  },

  async getRecentChatSessions() {
    const rows = await listAll(TABLES.CHAT_MESSAGES, [Query.orderDesc('$createdAt'), Query.limit(500)]);
    const bySession = {};
    for (const row of mapRows(rows)) {
      if (!bySession[row.session_id]) {
        bySession[row.session_id] = {
          session_id: row.session_id,
          sender_name: row.sender_name,
          last_activity: row.created_at,
          last_message: row.text,
          last_sender: row.sender,
          total_messages: 0
        };
      }
      bySession[row.session_id].total_messages++;
    }
    return Object.values(bySession).slice(0, 30);
  },

  // --- Stats ---
  async getStats() {
    const [totalLeads, newLeads, enrolledLeads] = await Promise.all([
      countRows(TABLES.LEADS),
      countRows(TABLES.LEADS, [Query.equal('status', 'new')]),
      countRows(TABLES.LEADS, [Query.equal('status', 'enrolled')])
    ]);
    const slotsRemaining = parseInt((await dbOps.getSetting('slots_remaining')) || '3', 10);
    const totalSlots = parseInt((await dbOps.getSetting('total_slots')) || '15', 10);
    const batchName = (await dbOps.getSetting('batch_name')) || 'March 2026 Cohort';
    const coachStatus = (await dbOps.getSetting('coach_status')) || 'Online';
    const whatsappNumber = (await dbOps.getSetting('whatsapp_number')) || '';

    return {
      totalLeads: totalLeads || 0,
      newLeads: newLeads || 0,
      enrolledLeads: enrolledLeads || 0,
      slotsRemaining,
      totalSlots,
      batchName,
      coachStatus,
      whatsappNumber
    };
  }
};

export default tablesDB;
