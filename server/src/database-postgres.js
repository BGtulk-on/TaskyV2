const { sql } = require('@vercel/postgres');

async function initializeDatabase() {
    try {
        // Create users table
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                profile_pic TEXT
            )
        `;

        // Create task_shares table
        await sql`
            CREATE TABLE IF NOT EXISTS task_shares (
                id SERIAL PRIMARY KEY,
                task_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL
            )
        `;

        // Create tsk_list table
        await sql`
            CREATE TABLE IF NOT EXISTS tsk_list (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                parent_id INTEGER,
                user_id INTEGER NOT NULL,
                is_done INTEGER DEFAULT 0,
                is_expanded INTEGER DEFAULT 1,
                description TEXT DEFAULT '',
                start_date TEXT DEFAULT '',
                end_date TEXT DEFAULT '',
                assigned_to TEXT DEFAULT '',
                links TEXT DEFAULT '',
                notes TEXT DEFAULT ''
            )
        `;

        // Create indexes
        await sql`CREATE INDEX IF NOT EXISTS idx_tsk_user ON tsk_list(user_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_tsk_parent ON tsk_list(parent_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_share_task ON task_shares(task_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_share_user ON task_shares(user_id)`;

        console.log('✅ PostgreSQL database initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    }
}

// Database wrapper to make it compatible with existing SQLite code
const database = {
    // For SELECT queries that return one row
    get: async (query, params = []) => {
        try {
            // Convert SQLite ? placeholders to Postgres $1, $2, etc.
            let pgQuery = query;
            params.forEach((_, index) => {
                pgQuery = pgQuery.replace('?', `$${index + 1}`);
            });

            const result = await sql.query(pgQuery, params);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Database GET error:', error);
            throw error;
        }
    },

    // For SELECT queries that return multiple rows
    all: async (query, params = []) => {
        try {
            let pgQuery = query;
            params.forEach((_, index) => {
                pgQuery = pgQuery.replace('?', `$${index + 1}`);
            });

            const result = await sql.query(pgQuery, params);
            return result.rows;
        } catch (error) {
            console.error('Database ALL error:', error);
            throw error;
        }
    },

    // For INSERT, UPDATE, DELETE queries
    run: async (query, params = []) => {
        try {
            let pgQuery = query;
            
            // Convert SQLite ? to Postgres $1, $2
            params.forEach((_, index) => {
                pgQuery = pgQuery.replace('?', `$${index + 1}`);
            });

            // Add RETURNING id for INSERT queries to get lastID
            if (pgQuery.trim().toUpperCase().startsWith('INSERT')) {
                pgQuery += ' RETURNING id';
            }

            const result = await sql.query(pgQuery, params);
            
            return {
                lastID: result.rows[0]?.id,
                changes: result.rowCount
            };
        } catch (error) {
            console.error('Database RUN error:', error);
            throw error;
        }
    },

    // Initialize tables
    serialize: (callback) => {
        callback();
    }
};

// Initialize database on startup
initializeDatabase().catch(console.error);

module.exports = database;