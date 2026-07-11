// this is used to create a wrapper around node-notifier providing a custom icon and sound for the notifications

import notifier from 'node-notifier'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function notify(title, message){
    return new Promise((resolve)=>{
        notifier.notify({
            title,
            message,
            icon: path.join(__dirname, "../../assets/icon.png"),
            sound: true,
            wait: false // if this is true, then it block until there is some iteraction from the user like clicking the ok or the cancel button etc
        },
        (error, response)=>{
            resolve(response)
        })
    })
}

// this creates a blocking notification that has a clickable action button

function notifyWithConfirmation(title, message){
    return new Promise((resolve)=>{
        notifier.notify({
            title,
            message,
            icon: path.join(__dirname, '../../assets/icon.png'),
            sound: true,
            wait: true,
            actions: 'Confirm', // this adds a clickable button called 'confirm
        },
        (error, response)=>{
            resolve(response);
        })
    })
}

export {notify, notifyWithConfirmation}