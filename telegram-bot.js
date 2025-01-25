// Import modules, this uses Node.js syntax.
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import {relPicPath, startPhrase} from './userInput.js';
import {sqlQueryPromise} from './mysql.js';
import * as gsf from './gameStageFunctions.js';
import path from 'path';
import fs from 'fs';

// Create a bot that uses 'polling' to fetch new updates
export const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });


//--------------------------------------------------------------------------------------------------
// Event listener that should work for all stages. All stages should work with the below.

// Dictionary to hold multiple queues to avoid race conditions/overlapping async operations for a particular queue
// Each entry in the dictionary should have a key (chat or gameID), followed by a 2D array [processingStatus, [message1, message2 ...]]
const messageQueueDict = {};

// Queueing system
bot.on('message', async function (msg) {
    console.log(`\n\n(Bot received message to add to queue) ${msg.chat.id}:${msg.chat.username} - ${msg.text}\n\n`);
    const participantDetails = await gsf.getParticipantFullDetails(msg.chat.id);
    const participantGameId = participantDetails[0]?.gameId;
    if (!participantGameId){ // User is not in a game
        console.log(`User is not in a game, adding message to individual queue`)
        if (!messageQueueDict[msg.chat.id]){
            messageQueueDict[msg.chat.id] = [false, []];
        }
        messageQueueDict[msg.chat.id][1].push(msg);
        console.log(`Updated Queue:\n`, messageQueueDict[msg.chat.id][1], `\n, TRIGGERING QUEUE PROCESSING ... `);
        processQueue(msg.chat.id);
    }
    else{ // User is in a game
        console.log(`User is in a game, adding message to gameId queue: `)
        if (!messageQueueDict[participantGameId]){
            messageQueueDict[participantGameId] = [false, []];
        }
        messageQueueDict[participantGameId][1].push(msg);
        console.log(`Updated Queue:\n`, messageQueueDict[participantGameId][1], `\n, TRIGGERING QUEUE PROCESSING ... `);
        processQueue(participantGameId);
    }
});

async function processQueue(queueId) {
    let messageQueue = messageQueueDict[queueId];

    if (messageQueue[0]){
        console.log(`Queue is already processing. No need for further action.`)
        return;
    } 

    messageQueue[0] = true; // Mark queue status as 'processing'

    while (messageQueue[1].length > 0) {
        const msg = messageQueue[1].shift();
        await handleMessage(msg);
    }

    delete messageQueueDict[queueId];
    console.log(`Queue is now empty, queue deleted`);
}

async function handleMessage (msg){
    console.log(`\n\n(Handling message in queue) ${msg.chat.id}:${msg.chat.username} - ${msg.text}`);

    // Checking for invalid user input (E.g., Stickers)
    if (msg.text == undefined){
        console.log(`Undefined user input detected. Ignoring...`);
        return
    }

    // To allow game quitting.
    if (msg.text.toLowerCase() == 'quit'){
        await gsf.removeParticipant(msg.chat.id);
        await bot.sendMessage(msg.chat.id, "Nya? The cat stares at you for a moment as if trying to recognise you, then promptly walks away.");
        console.log("Quit message sent to user.")
        return
    }

    // For appropriate response based on gamestages
    let gameStage = await gsf.getParticipantGameStage(msg.chat.id);
    console.log(`User is in game stage: ${gameStage}`);

    for (let stageResponse of gameStages[gameStage].stageResponses){
        console.log(`Stage Response to check against: `, stageResponse[0]);
        let literalValues;
        
        if (typeof(stageResponse[0]) === "string"){ // Need to query the SQL database first, should get maximum 1 column of values
            console.log(`String Detected, running SQL query: `, stageResponse[0])
            let queryResult = await sqlQueryPromise(stageResponse[0])
            literalValues = queryResult.map(x => String(Object.values(x)[0])) // Change stage response into a list of strings
            console.log('Stage Response to check against has been changed to: ', literalValues)
        }
        else{
            literalValues = stageResponse[0]
        }

        if (Array.isArray(literalValues)){
            if (literalValues.includes(msg.text.toLowerCase())){ //Checking which logic path to follow
                console.log("Appropriate response found, executing response ...")
                await stageResponse[1](msg) //Execute response for the logic path
                return
            }
        }
        console.log(`No appropriate responses found`)
    }
    console.log(`No valid responses found, resorting to default`)

    await gameStages[gameStage].defaultResponse(msg) //If no logic path selected, execute default response

};


//-----------------------------------------------------------------------------------------------------------
// Functions that require the telegram api module

// Broadcast Message Function To Entire Team
async function teamBroadcast(chatId, message, excludeList=[]){
    const recipientList = await gsf.getReadyTeamChatIds(chatId) // Only applies to those who are READY or IN GAME
    for (let recipient of recipientList){
        if (excludeList.includes(recipient)){
            console.log(`${recipient} excluded from broadcast`);
            continue
        }
        await bot.sendMessage(recipient, `${message}`);
        console.log(`Sending message to ${recipient}`);
    }
}

// Broadcast Message Function To Broadcast a Member's Reply to the Other Teammates
async function teammateBroadcast(chatId, message){
    const senderUsername = await gsf.getParticipantUsername(chatId);
    await teamBroadcast(chatId, `💬 ${senderUsername} said:\n\n${message}`, [chatId]);
}

// Send An Item to a User
async function sendItem(itemType, chatId, relativePath, message){
    try{
        const absolutePath = path.resolve(relativePath); // Check if file exists
        if (fs.existsSync(absolutePath) == false){
            console.error(`File does not exist at path: ${absolutePath}`);
            return;
        }

        const readStream = fs.createReadStream(absolutePath);
        const itemOptions = {
            caption: message,
            // filename: absolutePath,
            // contentType: 'image/png',
        }

        if (message){
            itemOptions.caption = `<i>${message}</i>`;
            itemOptions.parse_mode = 'HTML';
        }

        switch (itemType){
            case 'photo':
                await bot.sendPhoto(chatId, readStream, itemOptions);
                break;

            case 'sticker':
                await bot.sendSticker(chatId, readStream, itemOptions);
                break;

            case 'document':
                await bot.sendDocument(chatId, readStream, itemOptions);
                break;

            default:
                console.error('Unsupported item type:', itemType);
        }
    }
    catch (error){
        console.error('Error sending photo: ', error.response?.body || error.message);
    }
}

