//------------------------------------------------------------------------------------------------
// Definition of functions used in the game stages
import { sqlQueryPromise } from "./mysql.js";


// Delay function for synchronously delayed messages
export function delay(s) {
    switch(s){
        case "very short":
            s=2; // 2
            break;
        case "short":
            s=4; // 4
            break;
        case "medium":
            s=8;  // 8
            break;
        case "long":
            s=16; // 16
            break;
        case "very long":
            s=32; // 32
            break;
            
        default:
            break;
    }
    console.log(`Delaying by ${s}s`);
    return new Promise(resolve => setTimeout(resolve, 1000*s));
}

// Tidy the format of a message to send to the user
export function tidyMessage(string){
    console.log("Tidying message to send to user...");
    const tempArr = string.split(`\n`);
    for (let i=0; i<tempArr.length; i++){
        tempArr[i]=tempArr[i].trim();
    }
    return tempArr.join(`\n`);
}

// Get the game stage of a particular participant
export async function getParticipantGameStage(chatId){
    let queryResult = await sqlQueryPromise(`SELECT gameStage FROM participants WHERE participantChatId = ${chatId};`)
    if (!queryResult[0]){ //If no result
        return 0;
    }
    const gameStage = queryResult.map(x => Number(Object.values(x)[0]))
    return gameStage // Returns an integer
}

export async function setParticipantGameStage(chatId, gameStage){
    await sqlQueryPromise(`UPDATE participants SET gameStage = '${gameStage}' WHERE participantChatId = ${chatId};`)
    console.log(`Game stage has been set to ${gameStage} for user with chatId ${chatId};`)
}

export async function setTeamGameStage(chatId, gameStage){
    const chatIdList = await getReadyTeamChatIds(chatId) // Only applied to those that are READY or IN GAME.
    for (let chatId of chatIdList){
        await setParticipantGameStage(chatId, gameStage)
    }
    console.log(`All team members are now in stage ${gameStage}`)
}

export async function addParticipant(msg){
    const participantDetails = await getParticipantFullDetails(msg.chat.id); console.log(participantDetails)
    if (participantDetails.length == 1){ // Participant already exists, no need to add
        console.log("Participant has already been added to the game, ignoring addition request");
        return
    }
    console.log("Adding the participant...")
    await sqlQueryPromise(`INSERT INTO participants (participantChatId, chatUsername, gameStage) VALUES ('${msg.chat.id}', '${msg.chat.username}', '0');`)
    return;
}

// Generates a random integer between min (inclusive) and max (inclusive)
export function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generates a response when the void deck cat ignores you.
export function catIgnoreResponse(){
    const catIgnoreResponseList = [
        '(The Void Deck Cat raises its head, blinks slowly at you, and then comfortably curls back into a tight ball, resuming its nap.)',
        '(For a moment, the Void Deck Cat fixes its gaze on you, yawns widely, showing off its sharp teeth, and then nonchalantly turns away to watch a bird in the distance.)',
        '(The cat stretches out lazily, extending its claws before leisurely walking off to a sunny spot, leaving your words floating unanswered in the air.)',
        '(With a flick of its tail, the Void Deck Cat seems to acknowledge your presence but chooses to focus on meticulously cleaning its paws instead.)',
        "(You notice the cat's ears twitch at the sound of your message, but it merely shifts its position slightly, clearly prioritizing comfort.)",
        "(The Void Deck Cat's whiskers quiver, as it continues staring off into space, lost in its own world.)",
        "(After hearing your message, the cat simply blinks at you, then redirects its attention to a seemingly fascinating spot on the wall.)",
        "(The cat pauses mid-stretch, giving you a brief glance, before sauntering off, leaving your words hanging.)",
        "(In response, the Void Deck Cat simply sits, its gaze penetrating past you as if you were transparent, before it starts chasing its own tail, unbothered.)",
        "(The cat, hearing your voice, briefly entertains the thought of approaching but then flops down, deciding that lying on the cool floor is of paramount importance.)",
        "(The cat, woken up from its sleep, raises its head, then lets out a small fart before comfortably resting its head on the floor again, its face full of satisfaction.)",
        "Meow?",
        "(The Void Deck Cat spits out a furball.)",
        "(The Void Deck Cat licks itself clean.)",
        "ppp... ppp.. pppp... ppurrrrrr",
        "(The Void Deck Cat walks up to you to sniff you, before walking away, showing no interest.)"
    ]

    const listLength = catIgnoreResponseList.length
    return catIgnoreResponseList[getRandomInt(0,listLength-1)]
}

