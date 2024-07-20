// Path to pictures required in the game
export const relPicPath = `./Media/`

// Add start phrase here to begin the game
export const startPhrase = `meow`;

// Add code here to allow people to create games. Once a game is created using a code, remove it from the list.
export const validGameCodes = ['gamecode1', 'gamecode2', 'gamecode3']; 

// Replace with appropriate credentials to access mysql
export const mysqlCreds = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    charset: 'utf8mb4',
};

export const databaseName = 'telegram_bot_db';
