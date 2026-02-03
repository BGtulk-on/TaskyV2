
import { useState, useEffect } from 'react'
import axios from 'axios'
import TaskTree from './components/TaskTree'
import Auth from './components/Auth'
import TaskContext from './context/TaskContext'
import { Analytics } from "@vercel/analytics/react"
import './App.css'


function App() {
  const [dataList, setDtac] = useState([])
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem("tasky_user")
    return u ? JSON.parse(u) : null
  })
  const [token, setToken] = useState(() => localStorage.getItem("tasky_token"))

  const [selectedId, setSelectedId] = useState(null)
  const [pendingParentId, setPendingParentId] = useState(null)

  const [isCreatingRoot, setIsCreatingRoot] = useState(false)
  const [rootPrjName, setRootPrjName] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

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
    axios.get(`/api/get_all`)
      .then(res => {
        setDtac(res.data.data)
      })
      .catch(err => console.log(err))
  }


  const [prefs, setPrefs] = useState(() => {
    const defaults = { sort: "newest", moveDone: false, autoNewTask: true, holdDelay: 500, enableJiggle: true }
    const saved = localStorage.getItem("tasky_prefs")
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults
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
        if (!a.end_date) res = 1
        else if (!b.end_date) res = -1
        else res = new Date(a.end_date) - new Date(b.end_date)
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
    axios.post("/api/add_tsk", {
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

      if (prefs.autoNewTask) {
        if (parent_id) {
          setPendingParentId(parent_id)
        } else {
          setIsCreatingRoot(true)
        }
      } else {
        setPendingParentId(null)
        setIsCreatingRoot(false)
      }
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

    axios.post("/api/update_status", {
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

    axios.post("/api/update_details", {
      id, field, value
    })
  }

  const toggle_expanded = (id, val) => {
    setDtac(prev => prev.map(t => t.id === id ? { ...t, is_expanded: val } : t))

    axios.post("/api/update_expanded", {
      id: id,
      is_expanded: val
    })
  }

  const share_task = (task_id, username) => {
    return axios.post("/api/share_task", { task_id, username })
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

    axios.post("/api/del_tsk", { id: id })
  }


  const handleLogin = (u, t) => {
    setUser(u)
    setToken(t)
    localStorage.setItem("tasky_user", JSON.stringify(u))
    localStorage.setItem("tasky_token", t)
  }

  const handleLogout = () => {
    setIsLoggingOut(true)
    setTimeout(() => {
      setUser(null)
      setToken(null)
      localStorage.removeItem("tasky_user")
      localStorage.removeItem("tasky_token")
      setDtac([])
      setIsLoggingOut(false)
    }, 400)
  }

  if (!user) return <Auth onLogin={handleLogin} />

  const treeData = build_tree(dataList)
  const myProjects = treeData.filter(t => t.user_id === user.id)
  const sharedProjects = treeData.filter(t => t.user_id !== user.id)

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
    onShare: share_task,
    prefs
  }

  return (
    <TaskContext.Provider value={ctxVal}>
      <div className={`main-layout ${isLoggingOut ? "fade-out" : ""}`} onClick={() => { setSelectedId(null); setPendingParentId(null); setIsCreatingRoot(false) }}>

        <div className="app-header">
          <div className="user-info">
            {user.profile_pic && <img src={user.profile_pic} className="user-avatar" />}
            <span className="user-greeting">Hi, {user.username}</span>
          </div>
          <div className="header-actions">
            <button onClick={() => setShowSettings(true)} title="Settings" className={`settings-btn ${showSettings ? "active" : ""}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        </div>


        {isCreatingRoot && (
          <div className="new-project-wrap">
            <input
              autoFocus
              placeholder="New Project..."
              className="new-project-input"
              value={rootPrjName}
              onChange={e => setRootPrjName(e.target.value)}
              onBlur={() => setIsCreatingRoot(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rootPrjName.trim()) {
                  add_task(rootPrjName)
                  setRootPrjName("")
                }
                if (e.key === 'Escape') setIsCreatingRoot(false)
              }}
            />
          </div>
        )}

        <div className="prj-list">
          {myProjects.map((node, index) => (
            <div key={node.id} className="project-item">
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
              <div className="shared-divider" />
              <div className="shared-label">Shared with me:</div>
              {sharedProjects.map((node, index) => (
                <div key={node.id} className="project-item">
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

        <div className="hints">
          <div>* Click background + Enter to add new Project.</div>
          <div>* Press Enter to add subtask to selected task.</div>
          <div>* Long Press task for menu.</div>
          <div>* Click task to show his sub-tasks.</div>
        </div>

        {showSettings && <SettingsModal user={user} onUpdate={handleLogin} prefs={prefs} onPrefUpdate={setPrefs} onClose={() => setShowSettings(false)} />}

        <Analytics />
      </div>
    </TaskContext.Provider>
  )
}

function SettingsModal({ user, onUpdate, prefs, onPrefUpdate, onClose }) {
  const [tab, setTab] = useState("profile")
  const [editForm, setEditForm] = useState({ username: user.username, profile_pic: user.profile_pic })
  const [msg, setMsg] = useState("")
  const [selectOpen, setSelectOpen] = useState(false)
  const [holdDelayOpen, setHoldDelayOpen] = useState(false)
  const [toggleAnim, setToggleAnim] = useState(null)
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => onClose(), 300)
  }

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

    axios.post("/api/update_profile", {
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
    <div className={`modal-overlay ${isClosing ? "closing" : ""}`} onClick={handleClose}>
      <div className={`settings-modal ${isClosing ? "closing" : ""}`} onClick={e => e.stopPropagation()}>

        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button onClick={handleClose} className="close-btn">✕</button>
        </div>

        <div className="tabs" data-active={tab}>
          <div onClick={() => setTab("profile")} className={`tab ${tab === "profile" ? "active" : ""}`}>Profile</div>
          <div onClick={() => setTab("prefs")} className={`tab ${tab === "prefs" ? "active" : ""}`}>Preferences</div>
        </div>

        <div className="tab-content">
          {tab === "profile" && (
            <div className="profile-tab">

              <label className="hover-img">
                <img src={editForm.profile_pic} className="profile-avatar" />
                <div className="overlay">Change</div>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
              </label>

              <div className="profile-form">
                <input
                  value={editForm.username}
                  onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                  placeholder="Username"
                  className="username-input"
                />
                <div className="user-email">{user.email}</div>

                <input
                  type="password"
                  value={editForm.password || ""}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="New Password"
                  className="password-input"
                />
              </div>

              <div className="save-section">
                {msg && <div className={msg.includes("Error") || msg.includes("taken") ? "msg-error" : "msg-success"}>{msg}</div>}
                <button onClick={handleSave} className="save-btn">Save Changes</button>
              </div>

              <div className="user-id-box">
                User ID: {user.id}
              </div>
            </div>
          )}

          {tab === "prefs" && (
            <div className="prefs-tab">

              <div className="pref-item" onClick={() => { onPrefUpdate({ ...prefs, moveDone: !prefs.moveDone }); setToggleAnim('moveDone'); setTimeout(() => setToggleAnim(null), 300) }}>
                <div className="pref-text">
                  <span className="pref-label">Push Completed to Bottom</span>
                  <span className="pref-desc">Move done tasks to end of list</span>
                </div>
                <div className={`toggle ${prefs.moveDone ? "active" : ""} ${toggleAnim === 'moveDone' ? "jiggle" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              <div className="pref-item" onClick={() => { onPrefUpdate({ ...prefs, autoNewTask: !prefs.autoNewTask }); setToggleAnim('autoNewTask'); setTimeout(() => setToggleAnim(null), 300) }}>
                <div className="pref-text">
                  <span className="pref-label">Auto New Task</span>
                  <span className="pref-desc">Continue creating tasks after pressing Enter</span>
                </div>
                <div className={`toggle ${prefs.autoNewTask ? "active" : ""} ${toggleAnim === 'autoNewTask' ? "jiggle" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              <div className="pref-item" onClick={() => { onPrefUpdate({ ...prefs, enableJiggle: !prefs.enableJiggle }); setToggleAnim('enableJiggle'); setTimeout(() => setToggleAnim(null), 300) }}>
                <div className="pref-text">
                  <span className="pref-label">Impact Jiggle</span>
                  <span className="pref-desc">Shake task slightly when closing subtasks or details</span>
                </div>
                <div className={`toggle ${prefs.enableJiggle ? "active" : ""} ${toggleAnim === 'enableJiggle' ? "jiggle" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              <div className="sort-section">
                <span className="sort-label">Hold Delay</span>
                <div className={`dropdown ${holdDelayOpen ? "open" : ""}`}>
                  <div className="dropdown-trigger" onClick={() => setHoldDelayOpen(!holdDelayOpen)}>
                    <span>{prefs.holdDelay / 1000}s</span>
                    <svg className="dropdown-arrow" viewBox="0 0 24 24">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <div className="dropdown-menu">
                    {[200, 500, 1000].map(val => (
                      <div
                        key={val}
                        className={`dropdown-item ${prefs.holdDelay === val ? "active" : ""}`}
                        onClick={() => { onPrefUpdate({ ...prefs, holdDelay: val }); setHoldDelayOpen(false) }}
                      >{val / 1000}s</div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sort-section">
                <span className="sort-label">Sort Tasks By</span>
                <div className={`dropdown ${selectOpen ? "open" : ""}`}>
                  <div className="dropdown-trigger" onClick={() => setSelectOpen(!selectOpen)}>
                    <span>{prefs.sort === "newest" ? "Created (Newest First)" : "Due Date (Closest First)"}</span>
                    <svg className="dropdown-arrow" viewBox="0 0 24 24">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <div className="dropdown-menu">
                    <div
                      className={`dropdown-item ${prefs.sort === "newest" ? "active" : ""}`}
                      onClick={() => { onPrefUpdate({ ...prefs, sort: "newest" }); setSelectOpen(false) }}
                    >Created (Newest First)</div>
                    <div
                      className={`dropdown-item ${prefs.sort === "due_closest" ? "active" : ""}`}
                      onClick={() => { onPrefUpdate({ ...prefs, sort: "due_closest" }); setSelectOpen(false) }}
                    >Due Date (Closest First)</div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default App
