import winston from 'winston'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({format: 'YYYY-MM-DDTHH:mm:ss.SSSZ'}),
        winston.format.json()
    ),
    transports: [
        // this logs everything to the disk
        new winston.transports.File({
            filename: path.join(__dirname, "../../logs/agent.log"),
            maxsize: 5*1024*1024,
            maxFiles: 30, // for now, we are keeping 30 rotated log files
            tailable: true // this means that all the logs wil always be written to the same file
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorsize(),
                winston.format.printf(
                    ({leve, message, timestamp, module: module, ...rest}) => {
                        const extras = Object.keys(rest).length? `${JSON.stringify(rest)}` : '';
                        return `${timestamp} [${mod || 'main'}] ${level}: ${message}${extras}`
                    }
                )
            ),
        }),
    ],
});

export default logger;