export function catInvalidResponse(){
    const catInvalidResponseList = [
        `🤔 (The cat wonders if you are able to follow instructions)`,
        `Hmmm... That's not quite valid... please try again`,
        `Uh-oh, that doesn't seem acceptable`,
        `I'm a bit confused by that, could you try again please?`,
        `Oops! Looks like you might have mistyped, let's try it again!`,
        `Uhhhh you might want to read the instructions again :)`,
    ]
    const listLength = catInvalidResponseList.length
    return catInvalidResponseList[getRandomInt(0,listLength-1)]
}

export function catIncorrectResponse(){
    const catIncorrectResponseList = [
        `❌ (The cat tilts its head to the side, confused at the nonsense you uttered)`,
        `That's not right!`,
        `❌ (The cat second guesses your intellectual capabilities)`,
        `Hmmm... that's not quite right...`,
        `❌ (The cat looks down on the floor, disappointed at your response)`,
        `Sigh... 😔 (The cat seems disappointed with your answer) ❌`,
        `THAT NOT RIGHT!`,
        `❌ (The cat looks away, embarrassed at your answer)`,
        `Purr-lease try again!`,
        `❌ WRONG! ❌`,
        `🙅‍♂️`,
        `🤦‍♂️`,
        `Oops! That doesn't seem right ... Try again fur-riend!`,
        `Oopsie-daisy! That answer's a bit off. Try again!`,
        `You're not quite there yet... but I'm pawsitive you'll get it soon!`,
        `Nuh-uh, that's not it`,
        `Mmmmmmmissed it by a whisker. Or more.`,
        `nope.`,
        `Even the best of us get it wrong sometimes. Don't worry. Take a deep breath, shake off those whiskers, and give it another shot. I know you've got this in you. Don't give up!`,
        `Every mistake is just a step closer to getting it right. Keep your chin up and your paws steady. You can do it.`,
        `Awww, missed the mark! Remember, even when things seem tough, a little perseverance can make all the difference. Dust yourself off and try again - you might be closer than you think!`,
        `Oh ... that's not the answer. But hey, every great explorer faces challenges. It's how we learn and grow. Take a moment, refocus, and tackle it again.`,
        `Oh dear, that wasn't the right one. But don't let it get you down! Every error is a chance to learn something new :)`,
        `Whoopsie, that answer's a bit off`,
        `Try again.`
    ]
    const listLength = catIncorrectResponseList.length
    return catIncorrectResponseList[getRandomInt(0,listLength-1)]
}

export function catCorrectResponse(){
    const catCorrectResponseList = [
        `Correct! ✅`,
        `That's right! 👍`,
        `Amazing! You solved it quicker than I expected... purrr`,
        `Wow you got it right! Let's keep this momentum going! 🚀`,
        `Fantastic! You answered correctly! I knew you had it in you.`,
        `Yay, you did it! You're unstoppable.`,
        `Amazing job! You're really showing those brain muscles 💪.`,
        `Hooray, you got it right! You continue to surprise me!`,
        `Wow! Unclaw said hoomans were smart! I didn't know they were this smart 🤓. Great job getting it right!`,
        `Spot on! You're on fire! 🔥`,
        `Right! Nicely done. 👏`,
        `Bingo! 🎯 That's the answer!`,
        `You got it! 🥳 Way to go!`,
        `Nailed it! 🛠️ Great job`,
        `Exactly! Well done! 🌟`,
        `Absolutely right! You're crushing it! 💥`,
        `Yes! ✔️ That's correct!`,
        `✅ (Smudge looks at you in admiration and nods his head, indicating your answer is correct)`,
        `✅ (Smudge smiles and nods his head excitedly)`,
        `✅ (Smudge was not expecting you to get it so soon and was caught off guard. Smudge scrambles to find his next cue card)`,
        `Mmmhm! You got it!`,
        `✅ (Smudge is astounded by your intelligence)`,
        `Wow! You're smart! That's the right answer!`,
    ]
    const listLength = catCorrectResponseList.length
    return catCorrectResponseList[getRandomInt(0,listLength-1)]
}

