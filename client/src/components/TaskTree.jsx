
import { useState, useEffect, useRef } from 'react'
import { useLongPress } from 'use-long-press'
import axios from 'axios'
import { useTaskContext } from '../context/TaskContext'

function TaskTree({ node, isRoot = false, isLast = false, ownerName, projectName, canShare = true, parentContributors = [] }) {
    const { selectedId, pendingParentId, onSelect, submitCtx, onToggle, onDel, onUpdate, onToggleExpanded, openDetailsIds, onDetailsToggle, onShare } = useTaskContext()

    const allContributors = [...parentContributors]
    if (node.contributors) {
        node.contributors.forEach(c => {
            if (!allContributors.find(ex => ex.id === c.id)) {
                allContributors.push(c)
            }
        })
    }

    const [open, setOpen] = useState(node.is_expanded === 1)
    const [newTsk, setNewTsk] = useState("")

    const detailsOpen = openDetailsIds.includes(node.id)

    const [editField, setEditField] = useState(null)
    const [editVal, setEditVal] = useState("")

    const isLongPress = useRef(false)
    const initialOpenState = useRef(false)

    const isSelected = selectedId === node.id
    const showInput = pendingParentId === node.id

    const [isPressing, setIsPressing] = useState(false)
    const [pressingField, setPressingField] = useState(null)
    const [isJiggling, setIsJiggling] = useState(false)
    const prevDetailsOpen = useRef(detailsOpen)
    const prevOpen = useRef(open)

    useEffect(() => {
        const justClosedDetails = prevDetailsOpen.current && !detailsOpen

        const hasChildren = node.children && node.children.length > 0
        const justClosedSubs = prevOpen.current && !open && hasChildren

        if (justClosedDetails || justClosedSubs) {
            setTimeout(() => {
                setIsJiggling(true)
                setTimeout(() => setIsJiggling(false), 200)
            }, 300)
        }
        prevDetailsOpen.current = detailsOpen
        prevOpen.current = open
    }, [detailsOpen, open, node.children])

    useEffect(() => {
        if (detailsOpen && canShare) {
            fetchContrib()
        }
    }, [detailsOpen, canShare])

    const [showContrib, setShowContrib] = useState(false)
    const [contributors, setContributors] = useState([])
    const [contribInput, setContribInput] = useState("")

    const fetchContrib = () => {
        axios.get(`http://localhost:3001/get_contr?task_id=${node.id}`)
            .then(res => setContributors(res.data.data))
            .catch(err => console.log(err))
    }

    const handleAddContrib = () => {
        if (!contribInput) return

        if (parentContributors.some(c => c.username === contribInput)) {
            alert("User is already a contributor on a parent task")
            return
        }

        if (contributors.some(c => c.username === contribInput)) {
            alert("User already added as contributor")
            return
        }

        onShare(node.id, contribInput).then(res => {
            if (res.data.message === 'success') {
                setContribInput("")
                fetchContrib()
            } else {
                alert(res.data.error || res.data.message)
            }
        }).catch(err => {
            alert(err.response?.data?.error || "Error adding contributor")
        })
    }

    const handleRemContrib = (uid) => {
        axios.post("http://localhost:3001/rem_contr", { task_id: node.id, user_id: uid })
            .then(() => fetchContrib())
    }

    const bind = useLongPress(() => {
        if (onDetailsToggle) onDetailsToggle(node.id)
        isLongPress.current = true
    }, {
        onStart: () => {
            isLongPress.current = false
            initialOpenState.current = detailsOpen
            onSelect(node.id)
            setIsPressing(true)
        },
        onFinish: () => setIsPressing(false),
        onCancel: () => setIsPressing(false),
        threshold: 500,
        cancelOnMovement: true
    })

    const lpConfig = (field) => ({
        threshold: 500,
        cancelOnMovement: true,
        onStart: () => setPressingField(field),
        onFinish: () => setPressingField(null),
        onCancel: () => setPressingField(null)
    })

    const bindDesc = useLongPress(() => start_edit('description', node.description), lpConfig('description'))
    const bindStart = useLongPress(() => start_edit('start_date', node.start_date), lpConfig('start_date'))
    const bindEnd = useLongPress(() => start_edit('end_date', node.end_date), lpConfig('end_date'))
    const bindAssigned = useLongPress(() => start_edit('assigned_to', node.assigned_to), lpConfig('assigned_to'))
    const bindLinks = useLongPress(() => start_edit('links', node.links), lpConfig('links'))
    const bindNotes = useLongPress(() => start_edit('notes', node.notes), lpConfig('notes'))

    const handle_add_sub = () => {
        if (newTsk.trim()) {
            submitCtx(newTsk, node.id)
            setNewTsk("")
            setOpen(true)
        }
    }

    const start_edit = (field, val) => {
        setEditField(field)
        setEditVal(val)
    }

    const save_edit = () => {
        if (editField && editVal !== node[editField]) {
            onUpdate(node.id, editField, editVal)
        }
        setEditField(null)
    }

    const format_date = (val) => {
        if (!val) return "_"
        const p = val.split('-')
        if (p.length === 3 && p[0].length === 4) {
            return `${p[1]}:${p[2]}:${p[0]}`
        }
        return val
    }

    const getDaysLeft = (end_date) => {
        if (!end_date) return null
        const end = new Date(end_date)
        const now = new Date()
        end.setHours(0, 0, 0, 0)
        now.setHours(0, 0, 0, 0)

        const diffTime = end - now
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return diffDays
    }

    const getMinChildDate = (n) => {
        if (!n.children || n.children.length === 0) return null
        let min = null

        const check = (list) => {
            for (const c of list) {
                if (c.is_done) continue
                if (c.end_date) {
                    if (!min || new Date(c.end_date) < new Date(min)) min = c.end_date
                }
                if (c.children) check(c.children)
            }
        }
        check(n.children)
        return min
    }

    return (
        <div className="tree-node" style={{
            position: "relative",
            marginLeft: isRoot ? "0px" : "24px",
        }}>

            {!isRoot && (
                <>
                    <div style={{
                        position: "absolute",
                        left: "-22px",
                        top: "2",
                        height: "16px",
                        width: "18px",
                        borderBottomLeftRadius: "12px",
                        borderLeft: "2px solid #555",
                        borderBottom: "2px solid #555",
                        background: "transparent"
                    }} />

                    {!isLast && (
                        <div style={{
                            position: "absolute",
                            left: "-22px",
                            top: "13px",
                            bottom: "0",
                            width: "2px",
                            background: "#444"
                        }} />
                    )}
                </>
            )}


            <div className="node-content" style={{ position: "relative" }}>

                <div className="node-content" style={{ position: "relative" }}>

                    <div
                        {...bind()}
                        className={isJiggling ? "impact-jiggle" : ""}
                        onClick={(e) => {
                            e.stopPropagation();

                            if (isLongPress.current) {
                                isLongPress.current = false
                                return
                            }

                            onSelect(node.id);

                            const newState = !open
                            setOpen(newState);
                            if (onToggleExpanded) onToggleExpanded(node.id, newState ? 1 : 0)
                        }}
                        style={{
                            padding: "4px 0",
                            background: "transparent",
                            width: "fit-content",
                            minWidth: "150px",
                            cursor: "pointer"
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {ownerName && (
                                <span style={{ color: "#888", fontSize: "0.8em", marginRight: "-4px" }}>
                                    {ownerName}{projectName ? ` / ${projectName}` : ""}:
                                </span>
                            )}
                            {editField === 'name' ? (
                                <input
                                    value={editVal} onChange={e => setEditVal(e.target.value)}
                                    onBlur={save_edit} onKeyDown={e => e.key === 'Enter' && save_edit()}
                                    autoFocus
                                    style={{
                                        background: "transparent",
                                        color: isSelected ? "#fff" : (node.is_done ? "#666" : "wheat"),
                                        border: "none",
                                        outline: "none",
                                        fontFamily: "inherit",
                                        fontSize: "inherit",
                                        fontWeight: isSelected ? "bold" : "normal",
                                        width: `${Math.max(editVal.length, 1)}ch`,
                                        padding: 0,
                                        margin: 0
                                    }}
                                />
                            ) : (
                                <span style={{
                                    userSelect: "none",
                                    WebkitUserSelect: "none",
                                    MozUserSelect: "none",
                                    msUserSelect: "none",
                                    whiteSpace: "pre"
                                }}>
                                    {node.name.split('').map((char, i) => {
                                        const showOrange = isPressing
                                            ? !initialOpenState.current
                                            : detailsOpen
                                        const useLtr = showOrange || (isSelected && !detailsOpen) || node.is_done

                                        const totalDuration = 500
                                        const charTransition = 150
                                        const delayStep = node.name.length > 1
                                            ? (totalDuration - charTransition) / (node.name.length - 1)
                                            : 0

                                        return (
                                            <span key={i} style={{
                                                color: showOrange ? "#f16a50" : (node.is_done ? "#666" : (isSelected ? "#fff" : "wheat")),
                                                fontWeight: isSelected ? "bold" : "normal",
                                                textDecoration: "line-through",
                                                textDecorationColor: node.is_done ? "currentColor" : "transparent",
                                                transition: `all ${charTransition}ms ease-out`,
                                                transitionDelay: useLtr ? `${i * delayStep}ms` : `${(node.name.length - 1 - i) * delayStep}ms`,
                                                display: "inline-block"
                                            }}>
                                                {char}
                                            </span>
                                        )
                                    })}
                                </span>
                            )}


                            {!detailsOpen && node.contributors && node.contributors.length > 0 && (
                                <div
                                    title={node.contributors.map(c => c.username).join(', ')}
                                    style={{ display: "flex", marginLeft: "4px", alignItems: "center", cursor: "default" }}
                                >
                                    {node.contributors.slice(0, 4).map((c, i) => (
                                        <div key={i} style={{
                                            width: "20px",
                                            height: "20px",
                                            borderRadius: "50%",
                                            overflow: "hidden",
                                            border: "1px solid #111",
                                            marginLeft: i === 0 ? "0px" : "-8px",
                                            zIndex: 4 - i
                                        }}>
                                            {c.profile_pic ?
                                                <img src={c.profile_pic} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                : <div style={{ width: "100%", height: "100%", background: "#333" }} />
                                            }
                                        </div>
                                    ))}
                                    {node.contributors.length > 4 && <span style={{ fontSize: "10px", color: "#666", marginLeft: "4px" }}>+{node.contributors.length - 4}</span>}
                                </div>
                            )}


                            {node.end_date && !node.is_done && (
                                <span style={{
                                    fontSize: "0.75em",
                                    color: getDaysLeft(node.end_date) < 0 ? "#f55" : "#666",
                                    marginLeft: "8px",
                                    marginRight: node.children && node.children.length > 0 ? "0px" : "8px"
                                }}>
                                    {(() => {
                                        const d = getDaysLeft(node.end_date)
                                        if (d === 0) return "due today"
                                        if (d === 1) return "due tomorrow"
                                        return `due in ${d} days`
                                    })()}
                                </span>
                            )}

                            {!open && node.children && node.children.length > 0 && (() => {
                                const childDate = getMinChildDate(node)
                                if (!childDate) return null
                                const d = getDaysLeft(childDate)
                                return (
                                    <span style={{
                                        fontSize: "0.75em",
                                        color: d < 0 ? "#f55" : "#888",
                                        marginLeft: "8px",
                                        fontStyle: "italic",
                                        marginRight: "8px"
                                    }}>
                                        (sub: {d === 0 ? "due today" : (d === 1 ? "due tomorrow" : `due in ${d} days`)})
                                    </span>
                                )
                            })()}

                            {node.children && node.children.length > 0 && (
                                <div style={{
                                    width: open ? "0px" : "4px",
                                    height: "4px",
                                    borderRadius: "50%",
                                    backgroundColor: "wheat",
                                    opacity: open ? 0 : 0.6,
                                    marginLeft: open ? "0px" : "8px",
                                    transform: open ? "translateX(-10px)" : "translateX(0)",
                                    transition: "all 300ms ease-out",
                                    overflow: "hidden"
                                }} />
                            )}

                            {detailsOpen && (
                                <div style={{ display: "flex", gap: "2px", marginLeft: "10px" }}>
                                    <button onClick={(e) => { e.stopPropagation(); onToggle(node.id, !node.is_done) }} style={{ background: "transparent", color: "#888", fontSize: "12px" }}>[{node.is_done ? "undone" : "done"}]</button>
                                    <button onClick={(e) => { e.stopPropagation(); start_edit('name', node.name) }} style={{ background: "transparent", color: "#666", fontSize: "12px" }}>[rename]</button>
                                    <button onClick={(e) => { e.stopPropagation(); if (window.confirm("Sure delete?")) onDel(node.id) }} style={{ background: "transparent", color: "#f55", fontSize: "12px" }}>[delete]</button>
                                </div>
                            )}



                        </div>
                    </div>

                    <div style={{
                        display: "grid",
                        gridTemplateRows: detailsOpen ? "1fr" : "0fr",
                        transition: "grid-template-rows 350ms ease-in-out"
                    }}>
                        <div style={{ overflow: "hidden" }}>
                            <div style={{
                                marginLeft: "16px",
                                marginTop: "8px",
                                fontSize: "0.9em",
                                color: "#aaa",
                                borderLeft: "2px solid #333",
                                paddingLeft: "16px",
                                paddingLeft: "16px",
                                maxWidth: "500px",
                                overflowWrap: "break-word",
                                position: "relative"
                            }}>


                                <div
                                    {...(!editField && bindDesc())}
                                    style={{
                                        marginBottom: "8px",
                                        cursor: "pointer",
                                        padding: "8px",
                                        borderRadius: "4px",
                                        transition: "background 500ms ease-out",
                                        background: pressingField === 'description' ? "rgba(241, 106, 80, 0.1)" : "transparent"
                                    }}>
                                    {editField === 'description' ?
                                        <textarea
                                            value={editVal}
                                            onChange={e => setEditVal(e.target.value)}
                                            onBlur={save_edit}
                                            autoFocus
                                            style={{
                                                background: "transparent",
                                                color: "inherit",
                                                border: "none",
                                                outline: "none",
                                                width: "100%",
                                                fontFamily: "inherit",
                                                fontSize: "inherit",
                                                resize: "vertical",
                                                minHeight: "60px"
                                            }}
                                        />
                                        : (
                                            <div style={{
                                                transition: "color 500ms ease-out",
                                                color: pressingField === 'description' ? "#f16a50" : "inherit"
                                            }}>
                                                {node.description || "Add description..."}
                                            </div>
                                        )}
                                </div>

                                <div
                                    {...(!editField && bindStart())}
                                    style={{
                                        padding: "8px",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        transition: "background 500ms ease-out",
                                        background: pressingField === 'start_date' ? "rgba(241, 106, 80, 0.1)" : "transparent"
                                    }}
                                >
                                    From:
                                    {editField === 'start_date' ?
                                        <div
                                            style={{ display: "flex", alignItems: "center" }}
                                            onBlur={(e) => {
                                                if (!e.currentTarget.contains(e.relatedTarget)) {
                                                    save_edit()
                                                }
                                            }}
                                        >
                                            <input
                                                type="date"
                                                value={editVal}
                                                autoFocus
                                                onKeyDown={e => e.key === 'Enter' && save_edit()}
                                                onChange={e => setEditVal(e.target.value)}
                                                style={{ marginLeft: "5px", background: "transparent", border: "none", colorScheme: "dark", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit" }}
                                            />
                                        </div>
                                        :
                                        <span style={{
                                            marginLeft: "8px",
                                            transition: "color 500ms ease-out",
                                            color: pressingField === 'start_date' ? "#f16a50" : "inherit"
                                        }}>
                                            {format_date(node.start_date)}
                                        </span>}
                                </div>
                                <div
                                    {...(!editField && bindEnd())}
                                    style={{
                                        padding: "8px",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        transition: "background 500ms ease-out",
                                        background: pressingField === 'end_date' ? "rgba(241, 106, 80, 0.1)" : "transparent"
                                    }}
                                >
                                    To:
                                    {editField === 'end_date' ?
                                        <div
                                            style={{ display: "flex", alignItems: "center" }}
                                            onBlur={(e) => {
                                                if (!e.currentTarget.contains(e.relatedTarget)) {
                                                    save_edit()
                                                }
                                            }}
                                        >
                                            <input
                                                type="date"
                                                value={editVal}
                                                autoFocus
                                                onKeyDown={e => e.key === 'Enter' && save_edit()}
                                                onChange={e => setEditVal(e.target.value)}
                                                style={{ marginLeft: "5px", background: "transparent", border: "none", colorScheme: "dark", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit" }}
                                            />
                                        </div>
                                        :
                                        <span style={{
                                            marginLeft: "8px",
                                            transition: "color 500ms ease-out",
                                            color: pressingField === 'end_date' ? "#f16a50" : "inherit"
                                        }}>
                                            {format_date(node.end_date)}
                                        </span>}
                                </div>

                                <div
                                    {...(!editField && bindAssigned())}
                                    style={{
                                        padding: "8px",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        transition: "background 500ms ease-out",
                                        background: pressingField === 'assigned_to' ? "rgba(241, 106, 80, 0.1)" : "transparent"
                                    }}
                                >
                                    Assigned:
                                    {editField === 'assigned_to' ?
                                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                                {allContributors.map(c => {
                                                    const currentList = editVal ? editVal.split(', ').filter(x => x) : []
                                                    const isSelected = currentList.includes(c.username)
                                                    return (
                                                        <div
                                                            key={c.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                let newList = [...currentList]
                                                                if (isSelected) {
                                                                    newList = newList.filter(x => x !== c.username)
                                                                } else {
                                                                    newList.push(c.username)
                                                                }
                                                                setEditVal(newList.join(', '))
                                                            }}
                                                            style={{
                                                                padding: "4px 8px",
                                                                borderRadius: "12px",
                                                                fontSize: "11px",
                                                                cursor: "pointer",
                                                                border: isSelected ? "1px solid #f16a50" : "1px solid #444",
                                                                background: isSelected ? "rgba(241, 106, 80, 0.2)" : "#222",
                                                                color: isSelected ? "wheat" : "#888",
                                                                transition: "all 0.2s"
                                                            }}
                                                        >
                                                            {c.username}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            <div style={{ textAlign: "right" }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); save_edit() }}
                                                    style={{
                                                        background: "#f16a50", color: "#fff",
                                                        border: "none", borderRadius: "4px",
                                                        padding: "4px 8px", fontSize: "10px",
                                                        cursor: "pointer", opacity: 0.8
                                                    }}
                                                >
                                                    Done
                                                </button>
                                            </div>
                                        </div>
                                        :
                                        <span style={{
                                            marginLeft: "8px",
                                            transition: "color 500ms ease-out",
                                            color: pressingField === 'assigned_to' ? "#f16a50" : "inherit"
                                        }}>
                                            {node.assigned_to || "_"}
                                        </span>}
                                </div>

                                <div
                                    {...(!editField && bindLinks())}
                                    style={{
                                        padding: "8px",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        transition: "background 500ms ease-out",
                                        background: pressingField === 'links' ? "rgba(241, 106, 80, 0.1)" : "transparent"
                                    }}
                                >
                                    Links:
                                    {editField === 'links' ?
                                        <textarea
                                            value={editVal}
                                            onChange={e => setEditVal(e.target.value)}
                                            onBlur={save_edit}
                                            autoFocus
                                            style={{
                                                background: "transparent",
                                                color: "#f16a50",
                                                border: "none",
                                                outline: "none",
                                                fontFamily: "inherit",
                                                fontSize: "inherit",
                                                width: "100%",
                                                resize: "vertical"
                                            }}
                                        /> :
                                        <div style={{
                                            marginLeft: "8px",
                                            display: "inline-block",
                                            verticalAlign: "top",
                                            transition: "color 500ms ease-out",
                                            color: pressingField === 'links' ? "#f16a50" : "inherit"
                                        }}>
                                            {node.links ? node.links.split('\n').map((link, i) => (
                                                <div key={i}>
                                                    <a
                                                        href={link.startsWith('http') ? link : `https://${link}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ color: pressingField === 'links' ? "#f16a50" : "#f16a50", textDecoration: "underline", cursor: "pointer" }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {link}
                                                    </a>
                                                </div>
                                            )) : <span style={{ color: pressingField === 'links' ? "#f16a50" : "#f16a50", cursor: "pointer" }}>_</span>}
                                        </div>}
                                </div>

                                <div
                                    {...(!editField && bindNotes())}
                                    style={{
                                        marginTop: "16px",
                                        cursor: "pointer",
                                        padding: "8px",
                                        borderRadius: "4px",
                                        transition: "background 500ms ease-out",
                                        background: pressingField === 'notes' ? "rgba(241, 106, 80, 0.1)" : "transparent"
                                    }}
                                >
                                    {editField === 'notes' ?
                                        <textarea
                                            value={editVal}
                                            onChange={e => setEditVal(e.target.value)}
                                            onBlur={save_edit}
                                            autoFocus
                                            style={{
                                                background: "transparent",
                                                color: "inherit",
                                                border: "none",
                                                outline: "none",
                                                width: "100%",
                                                fontFamily: "inherit",
                                                fontSize: "inherit",
                                                resize: "vertical",
                                                minHeight: "60px"
                                            }}
                                        /> :
                                        <div style={{
                                            transition: "color 500ms ease-out",
                                            color: pressingField === 'notes' ? "#f16a50" : "inherit"
                                        }}>
                                            {node.notes || "Add note..."}
                                        </div>}
                                </div>

                                {canShare && (
                                    <div style={{
                                        marginTop: "16px",
                                        padding: "8px",
                                        borderRadius: "4px",
                                        border: "1px dashed #333"
                                    }}>
                                        <div style={{ marginBottom: "8px", color: "#666", fontSize: "12px" }}>Contributors:</div>

                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                                            {contributors.map(c => (
                                                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                        {c.profile_pic ?
                                                            <img src={c.profile_pic} style={{ width: "20px", height: "20px", borderRadius: "50%", objectFit: "cover" }} />
                                                            : <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#333" }} />
                                                        }
                                                        <span style={{ color: "wheat" }}>{c.username}</span>
                                                    </div>
                                                    <button onClick={() => handleRemContrib(c.id)} style={{ background: "transparent", color: "#f55", fontSize: "10px", cursor: "pointer", border: "none" }}>[x]</button>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={{ display: "flex", gap: "5px" }}>
                                            <input
                                                placeholder="Add username..."
                                                value={contribInput}
                                                onChange={e => setContribInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddContrib()}
                                                style={{ background: "transparent", borderBottom: "1px solid #444", borderTop: "none", borderLeft: "none", borderRight: "none", color: "wheat", width: "100%", fontSize: "12px", outline: "none" }}
                                            />
                                            <button onClick={handleAddContrib} style={{ color: "#f16a50", background: "transparent", border: "none", cursor: "pointer" }}>+</button>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showInput && (
                <div style={{ marginLeft: "20px", padding: "10px", position: "relative" }}>
                    <div style={{ position: "absolute", left: "-18px", top: "-10px", height: "32px", width: "18px", borderBottomLeftRadius: "12px", borderLeft: "2px solid #444", borderBottom: "2px solid #444", background: "transparent" }} />

                    <input
                        autoFocus
                        placeholder="Subtask..."
                        value={newTsk}
                        onChange={e => setNewTsk(e.target.value)}
                        onBlur={() => onSelect(null)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handle_add_sub()
                            if (e.key === 'Escape') onSelect(null)
                        }}
                        style={{
                            background: "transparent", borderBottom: "1px solid #f16a50",
                            color: "wheat", width: "200px"
                        }}
                    />
                </div>
            )}

            {node.children && node.children.length > 0 && (
                <div style={{
                    display: "grid",
                    gridTemplateRows: open ? "1fr" : "0fr",
                    transition: "grid-template-rows 350ms ease-in-out"
                }}>
                    <div style={{ overflow: "hidden" }}>
                        {node.children.map((child, index) => (
                            <TaskTree
                                key={child.id}
                                node={child}
                                isLast={index === node.children.length - 1}
                                canShare={canShare}
                                parentContributors={allContributors}
                            />
                        ))}
                    </div>
                </div>
            )}

        </div>
    )
}

export default TaskTree
