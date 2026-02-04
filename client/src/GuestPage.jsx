import { useState, useEffect } from 'react'
import TaskTree from './components/TaskTree'
import TaskContext from './context/TaskContext'
import './App.css'

function GuestPage({ onExit }) {
    const [dataList, setDtac] = useState([
        { id: 1, name: "Welcome to Tasky", description: "This is a guest mode.", is_done: 0, is_expanded: 1, parent_id: null, children: [] },
        { id: 2, name: "Try adding a task", description: "You can add subtasks too!", is_done: 0, is_expanded: 1, parent_id: 1, children: [] },
        { id: 3, name: "Features", description: "Explore the UI", is_done: 0, is_expanded: 1, parent_id: 1, children: [] },
        { id: 4, name: "Security", description: "Your data is safe", is_done: 1, is_expanded: 0, parent_id: 3, children: [] },
    ])

    const [selectedId, setSelectedId] = useState(null)
    const [pendingParentId, setPendingParentId] = useState(null)
    const [openDetailsIds, setOpenDetailsIds] = useState([])
    const [prefs, setPrefs] = useState({ sort: "newest", moveDone: false, autoNewTask: true, holdDelay: 500, enableJiggle: true })



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
        return rootItems
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
            assigned_to: '',
            links: '',
            notes: '',
            contributors: []
        }
        setDtac(prev => [...prev, newT])

        if (prefs.autoNewTask && parent_id) {
            setPendingParentId(parent_id)
        } else {
            setPendingParentId(null)
        }
    }

    const toggl_stat = (id, status) => {
        setDtac(prev => prev.map(t => t.id === id ? { ...t, is_done: status } : t))
    }

    const update_details = (id, field, value) => {
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
        onShare: share_task,
        prefs
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
            <div className="main-layout" onClick={() => { setSelectedId(null); setPendingParentId(null) }}>

                <div className="app-header" style={{ background: "#222" }}>
                    <div className="user-info">
                        <span className="user-greeting" style={{ color: "#f16a50" }}>GUEST MODE</span>
                    </div>
                    <div className="header-actions">
                        <button onClick={onExit} className="logout-btn">Exit Guest Mode</button>
                    </div>
                </div>

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
                    </div>
                </div>

            </div>
        </TaskContext.Provider>
    )
}

export default GuestPage
