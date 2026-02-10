import { useState, useEffect, useRef } from 'react'
import TaskTree from './components/TaskTree'
import TaskContext from './context/TaskContext'
import './App.css'

function GuestPage({ onExit }) {
    const guestUser = { id: 0, username: "Guest", profile_pic: null }

    const [dataList, setDtac] = useState([
        { id: 1, name: "Welcome to Tasky", description: "This is a guest mode demo.", is_done: 0, is_expanded: 1, parent_id: null, priority: "High", assigned_to: "Guest", end_date: "2026-02-15", children: [] },
        { id: 2, name: "Try clicking a task", description: "Click to select, hold to open details", is_done: 0, is_expanded: 1, parent_id: 1, priority: "Medium", assigned_to: "Guest", children: [] },
        { id: 3, name: "Add subtasks with Enter", description: "Press Enter when task is selected", is_done: 0, is_expanded: 1, parent_id: 1, priority: "", assigned_to: "", children: [] },
        { id: 4, name: "Mark as done", description: "Click the checkbox", is_done: 1, is_expanded: 0, parent_id: 1, priority: "Low", assigned_to: "", children: [] },

        { id: 5, name: "My Project", description: "A sample project", is_done: 0, is_expanded: 1, parent_id: null, priority: "Medium", assigned_to: "", children: [] },
        { id: 6, name: "Design Phase", description: "UI/UX design work", is_done: 0, is_expanded: 1, parent_id: 5, priority: "High", assigned_to: "Guest", end_date: "2026-02-10", children: [] },
        { id: 7, name: "Create wireframes", description: "", is_done: 1, is_expanded: 0, parent_id: 6, priority: "High", assigned_to: "", children: [] },
        { id: 8, name: "Design mockups", description: "", is_done: 0, is_expanded: 0, parent_id: 6, priority: "Medium", assigned_to: "Guest", children: [] },
        { id: 9, name: "Development Phase", description: "Build the app", is_done: 0, is_expanded: 1, parent_id: 5, priority: "", assigned_to: "", children: [] },
        { id: 10, name: "Setup project", description: "", is_done: 1, is_expanded: 0, parent_id: 9, priority: "High", assigned_to: "", children: [] },
        { id: 11, name: "Build components", description: "", is_done: 0, is_expanded: 0, parent_id: 9, priority: "Medium", assigned_to: "Guest", children: [] },
        { id: 12, name: "Testing", description: "", is_done: 0, is_expanded: 0, parent_id: 9, priority: "Low", assigned_to: "", children: [] },

        { id: 13, name: "Low Priority Tasks", description: "Things to do later", is_done: 0, is_expanded: 1, parent_id: null, priority: "Low", assigned_to: "", children: [] },
        { id: 14, name: "Review documentation", description: "", is_done: 0, is_expanded: 0, parent_id: 13, priority: "", assigned_to: "", children: [] },
        { id: 15, name: "Cleanup old files", description: "", is_done: 0, is_expanded: 0, parent_id: 13, priority: "", assigned_to: "", children: [] },
    ])

    const [selectedId, setSelectedId] = useState(null)
    const [pendingParentId, setPendingParentId] = useState(null)
    const [openDetailsIds, setOpenDetailsIds] = useState([])
    const [prefs, setPrefs] = useState({ sort: "newest", moveDone: false, autoNewTask: true, holdDelay: 500, enableJiggle: true, autoAssign: false })
    const [reorderedSiblingIds, setReorderedSiblingIds] = useState([])
    const [justDoneIds, setJustDoneIds] = useState([])
    const [isCreatingRoot, setIsCreatingRoot] = useState(false)
    const [rootInput, setRootInput] = useState("")
    const lastTap = useRef(0)



    function build_tree(items) {
        const lookup = {}
        const entries = items.map(item => ({ ...item, children: [] }))
        const rootItems = []

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
                rootItems.push(item)
            }
        }
        return rootNodesSort(rootItems)
    }

    function rootNodesSort(nodes) {
        const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 }

        const sortFn = (a, b) => {
            let pA = 0
            let pB = 0

            if (prefs.moveDone) {
                if (a.is_done && !justDoneIds.includes(a.id)) pA = 1
                if (b.is_done && !justDoneIds.includes(b.id)) pB = 1
            }

            if (pA !== pB) return pA - pB

            const prioA = priorityOrder[a.priority] ?? 3
            const prioB = priorityOrder[b.priority] ?? 3
            if (prioA !== prioB) return prioA - prioB

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
        const newId = Date.now()
        const newT = {
            id: newId,
            name: name,
            parent_id: parent_id,
            is_done: 0,
            is_expanded: 1,
            description: '',
            start_date: '',
            end_date: '',
            assigned_to: prefs.autoAssign ? guestUser.username : '',
            links: '',
            notes: '',
            priority: '',
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
    }

    const toggl_stat = (id, status) => {
        const task = dataList.find(t => t.id === id)
        const siblings = dataList.filter(t => t.parent_id === task?.parent_id && t.id !== id).map(t => t.id)
        setReorderedSiblingIds(siblings)
        setTimeout(() => setReorderedSiblingIds([]), 400)

        if (status) {
            setJustDoneIds(prev => [...prev, id])
        } else {
            setJustDoneIds(prev => prev.filter(x => x !== id))
        }

        setDtac(prev => prev.map(t => t.id === id ? { ...t, is_done: status } : t))
    }

    const update_details = (id, field, value) => {
        if (field === 'priority') {
            const task = dataList.find(t => t.id === id)
            const siblings = dataList.filter(t => t.parent_id === task?.parent_id && t.id !== id).map(t => t.id)
            setReorderedSiblingIds(siblings)
            setTimeout(() => setReorderedSiblingIds([]), 400)
        }
        setDtac(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
    }

    const toggle_expanded = (id, val) => {
        setDtac(prev => prev.map(t => t.id === id ? { ...t, is_expanded: val } : t))
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
    }

    const handleToggleDetails = (id) => {
        setOpenDetailsIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    const share_task = async (task_id, username) => {
        alert("Sharing not available in Guest Mode")
        return { data: { message: "error", error: "Not available" } }
    }


    const treeData = build_tree(dataList)

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
        onSetPendingParent: (id) => setPendingParentId(id),
        onShare: share_task,
        prefs,
        currentUser: guestUser,
        reorderedSiblingIds
    }



    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setPendingParentId(null)
                return
            }

            if (e.key === 'Enter') {
                if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return

                if (selectedId) {
                    setPendingParentId(selectedId)
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedId])


    return (
        <TaskContext.Provider value={ctxVal}>
            <div className="main-layout" onClick={() => {
                const now = Date.now()
                const laps = now - lastTap.current

                if (laps < 300 && laps > 0) {
                    setIsCreatingRoot(true)
                } else {
                    setSelectedId(null)
                    setPendingParentId(null)
                    setIsCreatingRoot(false)
                }

                lastTap.current = now
            }}>

                <div className="app-header" style={{ background: "#222" }}>
                    <div className="user-info">
                        <span className="user-greeting" style={{ color: "#f16a50" }}>GUEST MODE</span>
                    </div>
                    <div className="header-actions">
                        <button onClick={onExit} className="logout-btn">Exit Guest Mode</button>
                    </div>
                </div>

                {isCreatingRoot && (
                    <div className="new-project-wrap">
                        <form onSubmit={e => {
                            e.preventDefault();
                            if (rootInput.trim()) {
                                add_task(rootInput)
                                setRootInput("")
                            }
                        }}>
                            <input
                                autoFocus
                                placeholder="New Project..."
                                className="new-project-input"
                                value={rootInput}
                                onChange={e => setRootInput(e.target.value)}
                                onBlur={() => setIsCreatingRoot(false)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') setIsCreatingRoot(false)
                                }}
                            />
                        </form>
                    </div>
                )}

                <div className="prj-list">
                    {treeData.map((node, index) => (
                        <div key={node.id} className="project-item">
                            <TaskTree
                                node={node}
                                isRoot={true}
                                isLast={index === treeData.length - 1}
                                canShare={false}
                            />
                        </div>
                    ))}

                    <div className="hints" style={{ marginTop: "50px" }}>
                        <div>* This is a temporary session. Changes are not saved.</div>
                        <div>* To see all the features, please sign in!</div>
                        <br></br>
                        {window.innerWidth <= 768 ? (
                            <>
                                <div>* Double tap background for new Project.</div>
                                <div>* Swipe Task to right to add subtask.</div>
                                <div>* Hold a task for menu.</div>
                                <div>* Hold a content in the detiled menu to edit it.</div>
                                <div>* Click task to show/hide his sub-tasks.</div>
                            </>
                        ) : (
                            <>
                                <div>* Click background + Enter to add new Project.</div>
                                <div>* Press Enter to add subtask to selected task.</div>
                                <div>* Hold a task for menu.</div>
                                <div>* Hold a content in the detiled menu to edit it.</div>
                                <div>* Click task to show/hide his sub-tasks.</div>
                            </>
                        )}
                    </div>
                </div>

            </div>
        </TaskContext.Provider>
    )
}


export default GuestPage
