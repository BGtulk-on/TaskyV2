const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const { neon } = require('@neondatabase/serverless')

const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL is not set in .env file or environment variables.")
    process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

const app = express()
app.use(helmet({
    crossOriginResourcePolicy: false,
}))
app.use(cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))


const genLimitr = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "slow down buddy"
})

const authLmt = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: "try agan later"
})


app.use(genLimitr)
app.use("/login", authLmt)
app.use("/register", authLmt)

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret"

const tokenBlacklist = new Set()

const addToBlacklist = (token) => {
    tokenBlacklist.add(token)
}

const checkLen = (str, max) => typeof str === 'string' && str.length > max

const checkEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) return res.sendStatus(401)

    if (tokenBlacklist.has(token)) return res.sendStatus(401)

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403)
        req.user = user
        req.token = token
        next()
    })
}

app.post("/register", async (req, res) => {
    try {
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
        res.json({ message: "success", token, user: { ...user, email, profile_pic } })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Server error" })
    }
})

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body

        const rows = await sql`SELECT * FROM users WHERE username = ${username} OR email = ${username}`
        if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" })

        const row = rows[0]
        const same = await bcrypt.compare(password, row.password)
        if (!same) return res.status(401).json({ error: "Invalid credentials" })

        const user = { id: row.id, username: row.username }
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })

        res.json({
            message: "success",
            token: token,
            user: { id: row.id, username: row.username, email: row.email, profile_pic: row.profile_pic }
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Server error" })
    }
})

app.post("/logout", authenticateToken, (req, res) => {
    addToBlacklist(req.token)
    res.json({ message: "logged out" })
})


app.get("/get_all", authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id

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

        res.json({ message: "success", data: Array.from(map.values()) })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Database error" })
    }
})


