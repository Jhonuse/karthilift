/**
 * One-time setup script: provisions the Appwrite database, tables, columns,
 * indexes, and default settings rows needed by this app.
 *
 * Run once after filling in your .env file:
 *   node server/appwrite-setup.js
 *
 * Safe to re-run: every step skips over resources that already exist.
 */
import 'dotenv/config';
import { tablesDB, DB_ID, TABLES, ID } from './appwriteClient.js';
import { TablesDBIndexType } from 'node-appwrite';

function isExists(err) {
  return err?.code === 409 || /already exists/i.test(err?.message || '');
}

async function ignoreExists(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    if (isExists(err)) {
      console.log(`  · ${label} (already exists, skipped)`);
    } else {
      console.error(`  ✗ ${label} failed:`, err.message);
      throw err;
    }
  }
}

async function waitForColumns(tableId, expectedKeys) {
  const timeoutAt = Date.now() + 60000;
  while (Date.now() < timeoutAt) {
    const { columns } = await tablesDB.listColumns({ databaseId: DB_ID, tableId });
    const byKey = Object.fromEntries(columns.map(c => [c.key, c.status]));
    const notReady = expectedKeys.filter(k => byKey[k] !== 'available');
    if (notReady.length === 0) return;
    await new Promise(r => setTimeout(r, 1500));
  }
  console.warn(`  ! Timed out waiting for columns on ${tableId} to become available, continuing anyway.`);
}

async function createStringCol(tableId, key, size, required, xdefault) {
  await ignoreExists(`column ${tableId}.${key}`, () =>
    tablesDB.createStringColumn({ databaseId: DB_ID, tableId, key, size, required, xdefault: required ? undefined : xdefault })
  );
}

async function createFloatCol(tableId, key, required) {
  await ignoreExists(`column ${tableId}.${key}`, () =>
    tablesDB.createFloatColumn({ databaseId: DB_ID, tableId, key, required })
  );
}

async function createIntCol(tableId, key, required, xdefault) {
  await ignoreExists(`column ${tableId}.${key}`, () =>
    tablesDB.createIntegerColumn({ databaseId: DB_ID, tableId, key, required, xdefault: required ? undefined : xdefault })
  );
}

async function createBoolCol(tableId, key, required, xdefault) {
  await ignoreExists(`column ${tableId}.${key}`, () =>
    tablesDB.createBooleanColumn({ databaseId: DB_ID, tableId, key, required, xdefault: required ? undefined : xdefault })
  );
}

async function createTableIfMissing(tableId, name) {
  await ignoreExists(`table ${tableId}`, () =>
    tablesDB.createTable({ databaseId: DB_ID, tableId, name })
  );
}

