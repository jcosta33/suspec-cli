import { AsyncLocalStorage } from 'async_hooks';

type LogContext = {
    trace_id?: string;
    slug?: string;
};

type LogEntry = {
    level: string;
    msg: string;
    timestamp: string;
    trace_id?: string;
    slug?: string;
};

const asyncStorage = new AsyncLocalStorage<LogContext>();

function is_json_mode(): boolean {
    return process.env.SWARM_LOG_FORMAT === 'json';
}

function is_quiet(): boolean {
    return process.env.SWARM_LOG_LEVEL === 'quiet';
}

function format_timestamp(): string {
    return new Date().toISOString();
}

function output(level: string, msg: string): void {
    const context = asyncStorage.getStore();
    if (is_json_mode()) {
        const entry: LogEntry = {
            level,
            msg,
            timestamp: format_timestamp(),
        };
        if (context?.trace_id) entry.trace_id = context.trace_id;
        if (context?.slug) entry.slug = context.slug;
        process.stdout.write(`${JSON.stringify(entry)}\n`);
    } else {
        const prefix = context?.slug ? `[${context.slug}] ` : '';
        if (level === 'error') {
            console.error(prefix + msg);
        } else if (level === 'warn') {
            if (!is_quiet()) console.warn(prefix + msg);
        } else if (level === 'info') {
            if (!is_quiet()) console.log(prefix + msg);
        } else if (level === 'debug') {
            console.log(prefix + msg);
        } else {
            if (!is_quiet()) console.log(prefix + msg);
        }
    }
}

export const logger = {
    info(msg: string): void {
        output('info', msg);
    },
    error(msg: string): void {
        output('error', msg);
    },
    warn(msg: string): void {
        output('warn', msg);
    },
    debug(msg: string): void {
        if (process.env.SWARM_DEBUG || process.env.SWARM_LOG_LEVEL === 'verbose') {
            output('debug', msg);
        }
    },
    /**
     * Output raw text bypassing NDJSON formatting.
     * Use for structured visual output (banners, tables, boxes).
     */
    raw(msg: string): void {
        if (!is_quiet()) {
            process.stdout.write(`${msg}\n`);
        }
    },
};

export function run_with_context<T>(context: LogContext, fn: () => T): T {
    return asyncStorage.run(context, fn);
}

export function get_log_context(): LogContext | undefined {
    return asyncStorage.getStore();
}
