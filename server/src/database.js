const sqlt = require('sqlite3').verbose()
const path = require('path')

const db_name = path.join(__dirname, '../data/data_v2.db')

let database = new sqlt.Database(db_name, (err) => {
    if (err) {
        console.error(err.message)
    } else {
        console.log('Connected to the sqllite database.')

        db_run_init()
    }
})


function db_run_init() {
    database.serialize(() => {
        database.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT,
            profile_pic TEXT
        )`)

        database.run(`CREATE TABLE IF NOT EXISTS task_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            user_id INTEGER
        )`)


        database.run(`CREATE TABLE IF NOT EXISTS tsk_list (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, 
            parent_id INTEGER,
            user_id INTEGER,
            is_done INTEGER DEFAULT 0,
            is_expanded INTEGER DEFAULT 1,
            description TEXT DEFAULT '',
            start_date TEXT DEFAULT '',
            end_date TEXT DEFAULT '',
            assigned_to TEXT DEFAULT '',
            links TEXT DEFAULT '',
            notes TEXT DEFAULT ''
        )`)

        database.all(`PRAGMA table_info(tsk_list)`, (err, rows) => {
            if (err) return
            const existing = rows.map(r => r.name)
            const cols = [
                { name: 'is_expanded', type: 'INTEGER', def: 'DEFAULT 1' },
                { name: 'description', type: 'TEXT', def: "DEFAULT ''" },
                { name: 'start_date', type: 'TEXT', def: "DEFAULT ''" },
                { name: 'end_date', type: 'TEXT', def: "DEFAULT ''" },
                { name: 'assigned_to', type: 'TEXT', def: "DEFAULT ''" },
                { name: 'links', type: 'TEXT', def: "DEFAULT ''" },
                { name: 'notes', type: 'TEXT', def: "DEFAULT ''" },
                { name: 'user_id', type: 'INTEGER', def: 'DEFAULT 0' }
            ]

            cols.forEach(c => {
                if (!existing.includes(c.name)) {
                    database.run(`ALTER TABLE tsk_list ADD COLUMN ${c.name} ${c.type} ${c.def}`)
                }
            })
        })

        database.run(`CREATE INDEX IF NOT EXISTS idx_tsk_user ON tsk_list(user_id)`)
        database.run(`CREATE INDEX IF NOT EXISTS idx_tsk_parent ON tsk_list(parent_id)`)
        database.run(`CREATE INDEX IF NOT EXISTS idx_share_task ON task_shares(task_id)`)
        database.run(`CREATE INDEX IF NOT EXISTS idx_share_user ON task_shares(user_id)`)


    })
}



module.exports = database