// Send A Picture to the Whole Team
// E.g., await teamSendPhoto(msg.chat.id, './Pictures/Void-Deck-Cat.png', 'Void Deck Cat Picture!')
async function teamSendPhoto(chatId, relativePath, message){
    const recipientList = await gsf.getReadyTeamChatIds(chatId) // Only applies to those who are READY or IN GAME
    for (let recipient of recipientList){
        console.log(`Sending photo ${relativePath} to ${recipient}`);
        await sendItem('photo', recipient, relativePath, message);
    }
}

// Send A Document to the Whole Team
async function teamSendDocument(chatId, relativePath, message){
    const recipientList = await gsf.getReadyTeamChatIds(chatId) // Only applies to those who are READY or IN GAME
    for (let recipient of recipientList){
        console.log(`Sending document ${relativePath} to ${recipient}`);
        await sendItem('document', recipient, relativePath, message);
    }
}

// Send A Sticker to the Whole Team
async function teamSendSticker(chatId, relativePath, message){
    const recipientList = await gsf.getReadyTeamChatIds(chatId) // Only applies to those who are READY or IN GAME
    for (let recipient of recipientList){
        console.log(`Sending sticker ${relativePath} to ${recipient}`);
        await sendItem('sticker', recipient, relativePath, message);
    }
}

//------------------------------------------------------------------------------------------------
// Definition of game stages and responses
//  1 person/chatId can only be involved in 1 game at any point in time

let gameStages = {};

// // Game Stage Template
// gameStages[`Insert game stage number E.g., '1' `]={
//     'stageDescription': `Insert description of the game stage`,
//     'stageResponses': [ // This should be a list of responses/different situations
//         [ //Response 1
//             `Insert a list of strings used to compare with the text from the user, or an sql query string to return a maximum of 1 column`,
//             async function (msg) { // Function for the bot to execute in response with the msg object as the only argument
//                 `Insert code to perform an action when the user has responded in desired manner`
//             }, 
//         ]
//     ],
//     'defaultResponse': (msg)=>{ // Default function for the bot to execute in response with the msg object as the only argument
//         `Insert code to perform an action when the user has responded in any other way`
//     },
// }


gameStages[0]={
    'stageDescription': 'Game not yet created. User is not yet in a game.',
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            [startPhrase], // A list of strings used to compare with the text from the user, or an sql query to return a maximum of 1 column
            async function (msg) { // Function for the bot to execute in response
                await gsf.addParticipant(msg);
                await gsf.setParticipantGameStage(msg.chat.id, 1);
                await bot.sendMessage(msg.chat.id, `(The Void Deck Cat's ears 👂 perk up at the sound of your message 🐱, a sign you've caught its attention. It turns towards you, eyes curious 👀 and tail twitching slightly 🐈.)`);
                await gsf.delay('short');
                await sendItem("sticker", msg.chat.id, `${relPicPath}/Character/Void-Deck-Cat.webp`);
                await gsf.delay("short");
                await bot.sendMessage(msg.chat.id, `(With graceful steps 🐾, it approaches, closing the distance between you. The cat then sits down in front of you, looks at you, and opens its mouth 🗣️ ...)`);
                await gsf.delay("medium");
                bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                    `
                    Ahh ... I see you are one of those chosen to come see Jurong West ...
                    
                    Would you like to host 🏠 a game or join 🤝 one? 
                    
                    (Type 'host' or 'join')
                    `
                ));
                await gsf.delay("short");
            }
        ],
        [  
            ['/start'],
            async function(msg){
                bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                    `
                    (In the distance, you notice a black cat roaming about, unaware of your presence)
                    `
                ));
            }
        ],
    ],
    'defaultResponse': async (msg)=>{ // Function to execute as the default bot response when above responses are not triggered
        const messageString = gsf.catIgnoreResponse();
        bot.sendMessage(msg.chat.id, messageString);
    },
}


gameStages[1]={
    'stageDescription': 'User selecting to host or join a game',
    'stageResponses': [
        [ // Response 1
            ['host'],
            async function (msg) {
                await gsf.setParticipantGameStage(msg.chat.id, 2);
                bot.sendMessage(msg.chat.id, '🔑 Please enter the provided game code: ');
            }
        ],
        [ // Response 2
            ['join'],
            async function (msg){
                await gsf.setParticipantGameStage(msg.chat.id, 3);
                bot.sendMessage(msg.chat.id, '🔑 Please enter the join code for the game: ');
            }
        ]
    ],
    'defaultResponse': (msg)=>{ // Function to execute as the default bot response when above responses are not triggered
        const messageString = gsf.catInvalidResponse()
        bot.sendMessage(msg.chat.id, messageString)
    },
}


gameStages[2]={
    'stageDescription': 'User attempting to host/create a game',
    'stageResponses': [
        [ // Response 1
            'SELECT * FROM gamecodes;',
            async function (msg) {
                const joinToken = await gsf.createGame(msg);
                console.log(`joinToken for the game is ${joinToken}`);
                if (joinToken == false){
                    await bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                        `
                        It seems like another game you have hosted is still active.

                        Please wait for all players to exit that game before attempting to host a new one.
                        `
                    ));
                    return
                }
                await gsf.addToGame(msg.chat.id, joinToken);
                await gsf.setParticipantGameStage(msg.chat.id, 4);
                await bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                    `
                    🎉 Your game code has been consumed, and your game 🎮 has been created!
                    
                    🔑 The join code for your game is:
                    `
                ));
                await bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                    `
                    ${joinToken}
                    `
                ));
                await gsf.delay("short");
                bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                    `
                    ✏️ Please enter your username for the game:

                    (only 🔤, 🔢, and ⬜ are allowed)
                    `
                ));
            }
        ],
    ],
    'defaultResponse': (msg)=>{ // Function to execute as the default bot response when above responses are not triggered
        const messageString = gsf.catInvalidResponse()
        bot.sendMessage(msg.chat.id, messageString)
    },
}


