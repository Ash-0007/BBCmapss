const { Pool } = require('pg');

const dbConfig = {
    user: 'postgres.vsmqelrvrqyjgevdovkv',
    host: 'aws-0-ap-south-1.pooler.supabase.com',
    database: 'postgres',
    password: 'SupaBaseAsh@223',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000,
    query_timeout: 20000,
    idleTimeoutMillis: 30000,
    max: 10,
    min: 2,
    idle_in_transaction_session_timeout: 30000
};

const pool = new Pool(dbConfig);

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
    console.log('New client connected to connection pool');
});

// Helper function to get database client
async function getDbClient() {
    try {
        const client = await pool.connect();
        console.log('Connected to database successfully');
        return client;
    } catch (err) {
        console.error('Error connecting to database:', err);
        throw err;
    }
}

module.exports = {
    pool,
    getDbClient
}; 