import {promises as fs} from 'fs'
import path from 'path'
import config from "../config/config.js"
import logger from "./utils/logger.js"
import {writeState} from "./utils/stateManager.js"
import {notify} from "./utils/notifier.js"

// this modules scans the given folder for folders following the naming convention 'Day N' and then checks the highest value of N that is there and then creates another folder with the name 'Day N+1'

// this function obtains the day number upto which the folders are already created

async function getMaxDayNumber(path){
    const entries = await fs.readdir(path, {withFileTypes: true});
    const namePatter = /^Day (\d+)$/i
    let max = 0;
    for(const entry of entries){
        if(!entry.isDirectory()) continue; // skip it if it is not a folder
        const match = entry.name.match(namePatter)
        if(match){
            const number = parseInt(match[1], 10) // parse the number from string using base 10 (for decimal)
            if(number > max) max = number
        }
    }
    return max
}

// this function creates the folders after getting the day number from above

async function createFolders(){
    // first thing to do is to log this even
    logger.info("Folder creation is starting..", {module: 'folderManager'});
    try{
        const max = await getMaxDayNumber(config.path.sdeSheet)
        const newDay = max+1;
        logger.info(`Current highest day: ${max}. Creating folder Day ${newDay}`, {
            module: 'folderManager'
        });
        // code folder
        const codeFolderPath = path.join(__dirname, `Day ${newDay}`)
        // images folder
        const imagesFolderPath = path.join(__dirname, `day ${newDay}`)

        // create the code folder

        try{
            await fs.access(codeFolderPath)
            logger.warn('Code folder already exists, skipping creation', {
                module: 'folderManager'
            })
        }
        catch(error){
            await fs.mkdir(codeFolderPath, {recursive: true})
            logger.info(`Creater folder : Day ${newDay}`, {
                module: 'folderManager'
            })
        }

        // create the images folder 

        try{
            await fs.access(imagesFolderPath)
            logger.warn('Code folder already exists, skipping creation', {
                module: 'folderManager'
            })
        }
        catch(error){
            await fs.mkdir(imagesFolderPath, {recursive: true})
            logger.info(`Creater folder :dDay ${newDay}`, {
                module: 'folderManager'
            })
        }

        // update the state

        await writeState({currentDay: newDay, foldersCreated: true})

        // notify the user about the folders being created

        await notify(`SDE Sheet Automation Agent`,
            `Day ${newDay} folder created !!! You can now open VS Code and start solving today's problems`
        );
        return newDay
    }
    catch(error){
        console.log(error)
        logger.error('Folder creation failed', {module: 'folderManager', error: error.message})
        // notify the user about the error
        notify(`Folder creation error', 'Folder creation failed: ${error.message}`)
        throw error
    }
}

export {createFolders}