gameStages[3]={
    'stageDescription': 'User attempting to join a game',
    'stageResponses': [
        [ // Response 1
            'SELECT joinToken from games;',
            async function (msg) {
                await gsf.addToGame(msg.chat.id, msg.text)
                await gsf.setParticipantGameStage(msg.chat.id, 4);
                bot.sendMessage(msg.chat.id, `You have successfully joined the game!`)
                await gsf.delay("short");
                bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                    `
                    ✏️ Please enter your username for the game:
                    
                    (only 🔤, 🔢, and ⬜ are allowed)
                    `
                ));
            },
        ],
    ],
    'defaultResponse': (msg)=>{ // Function to execute as the default bot response when above responses are not triggered
        const messageString = gsf.catInvalidResponse()
        bot.sendMessage(msg.chat.id, messageString)
    },
}


gameStages[4]={
    'stageDescription': `Entering Username`,
    'stageResponses': [
        [ //Response 1
            [], // Empty list, never execute this but always use the default response
            function (msg) { // Function for the bot to execute in response
                console.log(`ERROR! Message received: ${msg.text}. This response should never be triggered, this is an error!`)
            }, 
        ]
    ],
    'defaultResponse': async function (msg) {
        const gameUsername = msg.text;
        const successStatus = await gsf.setGameUsername(msg.chat.id, gameUsername);
        if (successStatus == false){
            bot.sendMessage(msg.chat.id, `❌ This username is either invalid or has already been taken, please try another one! ❌`)
        }
        else{
            await gsf.setParticipantGameStage(msg.chat.id, 5)
            bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                `
                ✅ Your username has successfully been set as '${gameUsername}' 🏷️!
                
                ⌛ Entering the waiting lobby ...
                `
            ));
            await gsf.delay("short");
            bot.sendMessage(msg.chat.id, gsf.waitingLobbyMessage);
        }
    },
}


gameStages[5]={
    'stageDescription': `Waiting Lobby`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['change'],
            async function (msg) { // Reset game username
                await gsf.resetGameUsername(msg.chat.id);
                await gsf.setParticipantGameStage(msg.chat.id, 4);
                await gsf.delay("short");
                bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                    `
                    🔄 Your current game username has been reset.
                    
                    ✏️ Please enter the username you would like to use:
                    `
                ));
            }, 
        ],
        [ //Response 2
            ['team'],
            async function (msg) { // Get team status
                const replyString = await gsf.getTeamStatusMessage(msg.chat.id)
                bot.sendMessage(msg.chat.id, replyString)
                await gsf.delay("very short");
                bot.sendMessage(msg.chat.id, gsf.waitingLobbyMessage);
            }, 
        ],
        [ //Response 3
            ['ready'],
            async function (msg) { // Change game stage to 6
                await bot.sendMessage(msg.chat.id, '✅ Your status has been set to ready!')
                if (await gsf.checkGameStatus(msg.chat.id) == 1){
                    await gsf.setParticipantGameStage(msg.chat.id, 6.1);
                    await gsf.delay("very short");
                    bot.sendMessage(msg.chat.id, `The game 🎮 has already started, you will start as a spectator 👀 and join as a participant 👤 when the next clue is given 🔍.`);
                }
                else{
                    await gsf.setParticipantGameStage(msg.chat.id, 6);
                    await gsf.delay("very short");
                    bot.sendMessage(msg.chat.id, gsf.tidyMessage(
                        `
                        🚀 When all team members are ready, enter 'start' to commence the game.

                        📊 Meanwhile, you may use 'team' to check your team's current status.
                        `
                    ));
                }
            }, 
        ],
    ],
    'defaultResponse': (msg)=>{
        const messageString = gsf.catInvalidResponse()
        bot.sendMessage(msg.chat.id, messageString)
    },
}


