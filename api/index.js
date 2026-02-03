const { neon } = require('@neondatabase/serverless')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const sql = neon(process.env.DATABASE_URL)

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret"

const tokenBlacklist = new Set()

const checkLen = (str, max) => typeof str === 'string' && str.length > max
const checkEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

async function initDb() {
    await sql`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        profile_pic TEXT
    )`

    await sql`CREATE TABLE IF NOT EXISTS task_shares (
        id SERIAL PRIMARY KEY,
        task_id INTEGER,
        user_id INTEGER
    )`

    await sql`CREATE TABLE IF NOT EXISTS tsk_list (
        id SERIAL PRIMARY KEY,
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
    )`
}

let dbInitialized = false

function getToken(headers) {
    const auth = headers['authorization'] || headers['Authorization']
    return auth && auth.split(' ')[1]
}

function verifyToken(token) {
    if (!token || tokenBlacklist.has(token)) return null
    try {
        return jwt.verify(token, JWT_SECRET)
    } catch (e) {
        return null
    }
}


module.exports = async (req, res) => {
    const { method, url } = req
    const path = url.split('?')[0]

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (method === 'OPTIONS') return res.status(200).end()

    if (!dbInitialized) {
        await initDb()
        dbInitialized = true
    }

    try {

        if (path === '/api/register' && method === 'POST') {
            const { username, email, password, profile_pic } = req.body
            if (!username || !password || !email) return res.status(400).json({ error: "missing fields" })
            if (checkLen(username, 10)) return res.status(400).json({ error: "Username too long (max 10)" })
            if (!checkEmail(email)) return res.status(400).json({ error: "Invalid email format" })

            const existing = await sql`SELECT username, email FROM users WHERE username = ${username} OR email = ${email}`
            if (existing.length > 0) {
                if (existing[0].username === username) return res.status(400).json({ error: "Username already taken" })
                if (existing[0].email === email) return res.status(400).json({ error: "Email already in use" })
            }

            const hash = await bcrypt.hash(password, 10)
            const result = await sql`INSERT INTO users (username, email, password, profile_pic) VALUES (${username}, ${email}, ${hash}, ${profile_pic}) RETURNING id`

            const user = { id: result[0].id, username }
            const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })
            return res.json({ message: "success", token, user: { ...user, email, profile_pic } })
        }


        if (path === '/api/login' && method === 'POST') {
            const { username, password } = req.body

            const rows = await sql`SELECT * FROM users WHERE username = ${username} OR email = ${username}`
            if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" })

            const row = rows[0]
            const same = await bcrypt.compare(password, row.password)
            if (!same) return res.status(401).json({ error: "Invalid credentials" })

            const user = { id: row.id, username: row.username }
            const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })
            return res.json({
                message: "success",
                token,
                user: { id: row.id, username: row.username, email: row.email, profile_pic: row.profile_pic }
            })
        }


        const token = getToken(req.headers)
        const authUser = verifyToken(token)

        if (path === '/api/logout' && method === 'POST') {
            if (!authUser) return res.status(401).end()
            tokenBlacklist.add(token)
            return res.json({ message: "logged out" })
        }

        if (!authUser) return res.status(401).json({ error: "Unauthorized" })
        const user_id = authUser.id


        if (path === '/api/get_all' && method === 'GET') {
            const myRows = await sql`
                SELECT t.*, u.username as owner_name 
                FROM tsk_list t 
                LEFT JOIN users u ON t.user_id = u.id
                WHERE t.user_id = ${user_id}`

            const sharedRows = await sql`
                WITH RECURSIVE 
                DirectShared AS (
                    SELECT t.*
                    FROM tsk_list t
                    JOIN task_shares ts ON t.id = ts.task_id
                    WHERE ts.user_id = ${user_id}
                ),
                Descendants AS (
                    SELECT t.* FROM DirectShared t
                    UNION ALL
                    SELECT t.* FROM tsk_list t
                    JOIN Descendants d ON t.parent_id = d.id
                )
                SELECT DISTINCT d.*, u.username as owner_name
                FROM Descendants d
                LEFT JOIN users u ON d.user_id = u.id`

            const allShares = await sql`
                SELECT ts.task_id, u.id, u.username, u.profile_pic 
                FROM task_shares ts 
                JOIN users u ON ts.user_id = u.id`

            const sharesMap = {}
            allShares.forEach(s => {
                if (!sharesMap[s.task_id]) sharesMap[s.task_id] = []
                sharesMap[s.task_id].push(s)
            })

            const map = new Map()
            myRows.forEach(r => map.set(r.id, { ...r, contributors: sharesMap[r.id] || [] }))
            sharedRows.forEach(r => map.set(r.id, { ...r, contributors: sharesMap[r.id] || [] }))

            return res.json({ message: "success", data: Array.from(map.values()) })
        }


        if (path === '/api/add_tsk' && method === 'POST') {
            const { name, parent_id } = req.body
            if (!name || name.trim() === "") return res.status(400).json({ error: "Name required" })
            if (checkLen(name, 50)) return res.status(400).json({ error: "Name too long (max 50)" })

            const result = await sql`INSERT INTO tsk_list (name, parent_id, user_id) VALUES (${name}, ${parent_id}, ${user_id}) RETURNING id`
            return res.json({ message: "success", data: { name, parent_id, user_id }, id: result[0].id })
        }


        if (path === '/api/update_status' && method === 'POST') {
            const { id, is_done } = req.body
            await sql`UPDATE tsk_list SET is_done = ${is_done} WHERE id = ${id} AND user_id = ${user_id}`
            return res.json({ message: "success" })
        }

        if (path === '/api/update_expanded' && method === 'POST') {
            const { id, is_expanded } = req.body
            await sql`UPDATE tsk_list SET is_expanded = ${is_expanded} WHERE id = ${id}`
            return res.json({ message: "success" })
        }

        if (path === '/api/update_details' && method === 'POST') {
            const { id, field, value } = req.body
            const allowed = ['name', 'description', 'start_date', 'end_date', 'assigned_to', 'links', 'notes']
            if (!allowed.includes(field)) return res.status(400).json({ error: "invalid field" })

            if (field === 'name' && (checkLen(value, 50) || !value || value.trim() === "")) {
                return res.status(400).json({ error: "Invalid name (max 50)" })
            }

            await sql`UPDATE tsk_list SET ${sql(field)} = ${value} WHERE id = ${id}`
            return res.json({ message: "success" })
        }


        if (path === '/api/del_tsk' && method === 'POST') {
            const { id } = req.body

            const task = await sql`SELECT user_id FROM tsk_list WHERE id = ${id}`
            if (task.length === 0) return res.status(404).json({ error: "Task not found" })
            if (task[0].user_id !== user_id) return res.status(403).json({ error: "Only owner can delete" })

            await sql`
                WITH RECURSIVE SubTasks AS (
                    SELECT id FROM tsk_list WHERE id = ${id}
                    UNION ALL
                    SELECT t.id FROM tsk_list t
                    JOIN SubTasks st ON t.parent_id = st.id
                )
                DELETE FROM tsk_list WHERE id IN (SELECT id FROM SubTasks)`

            return res.json({ message: "deleted" })
        }


        if (path === '/api/update_profile' && method === 'POST') {
            const { username, profile_pic, password } = req.body
            if (checkLen(username, 10)) return res.status(400).json({ error: "Username too long (max 10)" })

            const existing = await sql`SELECT id FROM users WHERE username = ${username} AND id != ${user_id}`
            if (existing.length > 0) return res.status(400).json({ error: "Username taken" })

            if (password) {
                const hash = await bcrypt.hash(password, 10)
                await sql`UPDATE users SET username = ${username}, profile_pic = ${profile_pic}, password = ${hash} WHERE id = ${user_id}`
            } else {
                await sql`UPDATE users SET username = ${username}, profile_pic = ${profile_pic} WHERE id = ${user_id}`
            }
            return res.json({ message: "success" })
        }


        if (path === '/api/share_task' && method === 'POST') {
            const { task_id, username } = req.body

            const task = await sql`SELECT user_id FROM tsk_list WHERE id = ${task_id}`
            if (task.length === 0) return res.status(404).json({ error: "Task not found" })
            if (task[0].user_id !== user_id) return res.status(403).json({ error: "Not authorized to share" })

            const targetUser = await sql`SELECT id FROM users WHERE username = ${username}`
            if (targetUser.length === 0) return res.status(400).json({ error: "User not found" })
            const target_uid = targetUser[0].id
            if (target_uid === user_id) return res.status(400).json({ error: "Cannot share with self" })

            const existingShare = await sql`SELECT id FROM task_shares WHERE task_id = ${task_id} AND user_id = ${target_uid}`
            if (existingShare.length > 0) return res.status(400).json({ error: "Already shared with user" })

            await sql`INSERT INTO task_shares (task_id, user_id) VALUES (${task_id}, ${target_uid})`
            return res.json({ message: "success" })
        }

        if (path === '/api/get_contr' && method === 'GET') {
            const task_id = req.query?.task_id || new URL(req.url, 'http://x').searchParams.get('task_id')
            const rows = await sql`
                SELECT u.id, u.username, u.profile_pic FROM task_shares ts 
                JOIN users u ON ts.user_id = u.id 
                WHERE ts.task_id = ${task_id}`
            return res.json({ data: rows })
        }

        if (path === '/api/rem_contr' && method === 'POST') {
            const { task_id, user_id: rem_user_id } = req.body

            const task = await sql`SELECT user_id FROM tsk_list WHERE id = ${task_id}`
            if (task.length === 0) return res.status(404).json({ error: "Task not found" })
            if (task[0].user_id !== user_id) return res.status(403).json({ error: "Not authorized" })

            await sql`DELETE FROM task_shares WHERE task_id = ${task_id} AND user_id = ${rem_user_id}`
            return res.json({ message: "deleted" })
        }

        return res.status(404).json({ error: "Not found" })

    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Server error" })
    }
}
