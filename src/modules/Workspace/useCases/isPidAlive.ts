// Is a recorded pid a LIVE process on this machine? The run-lock liveness probe (AC-008): a
// signal-0 kill checks existence without touching the process. The OS answer outranks any
// heartbeat timestamp — a long agent session stops heartbeating but its pid stays alive, and a
// crashed one leaves a fresh-looking heartbeat with a dead pid. A Workspace leaf: the process
// edge lives here, not in Core.

export function is_pid_alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM: the process exists but belongs to another user — alive. ESRCH (and anything
        // else): no such process.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
}
