const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const database = require("./src/database.js")

const helmet = require('helmet')

 
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


const rateLimit = require('express-rate-limit')


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

app.post("/register", (req, res) => {
    const { username, email, password, profile_pic } = req.body
    if (!username || !password || !email) return res.status(400).json({ error: "missing fields" })

    if (checkLen(username, 10)) return res.status(400).json({ error: "Username too long (max 10)" })
    if (!checkEmail(email)) return res.status(400).json({ error: "Invalid email format" })

    database.get("SELECT username, email FROM users WHERE username = ? OR email = ?", [username, email], (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" })
        if (row) {
            if (row.username === username) return res.status(400).json({ error: "Username already taken" })
            if (row.email === email) return res.status(400).json({ error: "Email already in use" })
        }

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: "Server error" })

            const sql = `INSERT INTO users (username, email, password, profile_pic) VALUES (?,?,?,?)`
            database.run(sql, [username, email, hash, profile_pic], function (err) {
                if (err) return res.status(500).json({ error: "Failed to create user" })

                const user = { id: this.lastID, username }
                const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })
                res.json({ message: "success", token, user: { ...user, email, profile_pic } })
            })
        })
    })
})

app.post("/login", (req, res) => {
    const { username, password } = req.body

    const sql = `SELECT * FROM users WHERE (username = ? OR email = ?)`
    database.get(sql, [username, username], (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" })
        if (!row) return res.status(401).json({ error: "Invalid credentials" })

        bcrypt.compare(password, row.password, (err, same) => {
            if (err) return res.status(500).json({ error: "Server error" })
            if (!same) return res.status(401).json({ error: "Invalid credentials" })

            const user = { id: row.id, username: row.username }
            const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })

            res.json({
                message: "success",
                token: token,
                user: { id: row.id, username: row.username, email: row.email, profile_pic: row.profile_pic }
            })
        })
    })
})

app.post("/logout", authenticateToken, (req, res) => {
    tokenBlacklist.add(req.token)
    res.json({ message: "logged out" })
})


app.get("/get_all", authenticateToken, (req, res) => {
    const user_id = req.user.id

    const sqlMy = `SELECT t.*, u.username as owner_name 
                   FROM tsk_list t 
                   LEFT JOIN users u ON t.user_id = u.id
                   WHERE t.user_id = ?`

    const sqlShared = `
    WITH RECURSIVE 
    DirectShared AS (
        SELECT t.*
        FROM tsk_list t
        JOIN task_shares ts ON t.id = ts.task_id
        WHERE ts.user_id = ?
    ),
    Ancestors(id, parent_id, name, origin_id) AS (
        SELECT id, parent_id, name, id as origin_id FROM DirectShared
        UNION ALL
        SELECT t.id, t.parent_id, t.name, a.origin_id
        FROM tsk_list t
        JOIN Ancestors a ON t.id = a.parent_id
    ),
    Descendants AS (
        SELECT t.* FROM DirectShared t
        UNION ALL
        SELECT t.* FROM tsk_list t
        JOIN Descendants d ON t.parent_id = d.id
    )
    SELECT DISTINCT d.*, u.username as owner_name, r.name as project_name
    FROM Descendants d
    LEFT JOIN users u ON d.user_id = u.id
    LEFT JOIN (
        SELECT origin_id, name 
        FROM Ancestors 
        WHERE parent_id IS NULL OR parent_id = 0
    ) r ON d.id = r.origin_id
    `

    database.all(sqlMy, [user_id], (err, myRows) => {
        if (err) return res.status(500).json({ error: "Database error" });

        database.all(sqlShared, [user_id], (err, sharedRows) => {
            if (err) return res.status(500).json({ error: "Database error" });

            database.all(`SELECT ts.task_id, u.id, u.username, u.profile_pic 
                          FROM task_shares ts 
                          JOIN users u ON ts.user_id = u.id`, [], (err, allShares) => {

                if (err) return res.status(500).json({ error: "Database error" })

                const sharesMap = {}
                allShares.forEach(s => {
                    if (!sharesMap[s.task_id]) sharesMap[s.task_id] = []
                    sharesMap[s.task_id].push(s)
                })

                const map = new Map()
                myRows.forEach(r => map.set(r.id, { ...r, contributors: sharesMap[r.id] || [] }))
                sharedRows.forEach(r => map.set(r.id, { ...r, contributors: sharesMap[r.id] || [] }))

                res.json({
                    "message": "success",
                    "data": Array.from(map.values())
                })
            })
        })
    });
})


app.post("/update_profile", authenticateToken, (req, res) => {
    const id = req.user.id
    const { username, profile_pic, password } = req.body

    if (checkLen(username, 10)) return res.status(400).json({ error: "Username too long (max 10)" })

    database.get("SELECT id FROM users WHERE username = ? AND id != ?", [username, id], (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" })
        if (row) return res.status(400).json({ error: "Username taken" })

        if (password) {
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) return res.status(500).json({ error: "Server error" })
                const sql = `UPDATE users SET username = ?, profile_pic = ?, password = ? WHERE id = ?`
                database.run(sql, [username, profile_pic, hash, id], function (err) {
                    if (err) return res.status(500).json({ error: "Update failed" })
                    res.json({ message: "success" })
                })
            })
        } else {
            const sql = `UPDATE users SET username = ?, profile_pic = ? WHERE id = ?`
            database.run(sql, [username, profile_pic, id], function (err) {
                if (err) return res.status(500).json({ error: "Update failed" })
                res.json({ message: "success" })
            })
        }
    })
})