export function isAlphaNumericWithSpaces(str){    
    const regex = /^[a-z0-9\s]+$/i;
    return regex.test(str);
} 

function generateJoinToken(tokenLength){
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = [];
    for (let i = 0; i < tokenLength; i++) {
        result.push(characters.charAt(Math.floor(Math.random() * characters.length)));
    }
    return result.join('');
}

export async function createGame(msg){
    const gameId = msg.chat.id + '.' + msg.chat.username + '.' + msg.date; // Identifier for the game, if needed
    const creationCode = msg.text;
    const joinToken = generateJoinToken(14); // Generates a token for others to join the game
    const hostChatId = msg.chat.id; // Contains the chatId of the host that created the game
    try{
        await sqlQueryPromise(`INSERT INTO games (gameId, creationCode, joinToken, hostChatId) VALUES ('${gameId}', '${creationCode}', '${joinToken}', '${hostChatId}');`)
    }
    catch (e){
        console.log(`Error Raised: ${e.code}`);
        if (e.code == 'ER_DUP_ENTRY'){
            console.log(`SQL duplicate error has occurred... Handling error...`)
            return false;
        }
        throw e;
    }
    console.log(`New game has been created! ${gameId}`);
    await sqlQueryPromise(`DELETE FROM gamecodes WHERE creationCode = '${creationCode}';`)
    console.log(`Creation code '${creationCode}' has been consumed!`)
    return joinToken
}

export async function addToGame(chatId, joinToken){
    const queryResult = await sqlQueryPromise(`SELECT gameId FROM games WHERE joinToken = '${joinToken}';`)
    const gameId = queryResult.map(x => Object.values(x)[0])
    await sqlQueryPromise(`UPDATE participants SET gameId = '${gameId}' WHERE participantChatId = '${chatId}';`)
    console.log(`${chatId} has been added to game: ${gameId}`)
}

export async function removeParticipant(chatId){
    const userDetails = await getParticipantFullDetails(chatId); // Get participant details
    console.log(`Retrieving User Details:`); console.log(userDetails);
    if (userDetails.length == 0){ // Participant has no record in the database table
        console.log(`User is not in the database. Nothing to remove.`)
        return 0
    }
    else{
        const gameId = userDetails[0].gameId;
        if (gameId != null){ // If participant was part of a game
            console.log(`Participant is part of the game ${gameId} `)
            const teamInfo = await getTeamFullDetails(chatId); console.log(teamInfo);
            if (teamInfo.length <= 1){ // If player to remove is the only player in the game
                console.log(`Player is the only participant in the game, removing game ...`)
                await sqlQueryPromise(`DELETE FROM games WHERE gameId = '${gameId}'`)
            }
            else{ // If game still has players left
                console.log(`Other players are still in the game ... The game will not be removed.`)
            }
        }
        await sqlQueryPromise(`DELETE FROM participants WHERE participantChatId = ${chatId}`); // Remove participant from table
        console.log(`Participant ${userDetails[0]['gameUsername']} has been removed`)
        return 1
    }
}