async function main() {
  console.log(`Provisioning Appwrite database "${DB_ID}"...`);
 try {
  await tablesDB.get({ databaseId: DB_ID });
  console.log('  · database (already exists, skipped)');
} catch (err) {
  if (err?.code === 404) {
    await tablesDB.create({ databaseId: DB_ID, name: 'Kaarthi Lifts DB' });
    console.log('  ✓ database');
  } else {
    throw err;
  }
}

  // ---------------- leads ----------------
  console.log('\nTable: leads');
  await createTableIfMissing(TABLES.LEADS, 'Leads');
  await createStringCol(TABLES.LEADS, 'ref_code', 32, true);
  await createStringCol(TABLES.LEADS, 'name', 150, true);
  await createIntCol(TABLES.LEADS, 'age', false);
  await createStringCol(TABLES.LEADS, 'gender', 30, false, 'Not specified');
  await createStringCol(TABLES.LEADS, 'phone', 30, true);
  await createStringCol(TABLES.LEADS, 'email', 150, true);
  await createStringCol(TABLES.LEADS, 'instagram', 100, false, '');
  await createStringCol(TABLES.LEADS, 'occupation', 150, false, 'Working person');
  await createStringCol(TABLES.LEADS, 'goal', 500, true);
  await createStringCol(TABLES.LEADS, 'plan', 100, false, 'Custom Coaching');
  await createStringCol(TABLES.LEADS, 'struggles', 1000, false, '');
  await createStringCol(TABLES.LEADS, 'workout_time', 100, false, 'Flexible');
  await createStringCol(TABLES.LEADS, 'budget', 100, false, 'Flexible');
  await createStringCol(TABLES.LEADS, 'payment_method', 50, false, 'UPI');
  await createStringCol(TABLES.LEADS, 'experience', 100, false, 'Intermediate');
  await createStringCol(TABLES.LEADS, 'message', 1000, false, '');
  await createStringCol(TABLES.LEADS, 'macro_profile', 2000, false, '');
  await createStringCol(TABLES.LEADS, 'status', 30, false, 'new');
  await createStringCol(TABLES.LEADS, 'notes', 1000, false, '');
  await createStringCol(TABLES.LEADS, 'password_hash', 100, false, '');
  await createBoolCol(TABLES.LEADS, 'is_registered', false, false);
  await createStringCol(TABLES.LEADS, 'payment_status', 30, false, 'unpaid');
  await waitForColumns(TABLES.LEADS, ['ref_code', 'status']);
  await ignoreExists('index leads.ref_code (unique)', () =>
    tablesDB.createIndex({ databaseId: DB_ID, tableId: TABLES.LEADS, key: 'idx_ref_code', type: TablesDBIndexType.Unique, columns: ['ref_code'] })
  );
  await ignoreExists('index leads.status', () =>
    tablesDB.createIndex({ databaseId: DB_ID, tableId: TABLES.LEADS, key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'] })
  );

  // ---------------- progress_entries ----------------
  console.log('\nTable: progress_entries');
  await createTableIfMissing(TABLES.PROGRESS, 'Progress Entries');
  await createStringCol(TABLES.PROGRESS, 'lead_id', 64, true);
  await createStringCol(TABLES.PROGRESS, 'entry_date', 20, false, '');
  await createFloatCol(TABLES.PROGRESS, 'weight', false);
  await createStringCol(TABLES.PROGRESS, 'photo_url', 1000, false, '');
  await createStringCol(TABLES.PROGRESS, 'note', 2000, false, '');
  await createStringCol(TABLES.PROGRESS, 'created_by', 50, false, 'admin');
  await waitForColumns(TABLES.PROGRESS, ['lead_id']);
  await ignoreExists('index progress_entries.lead_id', () =>
    tablesDB.createIndex({ databaseId: DB_ID, tableId: TABLES.PROGRESS, key: 'idx_lead_id', type: TablesDBIndexType.Key, columns: ['lead_id'] })
  );

  // ---------------- payments ----------------
  console.log('\nTable: payments');
  await createTableIfMissing(TABLES.PAYMENTS, 'Payments');
  await createStringCol(TABLES.PAYMENTS, 'lead_id', 64, true);
  await createFloatCol(TABLES.PAYMENTS, 'amount', false);
  await createStringCol(TABLES.PAYMENTS, 'method', 100, false, '');
  await createStringCol(TABLES.PAYMENTS, 'status', 50, false, 'pending');
  await createStringCol(TABLES.PAYMENTS, 'reference', 500, false, '');
  await waitForColumns(TABLES.PAYMENTS, ['lead_id']);
  await ignoreExists('index payments.lead_id', () =>
    tablesDB.createIndex({ databaseId: DB_ID, tableId: TABLES.PAYMENTS, key: 'idx_lead_id', type: TablesDBIndexType.Key, columns: ['lead_id'] })
  );

  // ---------------- chat_messages ----------------
  console.log('\nTable: chat_messages');
  await createTableIfMissing(TABLES.CHAT_MESSAGES, 'Chat Messages');
  await createStringCol(TABLES.CHAT_MESSAGES, 'session_id', 128, true);
  await createStringCol(TABLES.CHAT_MESSAGES, 'sender', 50, true);
  await createStringCol(TABLES.CHAT_MESSAGES, 'sender_name', 255, false, '');
  await createStringCol(TABLES.CHAT_MESSAGES, 'text', 5000, true);
  await waitForColumns(TABLES.CHAT_MESSAGES, ['session_id']);
  await ignoreExists('index chat_messages.session_id', () =>
    tablesDB.createIndex({ databaseId: DB_ID, tableId: TABLES.CHAT_MESSAGES, key: 'idx_session_id', type: TablesDBIndexType.Key, columns: ['session_id'] })
  );

  // ---------------- settings ----------------
  console.log('\nTable: settings');
  await createTableIfMissing(TABLES.SETTINGS, 'Settings');
  await createStringCol(TABLES.SETTINGS, 'key', 100, true);
  await createStringCol(TABLES.SETTINGS, 'value', 2000, false, '');
  await waitForColumns(TABLES.SETTINGS, ['key']);

  const defaultSettings = {
    batch_name: 'March 2026 Elite Cohort',
    total_slots: '15',
    slots_remaining: '3',
    coach_status: 'Online & Reviewing Applications',
    admin_pin: 'kaarthi2026',
    direct_phone: '+91 98765 43210',
    direct_email: 'kaarthilifts@gmail.com',
    whatsapp_number: '919876543210'
  };

  console.log('\nSeeding default settings...');
  for (const [key, value] of Object.entries(defaultSettings)) {
    await ignoreExists(`setting ${key}`, () =>
      tablesDB.createRow({ databaseId: DB_ID, tableId: TABLES.SETTINGS, rowId: ID.custom(key), data: { key, value } })
    );
  }

  console.log('\nAll done! Your Appwrite backend is ready.');
}

main().catch(err => {
  console.error('\nSetup failed:', err);
  process.exit(1);
});