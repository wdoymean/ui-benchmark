export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    context: string;
    message: string;
    data?: any;
}

class Logger {
    private minLevel: LogLevel = LogLevel.INFO;
    private logs: LogEntry[] = [];

    constructor() {
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        if (envLevel === 'DEBUG') this.minLevel = LogLevel.DEBUG;
        else if (envLevel === 'INFO') this.minLevel = LogLevel.INFO;
        else if (envLevel === 'WARN') this.minLevel = LogLevel.WARN;
        else if (envLevel === 'ERROR') this.minLevel = LogLevel.ERROR;
    }

    private log(level: LogLevel, context: string, message: string, data?: any): void {
        if (level < this.minLevel) return;

        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            context,
            message,
            data,
        };

        this.logs.push(entry);

        const levelName = LogLevel[level];
        const timestamp = entry.timestamp.toISOString();
        const prefix = `[${timestamp}] [${levelName}] [${context}]`;

        const color = this.getColor(level);
        const reset = '\x1b[0m';

        console.log(`${color}${prefix}${reset} ${message}`);
        if (data !== undefined) {
            console.log(`${color}${prefix}${reset} Data:`, data);
        }
    }

    private getColor(level: LogLevel): string {
        switch (level) {
            case LogLevel.DEBUG: return '\x1b[36m'; // Cyan
            case LogLevel.INFO: return '\x1b[32m'; // Green
            case LogLevel.WARN: return '\x1b[33m'; // Yellow
            case LogLevel.ERROR: return '\x1b[31m'; // Red
            default: return '';
        }
    }

    debug(context: string, message: string, data?: any): void {
        this.log(LogLevel.DEBUG, context, message, data);
    }

    info(context: string, message: string, data?: any): void {
        this.log(LogLevel.INFO, context, message, data);
    }

    warn(context: string, message: string, data?: any): void {
        this.log(LogLevel.WARN, context, message, data);
    }

    error(context: string, message: string, data?: any): void {
        this.log(LogLevel.ERROR, context, message, data);
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    clear(): void {
        this.logs = [];
    }
}

export const logger = new Logger();