export async function setGameUsername(chatId, gameUsername){
    if (!isAlphaNumericWithSpaces(gameUsername)){ // Input check
        return false
    }
    const queryResult = await sqlQueryPromise(`SELECT chatUsername from participants WHERE gameUsername = '${gameUsername}';`);
    if (queryResult[0]){ // Game Username already exists!
        console.log(`Game username '${gameUsername}' is already used by: ${queryResult[0]['chatUsername']}`)
        return false
    }
    await sqlQueryPromise(`UPDATE participants SET gameUsername = '${gameUsername}' WHERE participantChatId = '${chatId}';`)
    console.log(`${gameUsername} has been set as the game username for participant with chat ID: ${chatId}`);
    return true
}

export async function resetGameUsername(chatId){
    await sqlQueryPromise(`UPDATE participants SET gameUsername = NULL WHERE participantChatId = '${chatId}';`)
    console.log(`Game username has been reset for participant with chat ID: ${chatId}`);
}

export const waitingLobbyMessage = tidyMessage(
    `
    🕒 You are currently in the waiting lobby !
    
    🚪WAITING LOBBY OPTIONS 🚪

    1) Change Username (Enter: 'change') 🔄
    2) Check Team Status (Enter: 'team') 👥
    3) Get Ready To Start The Game (Enter: 'ready') 🎬
    `
);

export async function getParticipantFullDetails(chatId){
    return await sqlQueryPromise(`
    SELECT participantChatId, chatUsername, gameUsername, gameStage,gameId,
        CASE
            WHEN gameUsername IS NULL THEN '[Username Not Selected]'
            ELSE gameUsername
        END AS 'Displayed Username',

        CASE
            WHEN gameStage = 6 THEN 'READY'
            WHEN gameStage > 6 THEN 'IN GAME'
            ELSE 'NOT READY'
        END AS 'Ready Status'
            
    FROM participants WHERE participantChatId = '${chatId}';
    `);
}


export async function getTeamFullDetails(chatId){
    return await sqlQueryPromise(`
        SELECT participantChatId, chatUsername, gameUsername, gameStage, gameId,
            CASE
                WHEN gameUsername IS NULL THEN '[Username Not Selected]'
                ELSE gameUsername
            END AS 'Displayed Username',
            
            CASE
                WHEN gameStage = 6 THEN 'READY'
                WHEN gameStage > 6 THEN 'IN GAME'
                ELSE 'NOT READY'
            END AS 'Ready Status'

        FROM participants WHERE gameId = (SELECT gameId FROM participants WHERE participantChatId = '${chatId}');`
    )
}

export async function getTeamStatusMessage(chatId){
    const queryResult = await getTeamFullDetails(chatId)
    
    // From the result, try to create a nice string to reply
    let replyString = '📊 TEAM STATUS 📊\n'
    let participantNumber = 1; 
    for (let row of queryResult){
        replyString = replyString + '\n' + `${participantNumber}) ${row['Displayed Username']} - ${row['Ready Status']}`
        participantNumber ++;
    }
    return replyString
}

export async function getReadyTeamChatIds(chatId){
    const queryResult = await getTeamFullDetails(chatId)
    const filteredQueryResult = queryResult.filter(x => x['Ready Status'] == 'READY' || x['Ready Status'] == 'IN GAME')
    return filteredQueryResult.map(x => x['participantChatId'])
}

export async function checkGameStatus(chatId){
    const queryResult = await getTeamFullDetails(chatId)
    const statuses = queryResult.map(x => x['Ready Status'])
    if (statuses.includes('IN GAME')){
        console.log(`The game is currently in progress`);
        return 1
    }
    else if (statuses.includes('NOT READY')){
        console.log(`Some players are still not ready`)
        return -1
    }
    else{
        console.log(`The game can now be started`);
        return 0
    }
    
}

export async function getParticipantUsername(chatId){
    const queryResult = await sqlQueryPromise(`SELECT gameUsername FROM participants WHERE participantChatId = '${chatId}';`)
    const username = queryResult[0]['gameUsername'];
    return username
}