import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

function Auth({ onLogin, onGuest }) {
    const [isLogin, setIsLogin] = useState(true)
    const [isAnimating, setIsAnimating] = useState(false)
    const [isExiting, setIsExiting] = useState(false)
    const [form, setForm] = useState({
        username: "",
        email: "",
        password: "",
        profile_pic: ""
    })
    const [err, setErr] = useState("")

    const toggleMode = () => {
        setIsAnimating(true)
        setTimeout(() => {
            setIsLogin(!isLogin)
            setErr("")
            setIsAnimating(false)
        }, 300)
    }

    const handleFile = (e) => {
        const file = e.target.files[0]
        if (!file) return

        if (file.size > 5 * 1024 * 1024) {
            setErr("File too large (>5MB)")
            return
        }

        const reader = new FileReader()
        reader.onloadend = () => {
            setForm({ ...form, profile_pic: reader.result })
        }
        reader.readAsDataURL(file)
    }

    const submit = async (e) => {
        e.preventDefault()
        setErr("")

        if (!isLogin) {
            if (form.username.length > 10) return setErr("Username must be 10 characters or less")

            if (form.password.length < 8) return setErr("Password too short")
            if (!/[A-Z]/.test(form.password)) return setErr("Password needs uppercase letter")
            if (!/[a-z]/.test(form.password)) return setErr("Password needs lowercase letter")
            if (!/[0-9]/.test(form.password)) return setErr("Password needs a number")
            if (!/[^A-Za-z0-9]/.test(form.password)) return setErr("Password needs special symbol")

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setErr("Invalid email format")
        }

        try {
            const url = isLogin ? "/api/login" : "/api/register"
            const res = await axios.post(url, form)

            if (res.data.message === 'success') {
                setIsExiting(true)
                setTimeout(() => {
                    onLogin(res.data.user, res.data.token)
                }, 450)
            }
        } catch (e) {
            setErr(e.response?.data?.error || "Error")
        }
    }

    return (
        <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", justifyContent: "center", alignItems: "center",
            background: "#050505", zIndex: 999
        }}>
            <form onSubmit={submit} style={{
                display: "flex", flexDirection: "column", gap: "16px",
                width: "300px", padding: "32px",
                border: "1px solid #333", borderRadius: "16px",
                background: "#0a0a0a",
                boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                animation: isExiting ? "authPopOut 0.45s ease forwards" : (isAnimating ? "none" : "authPopIn 0.5s ease-out"),
                transform: isAnimating ? "scale(0.95) translateY(10px)" : undefined,
                opacity: isAnimating ? 0.5 : undefined,
                transition: isAnimating ? "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)" : undefined
            }}>
                <h2 style={{
                    textAlign: "center", color: "wheat", margin: 0, marginBottom: "10px",
                    transition: "all 0.3s"
                }}>{isLogin ? "Login" : "Sign Up"}</h2>

                <Input
                    placeholder="Username"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                />

                {!isLogin && (
                    <div style={{
                        display: "flex", flexDirection: "column", gap: "16px",
                        animation: "fadeIn 0.4s ease-out"
                    }}>
                        <Input
                            placeholder="Email"
                            value={form.email}
                            type="email"
                            onChange={e => setForm({ ...form, email: e.target.value })}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <label htmlFor="file-upload" className="hover-btn" style={{
                                flex: 1,
                                cursor: "pointer",
                                padding: "12px",
                                border: "1px dashed #333",
                                borderRadius: "8px",
                                background: "#111",
                                color: "#666",
                                fontSize: "12px",
                                textAlign: "center",
                                transition: "all 0.2s"
                            }}>
                                {form.profile_pic ? "Change Picture" : "Upload Profile Pic (< 5MB)"}
                            </label>
                            <input
                                id="file-upload"
                                type="file"
                                accept="image/*"
                                onChange={handleFile}
                                style={{ display: "none" }}
                            />
                            {form.profile_pic && (
                                <img
                                    src={form.profile_pic}
                                    alt="Preview"
                                    style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", border: "1px solid #333", animation: "popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}
                                />
                            )}
                        </div>
                    </div>
                )}

                <Input
                    placeholder="Password"
                    type="password"
                    value={form.password}
                    onChange={e => {
                        const newPass = e.target.value
                        setForm({ ...form, password: newPass })
                    }}
                />

                {!isLogin && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingLeft: "4px" }}>
                        <RuleItem active={form.password.length >= 8} text="At least 8 characters" />
                        <RuleItem active={/[A-Z]/.test(form.password)} text="One uppercase letter" />
                        <RuleItem active={/[a-z]/.test(form.password)} text="One lowercase letter" />
                        <RuleItem active={/[0-9]/.test(form.password)} text="One number" />
                        <RuleItem active={/[^A-Za-z0-9]/.test(form.password)} text="One special symbol" />
                        <RuleItem active={form.username.length > 0 && form.username.length <= 10} text="Username max 10 chars" />
                    </div>
                )}

                {err && <div style={{ color: "#f55", fontSize: "12px", animation: "shake 0.3s linear" }}>{err}</div>}

                <button className="submit-btn" style={{
                    padding: "12px", borderRadius: "8px", border: "none",
                    background: "#f16a50", color: "#fff", fontWeight: "bold",
                    marginTop: "8px", cursor: "pointer",
                    transition: "transform 0.1s, filter 0.2s"
                }}>
                    {isLogin ? "Enter" : "Create Account"}
                </button>

                <div style={{ textAlign: "center", fontSize: "12px", color: "#666", cursor: "pointer", marginTop: "16px", userSelect: "none" }}
                    onClick={toggleMode}>
                    {isLogin ? "Need account? Sign up" : "Have account? Login"}
                </div>

                <div style={{ borderTop: "1px solid #333", margin: "16px 0 8px 0" }}></div>

                <button type="button" onClick={onGuest} style={{
                    width: "100%", padding: "10px", borderRadius: "8px", border: "1px dashed #666",
                    background: "transparent", color: "#888", fontSize: "12px", cursor: "pointer",
                    transition: "all 0.2s"
                }}
                    className="hover-btn">
                    Guest Mode (No Sign In)
                </button>
            </form>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes popIn { from { transform: scale(0); } to { transform: scale(1); } }
                @keyframes shake { 0% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } 100% { transform: translateX(0); } }
                @keyframes authPopIn { 
                    0% { transform: scale(0.9); opacity: 0; } 
                    60% { transform: scale(1.02); } 
                    80% { transform: scale(0.99); } 
                    100% { transform: scale(1); opacity: 1; } 
                }
                @keyframes authPopOut { 
                    0% { transform: scale(1); opacity: 1; } 
                    20% { transform: scale(1.02); } 
                    100% { transform: scale(0.9); opacity: 0; } 
                }
                .submit-btn:hover { filter: brightness(1.1); }
                .submit-btn:active { transform: scale(0.98); }
                .hover-btn:hover { background: #1a1a1a !important; border-color: #555 !important; color: #888 !important; }
            `}</style>
        </div>
    )
}

const RuleItem = ({ active, text }) => (
    <div style={{
        fontSize: "10px",
        color: active ? "#4caf50" : "#666",
        textDecoration: active ? "line-through" : "none",
        transition: "all 0.3s"
    }}>
        {text}
    </div>
)

function Input({ ...props }) {
    const [focused, setFocused] = useState(false)
    return (
        <input
            {...props}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            required
            style={{
                padding: "12px",
                background: "#111",
                border: focused ? "1px solid #f16a50" : "1px solid #333",
                borderRadius: "8px",
                color: "wheat",
                outline: "none",
                transition: "all 0.3s ease",
                width: "100%",
                boxSizing: "border-box"
            }}
        />
    )
}

export default Auth
