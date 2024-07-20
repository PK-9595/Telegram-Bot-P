import mysql from 'mysql';
import {mysqlCreds, databaseName, validGameCodes} from './userInput.js';

//------------------------------------------------------------------------------------------------
// Relational database initialization and setting up the connection

export const mysqlConnection = mysql.createConnection(mysqlCreds); // Create connection object/parameters, does not connect.

mysqlConnection.connect(err => { // Connect to mysql server, argument is callback function
    if (err) { // Callback function called with error object as argument if there is an error; else called without argument
        return console.error('error: ' + err.message);
    }
  
    console.log('Connected to the MySQL server.');
});

export function sqlQueryPromise(queryString){ // Returns a promise to control sequential asynchronous behaviour
    return new Promise(function(resolve, reject){
        mysqlConnection.query(queryString, function(error, results){
            if (error){
                reject(error);
            }
            else {
                resolve(results); //console.log(results)
            }
        })
    })
}

async function databaseInitialization(){
    try{
        await sqlQueryPromise(`DROP database IF EXISTS ${databaseName};`);
        await sqlQueryPromise(`CREATE database IF NOT EXISTS ${databaseName};`);
        await sqlQueryPromise(`USE ${databaseName};`);
        await sqlQueryPromise(`CREATE TABLE gamecodes(
            creationCode VARCHAR(255) NOT NULL,
            PRIMARY KEY (creationCode)
            );`
        );
        await sqlQueryPromise(`CREATE TABLE games(
            gameId VARCHAR(255) NOT NULL,
            creationCode VARCHAR(255) NOT NULL,
            joinToken VARCHAR(255) NOT NULL UNIQUE,
            hostChatId INT NOT NULL UNIQUE,
            PRIMARY KEY (gameId)
            );`
        );
        await sqlQueryPromise(`CREATE TABLE participants(
            participantChatId INT NOT NULL,
            chatUsername VARCHAR(255) NOT NULL,
            gameUsername VARCHAR(255),
            gameStage DOUBLE NOT NULL,
            gameId VARCHAR(255),
            PRIMARY KEY (participantChatId),
            FOREIGN KEY (gameId) REFERENCES games(gameId) ON DELETE CASCADE ON UPDATE CASCADE
            );`
        );

        for (let gamecode of validGameCodes){
            await sqlQueryPromise(`INSERT INTO gamecodes (creationCode) VALUES ('${gamecode}');`) // Add creation code to allow users to create a game
        }

        const startGameCodes = await sqlQueryPromise(`SELECT * FROM gamecodes;`); 
        console.log('Available Game Codes: ', startGameCodes.map(x => String(Object.values(x)[0]))) // Log creation code available
    }
    catch (err) {
        console.log('error: ' + console.dir(err));
    }
}

databaseInitialization()

//------------------------------------------------------------------------------------------------
// Event handler to terminate connection upon receiving SIGINT

process.on('SIGINT', () => {
    mysqlConnection.end((err) => {
        if (err) {
            return console.log('error:' + err.message);
        }
        console.log('MySQL connection closed.');
        process.exit(0); // Exit the process after closing the connection
    });
});