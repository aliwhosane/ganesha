const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'];
const COLORS = {
    debug: '\x1b[90m',  // gray
    info: '\x1b[36m',   // cyan
    warn: '\x1b[33m',   // yellow
    error: '\x1b[31m',  // red
    reset: '\x1b[0m',
};

function log(level, prefix, ...args) {
    if (LEVELS[level] < CURRENT_LEVEL) return;
    const timestamp = new Date().toISOString().slice(11, 23);
    const color = COLORS[level];
    console.log(`${color}[${timestamp}] [${level.toUpperCase()}] [${prefix}]${COLORS.reset}`, ...args);
}

export function createLogger(prefix) {
    return {
        debug: (...args) => log('debug', prefix, ...args),
        info: (...args) => log('info', prefix, ...args),
        warn: (...args) => log('warn', prefix, ...args),
        error: (...args) => log('error', prefix, ...args),
    };
}