gameStages[6]={
    'stageDescription': `Player is ready, triggering start/team`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['start'],
            async function (msg) { // Function for the bot to execute in response
                const currentGameStatus = await gsf.checkGameStatus(msg.chat.id)
                if ( currentGameStatus == -1 ){
                    bot.sendMessage(msg.chat.id, `⏳ Kindly wait for everyone on the team to get ready. ⏳`)
                }
                else if (currentGameStatus == 0){
                    const username = await gsf.getParticipantUsername(msg.chat.id);
                    await gsf.setTeamGameStage(msg.chat.id, 7)
                    await teamBroadcast(msg.chat.id, `▶️ ${username} has started the game!`);
                    await gsf.delay("very short");
                    await teamBroadcast(msg.chat.id, '🏁 Game commencing ...');
                    await gsf.delay("very short");
                    await teamBroadcast(msg.chat.id, `🔎👤🔍 Allocating game facilitator ...`)
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        ✅ Facilitator found! 
                        
                        The game will begin shortly! ⌛️
                        `
                    ));
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        Pawsome 😺! It looks like you're ready for the challenge. I'll be your guide 🧭 for today. Let me introduce myself 🙋!
                        `
                    ));
                    await gsf.delay("short");
                    await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Profile.webp`)
                    await gsf.delay("very short");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        I'm the boss's nephew 👦, Void Deck Cat Jr! But you can call me Smudge 😸. I'm here to help my unclaw out since the game's getting bigger and he needs an extra paw 🐾. (Plus, he promised me some kibbles 🥣 in return!)
                        
                        So ... uhm ... 💭
                        `
                    ));
                    await gsf.delay("short");
                    await gsf.delay("very short");
                    await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Card.webp`);
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, `Ahem! 🥸`);
                    await gsf.delay("very short");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        So, you seek the hidden secrets 🔒 of Jurong West, known only to the locals and us cats. Prove your worth by solving 🕵️‍♂️ my clues 🧩, and I shall reveal them to you 🔓.
                        `
                        ));
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        📢 But before we get started there's some impawtant stuff I gotta tell you!
                        `
                        ));
                    await gsf.delay("very short");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        ⚠️ [Disclaimer: 1/3] ⚠️
                        
                        Since this game is still in testing and has not been made public 🌐, there will not be any leaderboards 🏆 and your game will not be timed 🕰️.
                        
                        Instead of rushing, you are encouraged to take your time to fully enjoy the game 🐢. Please feel free to take breaks 🛋️ as you wish.
                        `
                        ));
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        ⚠️ [Disclaimer: 2/3] ⚠️
                        
                        🧪 This game is experimental. Please anticipate changes in style 🎨, difficulty 🚧, and structure 🏗️ as we continually strive to improve your experience.
                        
                        🚫 Hints will not be provided this time, though that should not be an issue since you already have some experience 🥈. 
                        `
                        ));
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        ⚠️ [Disclaimer: 3/3] ⚠️
                        
                        🆓 As this is a beta version of the game offered as a free trial, we ask for your understanding should you encounter any bugs 🐛 or inconveniences. 
                        
                        📉 Please also expect a decrease in historical and cultural richness or accuracy from the original game on WhatsApp 📱.

                        🚪 If you experience any issues, you may enter 'quit' to exit the game before rejoining 🔄.
                        `
                        ));
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        📜 [Rules: 1/1] 📜

                        👨‍🏫 In this game, you will journey through the lands of Jurong West 🗺️, by solving provided clues 🧩 to move from point to point 📍➡️📍. All team members will receive the clues from me at the same time, but only 1 team member is required to send a response at any given time to proceed.
                        
                        To solve 🕵️‍♀️ these clues, you will 🚫NOT🚫 need to enter any individual stores or shops - please refrain from doing so 🙅‍♂️.

                        Finally, stay in public spaces, blend into your environment, and be discreet in your discussions - it's best to avoid unnecessary attention.
                        `
                        ));
                    await gsf.delay("long");
                    await gsf.delay("short");
                    // End of rules and game introduction - Start of clues & lore
                    await teamBroadcast(msg.chat.id, `📚 Alright, ready for a quick crash course on the history of the area? Let's begin!`);
                    await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Teacher.webp`);
                    await gsf.delay("short");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        📅 Back in 1911, Jurong 🦈 was a spot squeezed between Choa Chu Kang and Bukit Timah, right where Bukit Batok 🌴 is today. 
                        
                        What we now call Jurong East used to be known as Pandan 🌿, and Boon Lay? It was called Peng Kang.
                        `
                        ));
                    await gsf.delay("short");
                    await gsf.delay("very short");
                    await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore0-Map.png`, `A 1911 map depicting the historical boundaries of Jurong`);
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage( //
                        `
                        The Jurong we know today was once a swampy, crocodile-infested 🐊 area! Can you believe it? There were mangroves and tropical rainforests all around. It wasn't very populated, and the local Malay and Chinese communities used it mainly for agriculture 🌳 and fishing 🐟. Imagine rubber and gambier plantations, plus prawn ponds 🍤 everywhere! Purr-etty wild, huh?
                        `
                        ));
                    await gsf.delay("short");
                    await gsf.delay("very short");
                    await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore0-Prawns.png`, `Prawn farmers at work in Jurong - 1960.`);
                    await gsf.delay("medium");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        To rapidly industrialize and reduce reliance on entrepot trade 📦, the Singapore government, led by the Economic Development Board (EDB), launched an ambitious plan in the early 1960s to transform Jurong into a major industrial hub 🏭. 
                        
                        The first factories started operations in the early 1960s, and by 1970, Jurong had over 260 factories employing around 32,000 workers 👷‍♂️. 

                        A grid-like #️⃣ layout was used to systematically organize the industrial and residential areas, and connectivity was improved with the opening of an MRT station 🚉. The MRT station was named after Chew Boon Lay, a notable businessman 👨‍💼 with many pepper, gambier, and rubber plantations in the area.
                        `
                        ));
                    await gsf.delay("long");
                    await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore0-Grid.png`, gsf.tidyMessage(
                        `
                        Left: By 1969, Jurong Industrial Estate was home to 181 factories and a 20,000-strong workforce;

                        Right: 1972 street map of Jurong;
                        `
                    ));
                    await gsf.delay("long");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        Alrighty 🙌! Now, head over to the Boon Lay MRT station 🚉 near the customer service center to solve the first clue.
                        `
                        ));
                    await gsf.delay("short");
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        ⌛️ Your first clue will arrive shortly...
                        `
                    ));
                    await gsf.delay("long");
                    await teamSendPhoto(msg.chat.id, `${relPicPath}/Clues/Clue1.png`)
                    await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                        `
                        🔍 [CLUE 1/11:]

                        Between the shapes provided before,
                        invert 🔄 me and I can spin on the floor,

                        when I can twirl, on the face with most circles ⚪,
                        find the biggest single square (it's in purple 🟪).
                        
                        For this item, both round and square,
                        where does it lead? Tell me 🗣️, then go there 🚶‍♂️.
                        `
                        ));
                }
            }, 
        ],
        [ //Response 2
            ['team'],
            async function (msg) { // Get team status
                const replyString = await gsf.getTeamStatusMessage(msg.chat.id);
                await gsf.delay("very short");
                bot.sendMessage(msg.chat.id, replyString)
            }, 
        ],
    ],
    'defaultResponse': (msg)=>{
        const messageString = gsf.catInvalidResponse()
        bot.sendMessage(msg.chat.id, messageString)
    },
}


gameStages[6.1]={
    'stageDescription': `User waiting to participate for the next clue`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            [],
            function (msg) { // Function for the bot to execute in response
                console.log(`ERROR: This response should never be triggered. Message received: ${msg.text}`)
            },
        ]
    ],
    'defaultResponse': (msg)=>{
        bot.sendMessage(msg.chat.id, `🕰️ Please patiently wait until the next clue`)
    },
}