app.post("/share_task", authenticateToken, (req, res) => {
    const { task_id, username } = req.body

    database.get("SELECT user_id FROM tsk_list WHERE id = ?", [task_id], (err, task) => {
        if (err) return res.status(500).json({ error: "Database error" })
        if (!task) return res.status(404).json({ error: "Task not found" })
        if (task.user_id !== req.user.id) return res.status(403).json({ error: "Not authorized to share this task" })

        database.get("SELECT id FROM users WHERE username = ?", [username], (err, row) => {
            if (err) return res.status(500).json({ error: "Database error" })
            if (!row) return res.status(400).json({ error: "User not found" })
            const target_uid = row.id
            if (target_uid === req.user.id) return res.status(400).json({ error: "Cannot share with self" })

            database.get("SELECT id FROM task_shares WHERE task_id = ? AND user_id = ?", [task_id, target_uid], (err, row) => {
                if (err) return res.status(500).json({ error: "Database error" })
                if (row) return res.status(400).json({ error: "Already shared with user" })
                database.run("INSERT INTO task_shares (task_id, user_id) VALUES (?,?)", [task_id, target_uid], function (err) {
                    if (err) return res.status(500).json({ error: "Share failed" })
                    res.json({ message: "success" })
                })
            })
        })
    })
})

app.get("/get_contr", authenticateToken, (req, res) => {
    const { task_id } = req.query
    const sql = `SELECT u.id, u.username, u.profile_pic FROM task_shares ts 
                 JOIN users u ON ts.user_id = u.id 
                 WHERE ts.task_id = ?`
    database.all(sql, [task_id], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" })
        res.json({ data: rows })
    })
})

app.post("/rem_contr", authenticateToken, (req, res) => {
    const { task_id, user_id } = req.body

    database.get("SELECT user_id FROM tsk_list WHERE id = ?", [task_id], (err, task) => {
        if (err) return res.status(500).json({ error: "Database error" })
        if (!task) return res.status(404).json({ error: "Task not found" })
        if (task.user_id !== req.user.id) return res.status(403).json({ error: "Not authorized" })

        database.run("DELETE FROM task_shares WHERE task_id = ? AND user_id = ?", [task_id, user_id], function (err) {
            if (err) return res.status(500).json({ error: "Delete failed" })
            res.json({ message: "deleted" })
        })
    })
})

app.post("/add_tsk", authenticateToken, (req, res) => {
    const name = req.body.name
    const parent_id = req.body.parent_id
    const user_id = req.user.id

    if (!name || name.trim() === "") return res.status(400).json({ error: "Name required" })
    if (checkLen(name, 50)) return res.status(400).json({ error: "Name too long (max 50)" })

    var sql = 'INSERT INTO tsk_list (name, parent_id, user_id) VALUES (?,?,?)'
    database.run(sql, [name, parent_id, user_id], function (err, result) {
        if (err) return res.status(500).json({ error: "Failed to add task" })
        res.json({ "message": "success", "data": { name, parent_id, user_id }, "id": this.lastID })
    });
})

function runUpdate(req, res, sql, params, id) {
    database.get("SELECT user_id FROM tsk_list WHERE id = ?", [id], (err, task) => {
        if (err) return res.status(500).json({ error: "Database error" })
        if (!task) return res.status(404).json({ error: "Task not found" })

        const isOwner = task.user_id === req.user.id

        if (isOwner) {
            database.run(sql, params, function (err) {
                if (err) return res.status(500).json({ error: "Update failed" })
                res.json({ message: "success", changes: this.changes })
            })
            return
        }

        database.get("SELECT id FROM task_shares WHERE task_id = ? AND user_id = ?", [id, req.user.id], (err, share) => {
            if (err) return res.status(500).json({ error: "Database error" })
            if (share) {
                database.run(sql, params, function (err) {
                    if (err) return res.status(500).json({ error: "Update failed" })
                    res.json({ message: "success", changes: this.changes })
                })
            } else {
                return res.status(403).json({ error: "Not authorized" })
            }
        })
    })
}

app.post("/update_status", authenticateToken, (req, res) => {
    runUpdate(req, res, `UPDATE tsk_list SET is_done = ? WHERE id = ?`, [req.body.is_done, req.body.id], req.body.id)
})
app.post("/update_expanded", authenticateToken, (req, res) => {
    runUpdate(req, res, `UPDATE tsk_list SET is_expanded = ? WHERE id = ?`, [req.body.is_expanded, req.body.id], req.body.id)
})
app.post("/update_details", authenticateToken, (req, res) => {
    const { id, field, value } = req.body;
    const allowed = ['name', 'description', 'start_date', 'end_date', 'assigned_to', 'links', 'notes']
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

    runUpdate(req, res, `UPDATE tsk_list SET ${field} = ? WHERE id = ?`, [value, id], id)
})

app.post("/del_tsk", authenticateToken, (req, res) => {
    const id = req.body.id

    database.get("SELECT user_id FROM tsk_list WHERE id = ?", [id], (err, task) => {
        if (err) return res.status(500).json({ error: "Database error" })
        if (!task) return res.status(404).json({ error: "Task not found" })
        if (task.user_id !== req.user.id) return res.status(403).json({ error: "Only owner can delete" })

        const sql = `
        WITH RECURSIVE SubTasks AS (
            SELECT id FROM tsk_list WHERE id = ?
            UNION ALL
            SELECT t.id FROM tsk_list t
            JOIN SubTasks st ON t.parent_id = st.id
        )
        DELETE FROM tsk_list WHERE id IN (SELECT id FROM SubTasks);
        `
        database.run(sql, id, function (err) {
            if (err) return res.status(500).json({ error: "Delete failed" })
            res.json({ "message": "deleted", changes: this.changes })
        });
    })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
