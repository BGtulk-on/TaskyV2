import { createContext, useContext } from 'react'

const TaskContext = createContext(null)

export const useTaskContext = () => {
    const ctx = useContext(TaskContext)
    if (!ctx) throw new Error("useTaskContext must be used within TaskProvider")
    return ctx
}

export default TaskContext
