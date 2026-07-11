import {promises as fs} from 'fs'
import config from '../..//config/config.js'

const DEFAULT = {
    currentDay: 0,
    foldersCreated: false,
    todaysProblems: [],
    filesCreated: false,
    submissionDetected: false,
    pushedToGit: false,
    postedOnLinkedin: false,
    lastUpdate: null
}

// function to read the current state

async function readState(){
    try{
        const raw = await fs.readFile(config.state.path, 'utf-8');
        const processed = JSON.parse(raw);
        return {...DEFAULT, ...processed}
    }
    catch{
        return DEFAULT;
    }
}

// function to make changes to the state

async function writeState(updates){
    const curr = await readState();
    const newState = {
        ...current,
        ...updates,
        lastUpdated: new Date().toISOString(),
    };
    await fs.writeFile(config.state.path, JSON.stringify(newState, null, 2));
    return newState;
}

// function to reset the state

async function resetDaily(newDay){
    return writeState({
        currentDay: newDay,
        foldersCreated: false,
        todaysProblems: [],
        filesCreated: false,
        submissionDetected: false,
        pushedToGit: false,
        postedOnLinkedin: false
    })
}

export {readState, writeState, resetDaily}