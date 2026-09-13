import { Client, TablesDB, ID, Query } from 'node-appwrite';

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!projectId || !apiKey) {
  console.error('Missing APPWRITE_PROJECT_ID / APPWRITE_API_KEY env vars.');
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

export const tablesDB = new TablesDB(client);
export const DB_ID = process.env.APPWRITE_DATABASE_ID || 'kaarthi_lifts_db';

// Table (collection) IDs
export const TABLES = {
  LEADS: 'leads',
  PROGRESS: 'progress_entries',
  PAYMENTS: 'payments',
  CHAT_MESSAGES: 'chat_messages',
  SETTINGS: 'settings'
};

export { ID, Query };
export default client;
