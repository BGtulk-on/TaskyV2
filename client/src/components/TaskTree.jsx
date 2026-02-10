
import { useState, useEffect, useRef } from 'react'
import { useLongPress } from 'use-long-press'
import axios from 'axios'
import { useTaskContext } from '../context/TaskContext'
import ReactMarkdown from 'react-markdown'

function TaskTree({ node, isRoot = false, isLast = false, ownerName, projectName, canShare = true, parentContributors = [] }) {
    const { selectedId, pendingParentId, onSelect, onSetPendingParent, submitCtx, onToggle, onDel, onUpdate, onToggleExpanded, openDetailsIds, onDetailsToggle, onShare, onRemoveContributor, prefs, currentUser, reorderedSiblingIds } = useTaskContext()

    const allContributors = []

    if (currentUser && !allContributors.find(ex => ex.id === currentUser.id)) {
        allContributors.push({ id: currentUser.id, username: currentUser.username, profile_pic: currentUser.profile_pic })
    }

    parentContributors.forEach(c => {
        if (!allContributors.find(ex => ex.id === c.id)) {
            allContributors.push(c)
        }
    })
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
    const prevPriority = useRef(node.priority)
    const prevIsDone = useRef(node.is_done)
    const [displayContributors, setDisplayContributors] = useState(node.contributors || [])
    const [swipeOffset, setSwipeOffset] = useState(0)
    const touchStartX = useRef(0)
    const touchStartY = useRef(0)
    const isSwiping = useRef(false)
    const subtaskInputRef = useRef(null)

    useEffect(() => {
        const justClosedDetails = prevDetailsOpen.current && !detailsOpen

        const hasChildren = node.children && node.children.length > 0
        const justClosedSubs = prevOpen.current && !open && hasChildren

        const priorityChanged = prevPriority.current !== node.priority && prevPriority.current !== undefined
        const doneChanged = prevIsDone.current !== node.is_done && prevIsDone.current !== undefined

        if ((justClosedDetails || justClosedSubs || priorityChanged || doneChanged) && prefs.enableJiggle) {
            setTimeout(() => {
                setIsJiggling(true)
                setTimeout(() => setIsJiggling(false), 200)
            }, priorityChanged || doneChanged ? 50 : 300)
        }
        prevDetailsOpen.current = detailsOpen
        prevOpen.current = open
        prevPriority.current = node.priority
        prevIsDone.current = node.is_done
    }, [detailsOpen, open, node.children, node.priority, node.is_done])

    useEffect(() => {
        if (reorderedSiblingIds && reorderedSiblingIds.includes(node.id) && prefs.enableJiggle) {
            setTimeout(() => {
                setIsJiggling(true)
                setTimeout(() => setIsJiggling(false), 200)
            }, 100)
        }
    }, [reorderedSiblingIds])

    useEffect(() => {
        const hasContributors = node.contributors && node.contributors.length > 0
        if (hasContributors) {
            setDisplayContributors(node.contributors)
        } else {
            setTimeout(() => setDisplayContributors([]), 300)
        }
    }, [node.contributors])

    useEffect(() => {
        if (showInput && subtaskInputRef.current) {
            setTimeout(() => subtaskInputRef.current?.focus(), 100)
        }
    }, [showInput])

    useEffect(() => {
        if (detailsOpen && canShare) {
            fetchContrib()
        }
    }, [detailsOpen, canShare])

    const [showContrib, setShowContrib] = useState(false)
    const [contributors, setContributors] = useState([])
    const [contribInput, setContribInput] = useState("")

    const fetchContrib = () => {
        axios.get(`/api/get_contr?task_id=${node.id}`)
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
        if (onRemoveContributor) {
            onRemoveContributor(node.id, uid).then(() => fetchContrib())
        }
    }

    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX
        touchStartY.current = e.touches[0].clientY
        isSwiping.current = false
    }

    const handleTouchMove = (e) => {
        const deltaX = e.touches[0].clientX - touchStartX.current
        const deltaY = e.touches[0].clientY - touchStartY.current

        if (!isSwiping.current && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            isSwiping.current = true
        }

        if (isSwiping.current && deltaX > 0) {
            requestAnimationFrame(() => {
                if (isSwiping.current) {
                    setSwipeOffset(Math.min(deltaX, 100))
                }
            })
        }
    }

    const handleTouchEnd = () => {
        if (swipeOffset > 80 && onSetPendingParent) {
            onSelect(node.id)
            onSetPendingParent(node.id)
            setIsJiggling(true)
            setTimeout(() => setIsJiggling(false), 400)
        }
        setSwipeOffset(0)
        isSwiping.current = false
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
        threshold: prefs.holdDelay,
        cancelOnMovement: true
    })

    const lpConfig = (field) => ({
        threshold: prefs.holdDelay,
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
    const bindPriority = useLongPress(() => start_edit('priority', node.priority || ''), lpConfig('priority'))

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
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
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
                            cursor: "pointer",
                            transform: `translateX(${swipeOffset}px)`,
                            transition: swipeOffset === 0 ? "transform 200ms ease-out" : "none",
                            touchAction: "pan-y",
                            willChange: swipeOffset > 0 ? "transform" : "auto"
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
                            ) : (() => {
                                const isAssignedToMe = currentUser && node.assigned_to && node.assigned_to.split(', ').includes(currentUser.username)
                                const showWave = isAssignedToMe && !detailsOpen && !node.is_done

                                return (
                                    <span
                                        className={showWave ? "assigned-wave" : ""}
                                        style={{
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

                                            const totalDuration = prefs.holdDelay
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
                                )
                            })()}


                            <div
                                style={{
                                    display: "flex",
                                    marginLeft: (node.contributors && node.contributors.length > 0) ? "4px" : "0px",
                                    alignItems: "center",
                                    cursor: "default",
                                    opacity: (node.contributors && node.contributors.length > 0) ? 1 : 0,
                                    maxWidth: (node.contributors && node.contributors.length > 0) ? "200px" : "0px",
                                    transform: (node.contributors && node.contributors.length > 0) ? "scale(1)" : "scale(0.8)",
                                    transition: "all 300ms ease-out",
                                    overflow: "hidden",
                                    height: "24px"
                                }}
                                title={node.contributors ? node.contributors.map(c => c.username).join(', ') : ""}
                            >
                                {displayContributors.slice(0, 4).map((c, i) => (
                                    <div key={i} style={{
                                        width: "20px",
                                        height: "20px",
                                        borderRadius: "50%",
                                        overflow: "hidden",
                                        border: "2px solid #333",
                                        outline: "1px solid #111",
                                        marginLeft: i === 0 ? "0px" : "-8px",
                                        zIndex: 4 - i,
                                        flexShrink: 0
                                    }}>
                                        {c.profile_pic ?
                                            <img src={c.profile_pic} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            : <div style={{ width: "100%", height: "100%", background: "#333" }} />
                                        }
                                    </div>
                                ))}
                                {displayContributors.length > 4 && <span style={{ fontSize: "10px", color: "#666", marginLeft: "4px", whiteSpace: "nowrap" }}>+{displayContributors.length - 4}</span>}
                            </div>


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
                                    overflow: "hidden",
                                    flexShrink: 0,
                                    position: "relative",
                                    top: "1.5px"
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
                                        transition: `all ${prefs.holdDelay}ms ease-out`,
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
                                                transition: `color ${prefs.holdDelay}ms ease-out`,
                                                color: pressingField === 'description' ? "#f16a50" : "inherit",
                                                whiteSpace: "pre-wrap"
                                            }} className="markdown-desc">
                                                {node.description ?
                                                    <ReactMarkdown children={node.description} />
                                                    : "Add description..."}
                                            </div>
                                        )}
                                </div>

                                <div
                                    {...(!editField && bindStart())}
                                    style={{
                                        padding: "8px",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        transition: `all ${prefs.holdDelay}ms ease-out`,
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
                                            transition: `color ${prefs.holdDelay}ms ease-out`,
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
                                        transition: `all ${prefs.holdDelay}ms ease-out`,
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
                                            transition: `color ${prefs.holdDelay}ms ease-out`,
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
                                        transition: `all ${prefs.holdDelay}ms ease-out`,
                                        background: pressingField === 'assigned_to' ? "rgba(241, 106, 80, 0.1)" : "transparent"
                                    }}
                                >
                                    Assigned:
                                    {editField === 'assigned_to' ?
                                        <div
                                            tabIndex={0}
                                            style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px", outline: "none" }}
                                            onBlur={(e) => {
                                                if (!e.currentTarget.contains(e.relatedTarget)) {
                                                    save_edit()
                                                }
                                            }}
                                        >
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
                                        </div>
                                        :
                                        <span style={{
                                            marginLeft: "8px",
                                            transition: `color ${prefs.holdDelay}ms ease-out`,
                                            color: pressingField === 'assigned_to' ? "#f16a50" : "inherit"
                                        }}>
                                            {node.assigned_to || "_"}
                                        </span>}
                                </div>

                                <div
                                    {...(!editField && bindPriority())}
                                    style={{
                                        padding: "8px",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        transition: `all ${prefs.holdDelay}ms ease-out`,
                                        background: pressingField === 'priority' ? "rgba(241, 106, 80, 0.1)" : "transparent"
                                    }}
                                >
                                    Priority:
                                    {editField === 'priority' ?
                                        <div
                                            tabIndex={0}
                                            style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px", outline: "none" }}
                                            onBlur={(e) => {
                                                if (!e.currentTarget.contains(e.relatedTarget)) {
                                                    save_edit()
                                                }
                                            }}
                                        >
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                {['High', 'Medium', 'Low'].map(p => (
                                                    <div
                                                        key={p}
                                                        onClick={(e) => { e.stopPropagation(); setEditVal(p) }}
                                                        style={{
                                                            padding: "4px 12px",
                                                            borderRadius: "12px",
                                                            fontSize: "11px",
                                                            cursor: "pointer",
                                                            border: editVal === p ? "1px solid " + (p === 'High' ? "#f55" : p === 'Medium' ? "#fa0" : "#5a5") : "1px solid #444",
                                                            background: editVal === p ? (p === 'High' ? "rgba(255,85,85,0.2)" : p === 'Medium' ? "rgba(255,170,0,0.2)" : "rgba(85,170,85,0.2)") : "#222",
                                                            color: editVal === p ? (p === 'High' ? "#f55" : p === 'Medium' ? "#fa0" : "#5a5") : "#888",
                                                            transition: "all 0.2s"
                                                        }}
                                                    >
                                                        {p}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        :
                                        <span style={{
                                            marginLeft: "8px",
                                            transition: `color ${prefs.holdDelay}ms ease-out`,
                                            color: pressingField === 'priority' ? "#f16a50" : (node.priority === 'High' ? "#f55" : node.priority === 'Medium' ? "#fa0" : node.priority === 'Low' ? "#5a5" : "inherit")
                                        }}>
                                            {node.priority || "_"}
                                        </span>}
                                </div>

                                <div
                                    {...(!editField && bindLinks())}
                                    style={{
                                        padding: "8px",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        transition: `all ${prefs.holdDelay}ms ease-out`,
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
                                            transition: `color ${prefs.holdDelay}ms ease-out`,
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
                                        transition: `all ${prefs.holdDelay}ms ease-out`,
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
                                            transition: `color ${prefs.holdDelay}ms ease-out`,
                                            color: pressingField === 'notes' ? "#f16a50" : "inherit",
                                            whiteSpace: "pre-wrap"
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

                                        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                                            <form onSubmit={e => { e.preventDefault(); handleAddContrib(); }} style={{ flex: 1, display: "flex", gap: "8px" }}>
                                                <input
                                                    placeholder="Username..."
                                                    value={contribInput}
                                                    onChange={e => setContribInput(e.target.value)}
                                                    style={{ background: "transparent", borderBottom: "1px solid #444", borderTop: "none", borderLeft: "none", borderRight: "none", color: "wheat", width: "100%", fontSize: "12px", outline: "none" }}
                                                />
                                                <button type="submit" style={{ color: "#f16a50", background: "transparent", border: "none", cursor: "pointer" }}>+</button>
                                            </form>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {
                showInput && (
                    <div style={{ marginLeft: "20px", padding: "10px", position: "relative" }}>
                        <div style={{ position: "absolute", left: "-18px", top: "-10px", height: "32px", width: "18px", borderBottomLeftRadius: "12px", borderLeft: "2px solid #444", borderBottom: "2px solid #444", background: "transparent" }} />

                        <form onSubmit={e => { e.preventDefault(); handle_add_sub(); }} style={{ display: "inline" }}>
                            <input
                                ref={subtaskInputRef}
                                autoFocus
                                placeholder="Subtask..."
                                value={newTsk}
                                onChange={e => setNewTsk(e.target.value)}
                                onBlur={() => onSelect(null)}
                                onKeyDown={e => {
                                    if (e.key === 'Escape') onSelect(null)
                                }}
                                style={{
                                    background: "transparent", borderBottom: "1px solid #f16a50",
                                    color: "wheat", width: "200px", fontSize: "inherit", fontFamily: "inherit"
                                }}
                            />
                        </form>
                    </div>
                )
            }

            {
                node.children && node.children.length > 0 && (
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
                )
            }

        </div >
    )
}

export default TaskTree
