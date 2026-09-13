import { Client, TablesDB } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)   // e.g. https://fra.cloud.appwrite.io/v1
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);        // needs databases.read scope

const tablesDB = new TablesDB(client);

tablesDB.list().then((res) => {
  console.log('Databases in this project:');
  res.databases.forEach((db) => {
    console.log(`  Name: ${db.name}  |  ID: ${db.$id}`);
  });
}).catch((err) => {
  console.error('Failed to list databases:', err);
});