gameStages[7]={
    'stageDescription': `Clue 1 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['boon lay bus interchange', 'boon lay bus interchange exit c', 'bus interchange'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 8);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("very short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage( // Information about the bus interchange
                    `
                    The Boon Lay bus interchange 🚌 began operations on 1 July 1990 📅 and played a crucial role in supporting the growing Jurong West extension and Tuas Industrial area. It absorbed services from the former Jurong Bus Interchange which opened in 1978 and expanded to accommodate increasing demand 📈 as the surrounding industrial and residential areas 🏭🏘️ developed. 
                    
                    The bus interchange was later demolished 🔨 in June 2006 to make way for a new facility while the new bus interchange you see today was opened in 27 December 2009, with a temporary bus interchange during the transition period ↔️. 
                    `
                    ));
                await gsf.delay("long");
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Being fully integrated with the Jurong Point mall 🛍️, it became the fourth air-conditioned ❄️ bus interchange and the first along the East West line 🟢. Since then, it continues to improve, with ongoing upgrades to include more inclusive amenities ♿ and improved air conditioning systems announced in 2022. 
                    
                    Relocation of bus services also occur occasionally to avoid overcrowding 👨‍👩‍👧‍👦, for example, in 2015, some bus services were rerouted 🔀 with the opening of Joo Koon Bus Interchange. 
                    `
                ));
                await gsf.delay("long");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore1.png`, gsf.tidyMessage(
                    `
                    Left: The old bus interchange;

                    Middle: The temporary bus interchange (18 June 2006 - 26 December 2009);

                    Right: The existing bus interchange;
                    `
                ));
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Nya... Here's a tidbit - it's a bit of a serious story. In 2017, a 17-year-old made a bomb 💣 threat at Boon Lay Bus Interchange. Claiming to be a terrorist, he made death threats ☠️ as well as racist remarks, causing quite a fur-right 😨. He fled the scene ...
                    
                    ... but was caught two days later at Jurong Point. 17-year-old Teo was diagnosed with autism 🩺 and was charged with causing a public nuisance. This incident highlighted the necessity for robust defensive protocols 🛡️ and quick response mechanisms ⚡, reminding Singapore to remain vigilant.
                    `
                ));
                await gsf.delay("long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage( // Need to change this to NTWU canteen
                    `
                    🔍 [CLUE 2/11]:

                    Not a word, but initials of others.
                    There lies a track in a circle of two colors.
                    Without this, some may have an unmet need.
                    Using not all here, just those that lead.

                    What is this that can be found in the bus interchange?
                    `
                    ));
            }
        ],
        [
            ['frontier community club', 'frontier community club exit c'],
            async function (msg){
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, `😂 You silly goose! You've already looked up and down, what's left is to look upside down.`);
            }
        ],
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[8]={
    'stageDescription': `Clue 2 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['ntwu', 'ntwu canteen'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 9);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("very short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    With the rapid industrialization and urbanization 🌆 of Jurong West and other areas in Singapore, the National Transport Workers' Union (NTWU) was established in the early 20th century to protect transport workers' rights and interests. This union tackled issues like fair wages 💰, safe working conditions 🦺, and reasonable working hours 🕒 for those in railways, buses, and freight services 🚂🚌🚛.

                    The NTWU canteen 🍽️ you see at the Boon Lay bus interchange is one example of their efforts to improve the welfare of transport operators. It provides accessible, healthy, and affordable food 🥗 to address concerns bus drivers had about not having enough time to eat or use the toilet 🚻. 
                    
                    Today, NTWU operates ✨40✨ canteens at various bus interchanges and depots all over the island.
                    `
                ));
                await gsf.delay("long");
                await gsf.delay("medium");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore2-Formation.png`, `Formation of the NTWU on 7 July 1981`);
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Back in 1984, SBS introduced the One Man Operation Ticketing System (OTS), which led to 3,000 bus conductors losing their jobs ✂️. 
                    
                    Instead of putting up a fight 🥊, NTWU supported the change for higher productivity, knowing it would be better in the long run for Singapore and its workers. They worked with management to retrain or redeploy over 1,000 conductors within the company, while the rest were retrenched in four batches with a fair compensation package 💼. Purr-tty impressive, right 😌?
                    `
                ));
                await gsf.delay("long");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore2-Retrenchment.png`, `1984 - SBS mass retrenchment`);
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 3/11]:

                    Go near where a particular fruit abounds,
                    one named after its color and is round.
                    Descend the stairs 🪜 that move on their own.
                    Into an alley, quiet 🤫 as stone.

                    Step back through time's ⏰ flowing sand,
                    to the earliest where things began.
                    Where you find rest, no need to stand,
                    How many dragons 🐉 reside in your hand?
                    `
                    ));
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[9]={
    'stageDescription': `Clue 3 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['4', 'four'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 10);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    The development of Jurong West can be summed up in 4 phases: 
                    1) 🏞 Pre-Industrial Era
                    2) 🏭 Industrialization Era
                    3) 🏘 Residential Development Era
                    4) 🏙 Modern Era

                    The art scene in Singapore started around the industrialization era but only really started to blossom 🌸 during the residential development era. At first, art initiatives were aimed at economic growth and enhancing the country's international image 🌍, later on, the focus shifted to fostering national identity 🇸🇬 and social cohesion. The National Arts Council (NAC) is one such initiator that has supported street artists 🎨🧑‍🎨 and legalized urban art spaces. Programs like Arts In Your Neighbourhood bring art into community areas, making it accessible to everyone and turning everyday environments into vibrant, thought-provoking spaces.

                    Jurong West is a purr-fect example of this! Incorporating art into the area is part of the effort to revitalize it, moving away from its history as a blue-collar 👨‍🏭 area. Did you know that art pieces can be found not only in the alley you're in right now but also in many other places in Jurong West? It's definitely worth exploring to discover the vibrant 🌟 art scene all around! Here are some to get you started and whet your appetite for art 🖼️!
                    `
                ));
                await gsf.delay("very long");
                await gsf.delay("short");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore3-AdNate.png`, gsf.tidyMessage(
                    `
                    Left: Hands by AdNate for 50 Bridges (2015);

                    Right: Portait of a local girl by AdNate for 50 Bridges (2015);
                    `
                ));
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore3-VoidDeck.png`, gsf.tidyMessage(
                    `
                    Left: Artwork at Blk 749 and directly opposite Gek Poh Shopping Center and the AdNate mural; 

                    Right: Different artworks on each pillar of this portion of the void deck of Blk 750;
                    `
                ));
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore3-CleanPod.png`, `CleanPod in Jurong Central Park`);
                await gsf.delay(`medium`);
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("very long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 4/11]:

                    Travelling down those stairs once more,
                    turn right to a 'wooden maze' on the wall.

                    Through subtraction ➖, addition ➕, and some rearrangement 🔄,
                    From the picture, derive the solution.

                    Revealed in the answer, clear as can be,
                    what's the next store you'll go to see?
                    `
                    ));
                await gsf.delay("short");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Clues/Clue4.png`)
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[10]={
    'stageDescription': `Clue 4 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['selffix', 'self fix', 'self-fix', 'selffixdiy', 'selffix diy', 'self-fix diy', 'self-fixdiy', 'self fix diy'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 11);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Even though Jurong West has moved past its industrialization era, hardware shops like Selffix 🛠️ still remind us of its industrial roots 🌱. While these stores might seem rare among the many retail 🛒 outlets in Jurong Point, you can find more hardware-related shops 🔧 in nearby areas like Pioneer Point, Jurong Spring, and Taman Jurong. If you expand your search a bit, places like Tradehub 21 🏢 and Shun Li Industrial Park 🏭 provide even more options!

                    Selffix is known for its purr-sonal touch, with a customer-centric approach that makes them feel more like friendly neighbors 😊 than typical salespeople. Customers love the staff for their personalized advice that goes beyond the sales of products. Selffix even offers workshops, training, and an informative blog full of DIY tips and advice 📚.
                    `
                    ));
                await gsf.delay("long");
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    While you're waiting for your next clue, turn right (while) facing Kohong Lifestyle then walk straight. When you reach a famous store, go right again and you'll soon reach SELFFIX.
                    `
                ));
                await gsf.delay("very short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 5/11]:

                    ➡️⬅️⬆️⬇️⤴️⤵️
                    
                    To find the next place on your quest,
                    three distinct arrows from above I suggest.

                    Form the provided key 🔑 from SELFFIX's door 🚪,
                    To uncover the path 🛤️ you're searching for.

                    Consider only squares brown and white,
                    rotate or move - up, down, left, and right.

                    Send the arrows, one, two, three,
                    in the right order, for me to see 👀.
                    `
                    ));
                await gsf.delay("short");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Clues/Clue5.png`)
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[11]={
    'stageDescription': `Clue 5 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['⤴️⬆️➡️', 'override'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 12);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, `Did you know tha ... `);
                await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Lore5Card.webp`);
                await gsf.delay("very short");
                await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Lore5LostCard.webp`);
                await gsf.delay("very short");
                await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Clue6Card.webp`);
                await gsf.delay("very short");
                await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Eyes.webp`);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 6/11]:

                    Heed the directions that you've found ⤴️⬆️➡️,
                    your next spot lies just around 📍.

                    In the aisle of lanterns 🏮, glowing bright ✨,
                    Perform the steps, follow tight.
                    
                    Find someone posed like thee,
                    Then tell me, What is he 👤?
                    `
                    ));
                await gsf.delay("very short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🦶 [Steps]:

                    1. With your left hand, grasp your belt buckle as if you were wearing one.
                    2. Position your left leg 🦵 directly behind the right, making sure both legs touch.
                    3. Bend both knees slightly and tiptoe 🦶.
                    4. Gently curl your right palm ✋.
                    5. Tilt your head backwards slightly to look upwards.
                    6. Raise your right arm 💪, pressing your forearm against your cheek, allowing your elbow to bend.
                    7. Prone while keeping the exact same position.
                    `
                    ));
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[12]={
    'stageDescription': `Clue 6 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['ninja', 'shinobi', 'a ninja', 'a shinobi'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 13);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("very short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    The Japanese street (Shokutsu 10) in Jurong Point seamlessly blends the charm of old Edo-style 🏯 Tokyo with modern Osaka, offering a unique mix of contemporary and feudal elements (like ninjas 🥷) to create an atmosphere that brings the past to life while celebrating 🎉 the present.
                    `
                    ));
                await gsf.delay('medium');
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    My unclaw 👨‍🦳 said that sometimes when he sees the imagery of the ninja moving away from the shop 'Gokoku', it reminds him of the Japanese occupation, saying that though the name Gokoku '五(go)穀(koku)' means 'five grains' to symbolize nourishment 🌾, it also sounds like '護(go)国(koku)', which means 'defend the nation' 🛡️. 
                    
                    It's likely coincidental, but both meanings combined with the ninja put together a scene of the japanese leaving to protect/provide nourishment for the country, just like Japan's strategic defensive efforts during the early 20th century for resource security and to buffer against potential Western threats ⚔️🌏 ... well, that's from their perspective at least.
                    `
                ));
                await gsf.delay('long');
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    You think that's a bit of a far stretch 🤔? Me too! ... Sadly, it seems like the cat-astrophe has left deep scars on its survivors and left marks in many affected areas, including Boon Lay. For example, after the tragic death ☠️ of 39 villagers during the Japanese 🇯🇵 occupation in 1942, eight villagers founded the Tua Pek Kong temple in Tuas to seek spiritual solace. Initially an attap hut 🛖, this temple moved to a brick building 🧱 in 1954, and then to 118 Boon Lay Drive in 1987 to serve the resettled 🚚 villagers due to Tuas' industrial redevelopment in the 1960s and 1970s.
                    `
                ));
                await gsf.delay("long");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore6.png`, `Tua Pek Kong Temple today`);
                await gsf.delay('long');
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    The next clue doesn't need you to be at any specific spot 📍, but don't let that fool you! 
                    It's going to challenge your brain 🧠 more than your feet 👣, so you might as well find a place to sit 🪑.
                    `
                    ));
                // Send picture related to the next clue
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("very long");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Clues/Clue7.png`)
                await gsf.delay("very short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 7/11]:

                    Using the picture above, read the following statements carefully and answer the trailing question:

                    1. The owner of the cat 🐱 lives in neither the tallest or shortest building
                    2. The eurasian lives in a building with circular windows ⚪
                    3. The malay and chinese lives in a yellow building 🟡🟨
                    4. The chinese has a pet dog 🐶
                    5. The indian lives 1 block away from the malay
                    6. The owner of the cat 🐱 lives 2 blocks away from the dog 🐶 (1 block in between)
                    7. The peranakan lives in a building with rectangular windows ▭
                    8. The owner of a hamster 🐹 lives in between 2 buildings of different window shapes
                    9. The owner of the rabbit 🐰 does not stay in the shortest house
                    10. The owner of the cat 🐱 stays next to the owner of the rabbit 🐰

                    Which color building did the owner of the snake 🐍 live in?
                    `
                    ));
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[13]={
    'stageDescription': `Clue 7 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['green'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 14);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Jurong West, once full of snakes 🐍 due to its past as a green rubber plantation area, still hosts a variety of these slithery creatures. Singapore has around 67 species of snakes, and common ones in this region include the Banded Krait, Banded Malayan Coral Snake, Black Spitting Cobra, King Cobra, Oriental Whip Snake, and Reticulated Python. Though dangerous, these snakes help keep the population of small mammals and pests 🐀 in check. 
                    
                    If encountered, residents should steer clear and leave them undisturbed; while killing or harming the snake might come intuitively, it could cause you to face legal consequences ⚖️ for violating The Wildlife Act or other related regulations 📜. What you should do instead is to contact 📞 local wildlife authorities so they may safely relocate the snake.
                    `
                ));
                await gsf.delay("very long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    💡 Did you also know that the picture used in the previous clue is actually a mural 🎨 by Boon Lay Secondary School found in one of the HDB blocks near Jurong Point? It's a great example of art 🖼️ in community spaces that I mentioned before!
                    `
                ));
                await gsf.delay("short");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore7.png`, `Art in HDB communal spaces near Jurong Point`);
                await gsf.delay("medium")
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("very long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 8/11]:

                    Go back to where steel snakes 🚇 lie,
                    then across the road through a path 🛤️ up high.
                    Take a left, descend the slope,
                    enter in, to nature's abode.

                    This place is one that's lush and green 🌳,
                    where serpents slither, sometimes seen.
                    An open space with no walls to confine,
                    it's near where you shop and full of sunshine 🌞.

                    Right when you enter, you soon shall see 👀
                    a warning sign ⚠️ waiting for thee.
                    Use it to solve, and thus divine,
                    snakes 🐍 & what else can you find? 
                    `
                ));
                await gsf.delay(180);
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Clues/Clue8.png`)
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[14]={
    'stageDescription': `Clue 8 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['ladders'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 15);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Near where you stand is Jurong Central Park's life-sized Snakes and Ladders playground 🛝. This game was actually inspired by the ancient Indian game "Moksha Patam" that was invented in the 13th century by poet-saint Gyandev 📜. It was meant to teach moral lessons through Hindu philosophy - the ladders represent virtues 😇 like generosity and faith, while the snakes stand for vices 😈 such as disobedience and greed. The goal is to reach the top, symbolizing spiritual enlightenment 💡 or Moksha. 
                    
                    In the 19th century the game was brought to England and eventually evolved into the modern Snakes and Ladders, focusing more on fun (🎉) than moral lessons. 
                    `
                ));
                await gsf.delay("long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Though some parts of the life-sized playground have aged over time, feel free to let your inner kitten 🐱 out and embrace the spirit of fun and adventure as you explore this nostalgic blend of history and play! Can you find the dice used to play this life-sized game?
                    `
                ));
                await gsf.delay("short");
                await gsf.delay("very short");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore8.png`, gsf.tidyMessage(
                    `
                    Left: Life-sized Snakes & Ladders game;

                    Right: Dice tower;
                    `
                ));
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 9/11]:

                    With the provided cryptic map 🗺️,
                    Solve 🕵️‍♂️ the cipher to get your question unwrapped.

                    Give me the answer to that question,
                    and I will give you your next direction 🧭.
                    `
                ));
                await gsf.delay("short");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Clues/Clue9.png`, `Somewhere in Jurong Central Park ...`)
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[15]={
    'stageDescription': `Clue 9 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['papaya', 'golden papaya', 'gold papaya'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 16);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Before its development in the 1960s, Jurong West was a landscape of mangrove swamps, forests 🌳, and low hills ⛰️ with a few settlements. In these kampongs, villagers commonly grew lime 🍋 and golden papaya 🍈, perfect for the tropical climate. Golden papayas, known for their sweet flavor and vibrant yellow color, were a common sight and valued for their nutritional benefits. Lime trees were also popular, adding a zesty kick to many traditional dishes 🍲. These fruits were a big part of the kampong lifestyle, which has since given way to industrial and residential developments.
                    `
                ));
                await gsf.delay("long");
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    If you want to relive the kampong spirit, you can still visit Kampong Lorong Buangkok 🏡, the last surviving traditional village on mainland Singapore ... from what I last heard ...
                    But hurry 🏃‍♂️! There are ongoing concerns about future redevelopment plans that might affect its existence!
                    `
                ));
                await gsf.delay("medium");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore9-Kampong.png`, `Kampongs with open spaces for growing food and livestock`);
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Lore/Lore9-LastKampong.png`, `Kampong Lorong Buangkok - Singapore's Last Kampong`);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 10/11 PART 1]:

                    Using the same cipher key 🔑,
                    find the next point where you'll be 📍.

                    A nearby place, much like this one,
                    only bigger, and more fun.

                    It's quite a trek 🥾, a bit away,
                    so hop on a bike 🚴‍♂️, I would say.

                    It'll take a while ⏰, so here's the deal,
                    the next part of the clue I'll later reveal.


                    4 15 47 47 12 30 33 12 5 9 4 28 47 15 49 33 49 30 10 30
                    `
                ));
                await gsf.delay(600);
                // Send musical chart
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 10/11 PART 2]:

                    It's been some time, and I hope you're here,
                    to the point where many paths appear.

                    Follow the one to gardens serene 🌺,
                    with shiny leaves 🍂 that are not green,

                    Where the leaves diverge, make a right
                    through a short gate 🚪, open or shut tight.

                    Onwards with the animals on the ground,
                    past the spiral, rightward bound.

                    Patterns in nature you will see,
                    a swing, then piano keys 🎹, eventually.

                    Using the longest 3 vertical poles 📏 and the chart,
                    Find out what a special tree 🌳 here is made of, hint: it's hard.
                    `
                ));
                await gsf.delay("short");
                await teamSendPhoto(msg.chat.id, `${relPicPath}/Clues/Clue10.png`)
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[16]={
    'stageDescription': `Clue 10 Answer Received`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            ['metal'],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 16.5);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.catCorrectResponse());
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Pawsome 🐾 job getting the clue right and making it to the Therapeutic Gardens within Jurong Lake Gardens! This beautiful spot, Singapore's third 3️⃣ national garden, has transformed from a swamp into a stunning landscape featuring a lake. The Therapeutic 🧘‍♀️ Gardens offer a calming environment for both the young 👶 and the elderly 👴, promoting relaxation and well-being through familiar plants 🌼 and sensory elements 👁️👂👃. The garden has special sections for adults and children, including sensory zones, a glow-in-the-dark labyrinth, and a butterfly maze 🦋.

                    Jurong Lake Gardens is home to a wide variety of plants and animals, but there's one metal 🔩 structure that really stands out. Continue with the next clue to find out what it is!
                    `
                ));
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    ⌛️ Your next clue will arrive shortly...
                    `
                ));
                await gsf.delay("very long");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [CLUE 11/11 Part 1/2]:

                    You are reaching the end, alas,
                    will you fail ❌ or will you pass ✔️?

                    Walk to the famous metal lone tree,
                    if you don't know where, it's attraction 🌟 twenty.

                    More rugged terrain, a little remote, 
                    but once you reach, a sight 👀 to behold.

                    When you do, tell me "I'm here",
                    I'll give you your final clue,
                    as our time to part 👋 draws near.
                    `
                ));
            }, 
        ],
        // Response 2
        [
            ['matle', 'ma tle', 'ma-tle'],
            async function (msg){
                await teammateBroadcast(msg.chat.id, msg.text);
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Almost there! You're so close! But only phonetically 👂 correct!
                    `
                ));
            },
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catIncorrectResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[16.5]={
    'stageDescription': `Clue 11 Answer Received, Now At Fake Stage`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            [`i'm here`, `im here`, `i’m here`, `i′m here`, `i’m here`, `i‘m here`],
            async function (msg) { // Function for the bot to execute in response
                // Broadcasting attempt to other teammates
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 17);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🔍 [FINAL CLUE(?)]:

                    I hope you are still unaware,
                    not caught on yet to my little snare 🪤.

                    And that you're at the intended place,
                    else I'd be the fool, and it'll be such a waste 🤦‍♂️.

                    But I'll continue on, assuming you're there,
                    With this rhyme I took time to prepare:

                    Dear player, you have been so sweet 🍬,
                    dancing to my tunes 🎶, it's been a treat.

                    Because there're no more clues! This is the end 🚫,
                    with no more cue cards left in my hand.
                    
                    So here you stand, in the sunlight ☀️,
                    fooled you were, but it's alright.

                    Out of entertainment, I led you here,
                    all in good spirits 😊, no need to fear.

                    I just have got some time to spare,
                    so my time, with you, I'd like to share.

                    You've been quite fun, my source of cheer,
                    and you have become someone dear.

                    So for now at this place so fine,
                    I wish to spend with you, more time 🕰️.
                    `
                ));
                await gsf.delay("very long");
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    In other words ... ... I tricked you hehe 🤡
                    `
                ));
                await gsf.delay("very short");
                await teamBroadcast(msg.chat.id, `... but just so I could show you this beautiful tree! :)`);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    This Lone Tree isn't a natural tree (if you haven't realized that yet, go take a closer look! 🕵️‍♂️). It's actually a sculpture made from recycled iron reinforcement bars ♻️⛓️ salvaged from old park pathways in the area.

                    This artistic installation was created through a collaboration between the National Parks Board (NParks) and landscape consultants Ramboll Studio Dreiseitl 👨‍🎨. It was designed to evoke the industrial origins of Jurong while blending seamlessly with the natural surroundings, symbolizing the connection 🔗 between the old and the new, and the harmony between human-made structures 🏙️ and nature 🌱.

                    The Lone Tree's design and materials emphasize sustainability and the creative reuse of materials. By using recycled elements, the sculpture highlights the importance of environmental consciousness and resourcefulness, showing that beauty 🌺 can be crafted from what might otherwise be considered waste 🗑️.
                    `
                ));
                await gsf.delay("very long");
                await teamBroadcast(msg.chat.id, `(muttering) ... maybe there's still hope for trash like me ... ... (muttering)`);
                await gsf.delay("very short)");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Oh no! I hope you didn't hear me mumbling to myself! Well... 
                    
                    (Smudge tries to clear his throat)
                    `
                ));
                await gsf.delay("very short");
                await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Cough.webp`);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    🎉🎉🎉 Congratulations on solving all the clues and completing Hidden Singapore: Jurong West! I hope you had a blast exploring and learning about Jurong West with me!
                    `
                ));
                await gsf.delay("medium");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    I guess ... now ...  this is where we part ways 😞 ... So long ...
                    `
                ));
                await gsf.delay("very short");
                await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Sad.webp`)
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    farewell 👋 ...
                    `
                ));
                await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-SadBye.webp`);
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        const messageString = gsf.catInvalidResponse();
        await teamBroadcast(msg.chat.id, messageString);
    },
}


gameStages[17]={
    'stageDescription': `Cat Sentimental Monologue, Cat About To Leave`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            [`come back!`, `come back`],
            async function (msg) { // Function for the bot to execute in response
                await teammateBroadcast(msg.chat.id, msg.text);
                await gsf.setTeamGameStage(msg.chat.id, 18);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    it's time ... to ...
                    `
                ));
                await gsf.delay("short")
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    SEE YOU AGAIN! 👋😊
                    `
                ));
                await teamSendSticker(msg.chat.id, `${relPicPath}/Character/Smudge-Face.webp`);
                await gsf.delay("short");
                await teamBroadcast(msg.chat.id, gsf.tidyMessage(
                    `
                    Just kidding! I got to go now! Byebye!
                    `
                ));
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        await teammateBroadcast(msg.chat.id, msg.text);
        await gsf.delay("short");
        await teamBroadcast(msg.chat.id, gsf.tidyMessage(
            `
            *Smudge looks back with a sad face, turns back, and continues walking away*
            `
        ));
    },
}


gameStages[18]={
    'stageDescription': `During ending sequence`,
    'stageResponses': [ // This should be a list of responses/different situations
        [ //Response 1
            [],
            function (msg) { // Function for the bot to execute in response
                console.log(`ERROR: This response should never be triggered. Message received: ${msg.text}`);
            }, 
        ]
    ],
    'defaultResponse': async (msg)=>{
        bot.sendMessage(msg.chat.id, `(Your voice echoes. Nobody is here to respond to you.)`)
    },
}