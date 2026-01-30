
import { useState, useEffect } from 'react'
import axios from 'axios'
import TaskTree from './components/TaskTree'
import Auth from './components/Auth'
import TaskContext from './context/TaskContext'


function App() {
  const [dataList, setDtac] = useState([])
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)

  const [selectedId, setSelectedId] = useState(null)
  const [pendingParentId, setPendingParentId] = useState(null)

  const [isCreatingRoot, setIsCreatingRoot] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const u = localStorage.getItem("tasky_user")
    const t = localStorage.getItem("tasky_token")
    if (u && t) {
      setUser(JSON.parse(u))
      setToken(t)
    }
  }, [])

  useEffect(() => {
    const reqInt = axios.interceptors.request.use(config => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    const resInt = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          handleLogout()
        }
        return Promise.reject(err)
      }
    )

    return () => {
      axios.interceptors.request.eject(reqInt)
      axios.interceptors.response.eject(resInt)
    }
  }, [token])

  useEffect(() => {
    if (user && token) load_data()
  }, [user, token])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsCreatingRoot(false)
        setPendingParentId(null)
        return
      }

      if (e.key === 'Enter') {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return

        if (selectedId) {
          setPendingParentId(selectedId)
          setIsCreatingRoot(false)
        } else {
          setIsCreatingRoot(true)
          setPendingParentId(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId])


  const [openDetailsIds, setOpenDetailsIds] = useState([])

  const handleToggleDetails = (id) => {
    setOpenDetailsIds(prev => {
      if (prev.includes(id)) {
        setJustDoneIds(jd => jd.filter(x => x !== id))
        return prev.filter(pid => pid !== id)
      } else {
        const newIds = [...prev, id]
        if (newIds.length > 2) {
          newIds.shift()
        }
        return newIds
      }
    })
  }


  function load_data() {
    if (!token) return
    axios.get(`http://localhost:3001/get_all`)
      .then(res => {
        setDtac(res.data.data)
      })
      .catch(err => console.log(err))
  }


  const [prefs, setPrefs] = useState(() => {
    const saved = localStorage.getItem("tasky_prefs")
    return saved ? JSON.parse(saved) : { sort: "newest", moveDone: false }
  })

  useEffect(() => {
    localStorage.setItem("tasky_prefs", JSON.stringify(prefs))
  }, [prefs])


  function build_tree(items) {
    const rootItems = []
    const lookup = {};

    const entries = items.map(item => ({ ...item, children: [] }))

    for (const item of entries) {
      lookup[item.id] = item
    }

    for (const item of entries) {
      if (item.parent_id) {
        if (lookup[item.parent_id]) {
          lookup[item.parent_id].children.push(item)
        } else {
          rootItems.push(item)
        }
      } else {
        rootItems.push(item);
      }
    }

    return rootNodesSort(rootItems);
  }

  const [justDoneIds, setJustDoneIds] = useState([])

  function rootNodesSort(nodes) {
    const sortFn = (a, b) => {
      let pA = 0
      let pB = 0

      if (prefs.moveDone) {
        if (a.is_done && !justDoneIds.includes(a.id)) pA = 1
        if (b.is_done && !justDoneIds.includes(b.id)) pB = 1
      }

      if (pA !== pB) return pA - pB

      let res = 0
      if (prefs.sort === 'newest') {
        res = b.id - a.id
      } else if (prefs.sort === 'due_closest') {
        if (!a.due_date) res = 1
        else if (!b.due_date) res = -1
        else res = new Date(a.due_date) - new Date(b.due_date)
      }

      return res
    }

    const recursiveSort = (list) => {
      list.sort(sortFn)
      list.forEach(node => {
        if (node.children && node.children.length > 0) {
          recursiveSort(node.children)
        }
      })
      return list
    }

    return recursiveSort(nodes)
  }

  const add_task = (name, parent_id = null) => {
    axios.post("http://localhost:3001/add_tsk", {
      name: name,
      parent_id: parent_id
    }).then(res => {
      const newT = {
        ...res.data.data,
        id: res.data.id,
        is_done: 0,
        is_expanded: 1,
        description: '',
        start_date: '',
        end_date: '',
        assigned_to: '',
        links: '',
        notes: '',
        contributors: []
      }
      setDtac(prev => [...prev, newT])
      setPendingParentId(null)
      setIsCreatingRoot(false)
    })
  }

  const toggl_stat = (id, status) => {
    const prevStatus = dataList.find(t => t.id === id)?.is_done

    if (status) {
      setJustDoneIds(prev => [...prev, id])
    } else {
      setJustDoneIds(prev => prev.filter(x => x !== id))
    }

    setDtac(prev => prev.map(t => t.id === id ? { ...t, is_done: status } : t))

    axios.post("http://localhost:3001/update_status", {
      id: id,
      is_done: status
    }).catch(err => {
      setDtac(prev => prev.map(t => t.id === id ? { ...t, is_done: prevStatus } : t))
      if (prevStatus) {
        setJustDoneIds(prev => [...prev, id])
      } else {
        setJustDoneIds(prev => prev.filter(x => x !== id))
      }
    })
  }

  const update_details = (id, field, value) => {
    setDtac(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))

    axios.post("http://localhost:3001/update_details", {
      id, field, value
    })
  }

  const toggle_expanded = (id, val) => {
    setDtac(prev => prev.map(t => t.id === id ? { ...t, is_expanded: val } : t))

    axios.post("http://localhost:3001/update_expanded", {
      id: id,
      is_expanded: val
    })
  }

  const share_task = (task_id, username) => {
    return axios.post("http://localhost:3001/share_task", { task_id, username })
      .then(res => {
        load_data()
        return res
      })
  }

  const del_it = (id) => {
    const toDel = []
    const findChildren = (pid) => {
      dataList.filter(t => t.parent_id === pid).forEach(c => {
        toDel.push(c.id)
        findChildren(c.id)
      })
    }
    toDel.push(id)
    findChildren(id)

    setDtac(prev => prev.filter(t => !toDel.includes(t.id)))
    if (selectedId === id) setSelectedId(null)

    axios.post("http://localhost:3001/del_tsk", { id: id })
  }


  const treeData = build_tree(dataList)

  const myProjects = treeData.filter(t => t.user_id === user.id)
  const sharedProjects = treeData.filter(t => t.user_id !== user.id)

  const handleLogin = (u, t) => {
    setUser(u)
    setToken(t)
    localStorage.setItem("tasky_user", JSON.stringify(u))
    localStorage.setItem("tasky_token", t)
  }

  const handleLogout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem("tasky_user")
    localStorage.removeItem("tasky_token")
    setDtac([])
  }

  if (!user) return <Auth onLogin={handleLogin} />

  const ctxVal = {
    selectedId,
    pendingParentId,
    onSelect: (id) => { setSelectedId(id); if (id === null) setPendingParentId(null); },
    submitCtx: add_task,
    onToggle: toggl_stat,
    onDel: del_it,
    onUpdate: update_details,
    onToggleExpanded: toggle_expanded,
    openDetailsIds,
    onDetailsToggle: handleToggleDetails,
    onShare: share_task
  }

  return (
    <TaskContext.Provider value={ctxVal}>
      <div className="main-layout" onClick={() => { setSelectedId(null); setPendingParentId(null); setIsCreatingRoot(false) }} style={{ minHeight: "100vh" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {user.profile_pic && <img src={user.profile_pic} style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }} />}
            <span style={{ color: "#666" }}>Hi, {user.username}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", transition: "transform 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.color = "wheat"}
              onMouseLeave={e => e.currentTarget.style.color = "#666"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            <button onClick={handleLogout} style={{ background: "transparent", color: "#f55", cursor: "pointer", border: "none", fontSize: "14px" }}>Logout</button>
          </div>
        </div>


        {isCreatingRoot && (
          <div style={{ marginBottom: "20px" }}>
            <input
              autoFocus
              placeholder="New Project..."
              onBlur={() => setIsCreatingRoot(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  add_task(e.target.value)
                }
                if (e.key === 'Escape') setIsCreatingRoot(false)
              }}
              style={{
                background: "#111", border: "1px solid #f16a50", color: "wheat",
                padding: "10px", borderRadius: "8px", width: "100%", fontSize: "18px"
              }}
            />
          </div>
        )}

        <div className="prj-list">
          {myProjects.map((node, index) => (
            <div key={node.id} style={{ marginBottom: "10px" }}>
              <TaskTree
                node={node}
                isRoot={true}
                isLast={index === myProjects.length - 1}
                canShare={true}
              />
            </div>
          ))}

          {sharedProjects.length > 0 && (
            <>
              <div style={{ height: "1px", background: "#333", margin: "20px 0" }} />
              <div style={{ color: "#666", marginBottom: "10px", fontSize: "12px" }}>Shared with me:</div>
              {sharedProjects.map((node, index) => (
                <div key={node.id} style={{ marginBottom: "10px" }}>
                  <TaskTree
                    ownerName={node.owner_name}
                    projectName={node.project_name && node.project_name !== node.name ? node.project_name : null}
                    node={node}
                    isRoot={true}
                    isLast={index === sharedProjects.length - 1}
                    canShare={false}
                  />
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ marginTop: "50px", color: "#444", fontSize: "14px" }}>
          <div>* Press Enter to add subtask to selected.</div>
          <div>* Click background + Enter to add new Project.</div>
          <div>* Long Press task for menu.</div>
          <div>* Click task to show his sub-tasks.</div>
        </div>

        {showSettings && <SettingsModal user={user} onUpdate={handleLogin} prefs={prefs} onPrefUpdate={setPrefs} onClose={() => setShowSettings(false)} />}

      </div>
    </TaskContext.Provider>
  )
}

function SettingsModal({ user, onUpdate, prefs, onPrefUpdate, onClose }) {
  const [tab, setTab] = useState("profile")
  const [editForm, setEditForm] = useState({ username: user.username, profile_pic: user.profile_pic })
  const [msg, setMsg] = useState("")

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return setMsg("File > 5MB")

    const reader = new FileReader()
    reader.onloadend = () => setEditForm({ ...editForm, profile_pic: reader.result })
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    if (!editForm.username || editForm.username.length > 10) return setMsg("Invalid username")

    axios.post("http://localhost:3001/update_profile", {
      id: user.id,
      username: editForm.username,
      profile_pic: editForm.profile_pic
    }).then(res => {
      if (res.data.message === "success") {
        setMsg("Profile Updated!")
        onUpdate({ ...user, username: editForm.username, profile_pic: editForm.profile_pic })
      }
    }).catch(err => setMsg(err.response?.data?.error || "Error updating"))
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)",
      display: "flex", justifyContent: "center", alignItems: "center",
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        width: "400px", height: "450px", background: "#111", border: "1px solid #333", borderRadius: "16px",
        padding: "20px", display: "flex", flexDirection: "column", gap: "20px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        transform: "scale(1)", animation: "popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, color: "wheat" }}>Settings</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: "18px" }}>✕</button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid #333", gap: "20px" }}>
          <div
            onClick={() => setTab("profile")}
            style={{
              padding: "10px 0", cursor: "pointer",
              color: tab === "profile" ? "#f16a50" : "#666",
              borderBottom: tab === "profile" ? "2px solid #f16a50" : "2px solid transparent",
              transition: "all 0.3s"
            }}
          >Profile</div>
          <div
            onClick={() => setTab("prefs")}
            style={{
              padding: "10px 0", cursor: "pointer",
              color: tab === "prefs" ? "#f16a50" : "#666",
              borderBottom: tab === "prefs" ? "2px solid #f16a50" : "2px solid transparent",
              transition: "all 0.3s"
            }}
          >Preferences</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: "5px" }}>
          {tab === "profile" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", animation: "fadeIn 0.3s" }}>

              <label className="hover-img" style={{ position: "relative", cursor: "pointer" }}>
                <img src={editForm.profile_pic} style={{ width: "100px", height: "100px", borderRadius: "50%", objectFit: "cover", border: "2px solid #333" }} />
                <div className="overlay" style={{
                  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                  background: "rgba(0,0,0,0.5)", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: 0, transition: "opacity 0.2s", color: "#fff", fontSize: "12px"
                }}>Change</div>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
              </label>
              <style>{`.hover-img:hover .overlay { opacity: 1; }`}</style>

              <div style={{ textAlign: "center", width: "100%" }}>
                <input
                  value={editForm.username}
                  onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                  placeholder="Username"
                  style={{
                    background: "transparent", border: "none", borderBottom: "1px solid #333",
                    textAlign: "center", color: "wheat", fontSize: "20px", fontWeight: "bold",
                    outline: "none", padding: "4px", width: "200px"
                  }}
                />
                <div style={{ color: "#666", fontSize: "14px", marginTop: "4px" }}>{user.email}</div>

                <input
                  type="password"
                  value={editForm.password || ""}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="New Password"
                  style={{
                    background: "#111", border: "1px solid #333", borderRadius: "6px",
                    textAlign: "center", color: "wheat", fontSize: "14px",
                    outline: "none", padding: "8px", width: "200px", marginTop: "10px"
                  }}
                />
              </div>

              <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
                {msg && <div style={{ color: msg.includes("Error") || msg.includes("taken") ? "#f55" : "#4caf50", fontSize: "12px" }}>{msg}</div>}
                <button onClick={handleSave} style={{
                  background: "#f16a50", color: "#fff", border: "none",
                  padding: "8px 16px", borderRadius: "6px", cursor: "pointer",
                  fontWeight: "bold", fontSize: "12px"
                }}>Save Changes</button>
              </div>

              <div style={{ marginTop: "10px", padding: "10px", background: "#1a1a1a", borderRadius: "8px", width: "100%", fontSize: "12px", color: "#888", textAlign: "center" }}>
                User ID: {user.id}
              </div>
            </div>
          )}

          {tab === "prefs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "fadeIn 0.3s" }}>

              <div
                onClick={() => onPrefUpdate({ ...prefs, moveDone: !prefs.moveDone })}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", background: "#1a1a1a", borderRadius: "8px", cursor: "pointer" }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: "#bbb" }}>Push Completed to Bottom</span>
                  <span style={{ fontSize: "10px", color: "#666" }}>Move done tasks to end of list</span>
                </div>
                <div style={{ width: "40px", height: "20px", background: prefs.moveDone ? "#f16a50" : "#333", borderRadius: "10px", position: "relative", transition: "background 0.3s" }}>
                  <div style={{
                    position: "absolute", top: "2px", width: "16px", height: "16px", background: "#fff", borderRadius: "50%",
                    left: prefs.moveDone ? "22px" : "2px", transition: "left 0.3s"
                  }}></div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "10px", background: "#1a1a1a", borderRadius: "8px" }}>
                <span style={{ color: "#bbb" }}>Sort Tasks By</span>
                <select
                  value={prefs.sort}
                  onChange={(e) => onPrefUpdate({ ...prefs, sort: e.target.value })}
                  style={{
                    padding: "10px", background: "#111", border: "1px solid #333", borderRadius: "6px",
                    color: "wheat", outline: "none", cursor: "pointer"
                  }}
                >
                  <option value="newest">Created (Newest First)</option>
                  <option value="due_closest">Due Date (Closest First)</option>
                </select>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default App
