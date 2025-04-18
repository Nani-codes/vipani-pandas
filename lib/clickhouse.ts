import { createClient } from '@clickhouse/client';

// Fix the URL format to match required pattern
export const clickhouse = createClient({
  host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'default',
});

// Add a connection test function you can call during initialization
export async function testClickHouseConnection() {
  try {
    const result = await clickhouse.query({
      query: 'SELECT 1',
      format: 'JSONEachRow',
    });
    
    const data = await result.json();
    console.log('ClickHouse connection successful:', data);
    return true;
  } catch (error) {
    console.error('ClickHouse connection failed:', error);
    return false;
  }
}