app.post("/update_profile", authenticateToken, async (req, res) => {
    try {
        const id = req.user.id
        const { username, profile_pic, password } = req.body

        if (checkLen(username, 10)) return res.status(400).json({ error: "Username too long (max 10)" })

        const existing = await sql`SELECT id FROM users WHERE username = ${username} AND id != ${id}`
        if (existing.length > 0) return res.status(400).json({ error: "Username taken" })

        if (password) {
            const hash = await bcrypt.hash(password, 10)
            await sql`UPDATE users SET username = ${username}, profile_pic = ${profile_pic}, password = ${hash} WHERE id = ${id}`
        } else {
            await sql`UPDATE users SET username = ${username}, profile_pic = ${profile_pic} WHERE id = ${id}`
        }
        res.json({ message: "success" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Update failed" })
    }
})

app.post("/share_task", authenticateToken, async (req, res) => {
    try {
        const { task_id, username } = req.body

        const task = await sql`SELECT user_id FROM tsk_list WHERE id = ${task_id}`
        if (task.length === 0) return res.status(404).json({ error: "Task not found" })
        if (task[0].user_id !== req.user.id) return res.status(403).json({ error: "Not authorized to share this task" })

        const targetUser = await sql`SELECT id FROM users WHERE username = ${username}`
        if (targetUser.length === 0) return res.status(400).json({ error: "User not found" })
        const target_uid = targetUser[0].id
        if (target_uid === req.user.id) return res.status(400).json({ error: "Cannot share with self" })

        const existingShare = await sql`SELECT id FROM task_shares WHERE task_id = ${task_id} AND user_id = ${target_uid}`
        if (existingShare.length > 0) return res.status(400).json({ error: "Already shared with user" })

        await sql`INSERT INTO task_shares (task_id, user_id) VALUES (${task_id}, ${target_uid})`
        res.json({ message: "success" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Share failed" })
    }
})

app.get("/get_contr", authenticateToken, async (req, res) => {
    try {
        const { task_id } = req.query
        const rows = await sql`
            SELECT u.id, u.username, u.profile_pic FROM task_shares ts 
            JOIN users u ON ts.user_id = u.id 
            WHERE ts.task_id = ${task_id}`
        res.json({ data: rows })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Database error" })
    }
})

app.post("/rem_contr", authenticateToken, async (req, res) => {
    try {
        const { task_id, user_id } = req.body

        const task = await sql`SELECT user_id FROM tsk_list WHERE id = ${task_id}`
        if (task.length === 0) return res.status(404).json({ error: "Task not found" })
        if (task[0].user_id !== req.user.id) return res.status(403).json({ error: "Not authorized" })

        await sql`DELETE FROM task_shares WHERE task_id = ${task_id} AND user_id = ${user_id}`
        res.json({ message: "deleted" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Delete failed" })
    }
})

app.post("/add_tsk", authenticateToken, async (req, res) => {
    try {
        const name = req.body.name
        const parent_id = req.body.parent_id
        const user_id = req.user.id

        if (!name || name.trim() === "") return res.status(400).json({ error: "Name required" })
        if (checkLen(name, 50)) return res.status(400).json({ error: "Name too long (max 50)" })

        const result = await sql`INSERT INTO tsk_list (name, parent_id, user_id) VALUES (${name}, ${parent_id}, ${user_id}) RETURNING id`
        res.json({ message: "success", data: { name, parent_id, user_id }, id: result[0].id })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Failed to add task" })
    }
})

app.post("/update_status", authenticateToken, async (req, res) => {
    try {
        const { id, is_done } = req.body
        await sql`UPDATE tsk_list SET is_done = ${is_done} WHERE id = ${id}`
        res.json({ message: "success" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Update failed" })
    }
})

app.post("/update_expanded", authenticateToken, async (req, res) => {
    try {
        const { id, is_expanded } = req.body
        await sql`UPDATE tsk_list SET is_expanded = ${is_expanded} WHERE id = ${id}`
        res.json({ message: "success" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Update failed" })
    }
})

app.post("/update_details", authenticateToken, async (req, res) => {
    try {
        const { id, field, value } = req.body
        const allowed = ['name', 'description', 'start_date', 'end_date', 'assigned_to', 'links', 'notes', 'priority']
        if (!allowed.includes(field)) return res.status(400).json({ error: "invalid field" })

        if (field === 'name' && (checkLen(value, 50) || !value || value.trim() === "")) {
            return res.status(400).json({ error: "Invalid name (max 50)" })
        }
        if (field === 'description' && checkLen(value, 1000)) {
            return res.status(400).json({ error: "Description too long (max 1000)" })
        }
        if (field === 'notes' && checkLen(value, 1000)) {
            return res.status(400).json({ error: "Notes too long (max 1000)" })
        }

        if (field === 'name') await sql`UPDATE tsk_list SET name = ${value} WHERE id = ${id}`
        else if (field === 'description') await sql`UPDATE tsk_list SET description = ${value} WHERE id = ${id}`
        else if (field === 'start_date') await sql`UPDATE tsk_list SET start_date = ${value} WHERE id = ${id}`
        else if (field === 'end_date') await sql`UPDATE tsk_list SET end_date = ${value} WHERE id = ${id}`
        else if (field === 'assigned_to') await sql`UPDATE tsk_list SET assigned_to = ${value} WHERE id = ${id}`
        else if (field === 'links') await sql`UPDATE tsk_list SET links = ${value} WHERE id = ${id}`
        else if (field === 'notes') await sql`UPDATE tsk_list SET notes = ${value} WHERE id = ${id}`
        else if (field === 'priority') await sql`UPDATE tsk_list SET priority = ${value} WHERE id = ${id}`

        res.json({ message: "success" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Update failed" })
    }
})

app.post("/del_tsk", authenticateToken, async (req, res) => {
    try {
        const id = req.body.id

        const task = await sql`SELECT user_id FROM tsk_list WHERE id = ${id}`
        if (task.length === 0) return res.status(404).json({ error: "Task not found" })
        if (task[0].user_id !== req.user.id) return res.status(403).json({ error: "Only owner can delete" })

        await sql`
            WITH RECURSIVE SubTasks AS (
                SELECT id FROM tsk_list WHERE id = ${id}
                UNION ALL
                SELECT t.id FROM tsk_list t
                JOIN SubTasks st ON t.parent_id = st.id
            )
            DELETE FROM tsk_list WHERE id IN (SELECT id FROM SubTasks)`

        res.json({ message: "deleted" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Delete failed" })
    }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
