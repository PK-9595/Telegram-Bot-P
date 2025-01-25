# Telegram-Based Outdoor Adventure Puzzle Game

This project aims to create an interactive Telegram-based outdoor adventure game where players are guided through local attractions, solving puzzles to reach the next location while learning about local history and lore. The game can be played individually or in groups but requires a server for hosting.

---

## Steps to Set Up the Project

### 1. Clone the Repository
Download or clone this repository onto the server used to host the game by running:

```bash
git clone git@github.com:PK-9595/Telegram-Bot-P.git
```

### 2. Install Dependencies
Navigate to the project directory and install/update the required dependencies listed in `package.json`:
```bash
npm install && npm update
```

### 3. Install MySQL
Install MySQL on your system:
- Linux (Ubuntu/Debian):
  ```bash
  sudo apt install mysql-server
  ```
- Windows (Chocolatey):
  ```bash
  choco install mysql
  ```

### 4. Start MySQL Service
Ensure MySQL is running by executing:
- Linux
  ```bash
  sudo systemctl start mysql
  ```
- Windows:
  Go to the Task Manager > `Services` > `MySQL80` > Right Click and select `Start`

### 5. Create a MySQL Root Account
Set up your MySQL root account by following MySQL's secure installation prompts or manual user creation.

### 6. Create a Telegram Bot
Through the telegram interface, create a bot

### 7. Edit `.env` file
Update the telegram bot token gained during step 7 and the MySQL account password in the `.env` file accordingly.

### 8. Configure Game (OPTIONAL)
Certain fields in the `userInput.js` file can be updated:
- `startPhrase` contains the phrase to enter to start the game. When this phrase is said to the bot, you will enter the game setup.
- `validGameCodes` contains one or more game codes. Provide any of these codes to the bot to create a game.

### 9. Start Operating the Bot
Start the bot by running the following command in the terminal from the project directory:
```bash
node telegram-bot.js
```
The machine you run this command on needs to stay powered on and connected to the internet throughout the game, as it is used to operate the Telegram Bot.

<br><br><br>

## Things To Note:
- Ensure the `node_modules` directory is listed in the .gitignore file, as it contains large files and should not be tracked in the repository.
- Verify that your machine is using IPv4 for the connection instead of IPv6 to avoid connectivity issues.
- This bot uses polling; Users sends message to the telegram server, and the telegram bot running on the local machine regularly asks the telegram server if it has any messages for it.
- If there is an issue accessing the mysql server from the client, using the follow SQL command might help:
  ```sql
  ALTER USER 'yourUsername'@'localhost' IDENTIFIED WITH mysql_native_password BY 'yourPassword'; FLUSH PRIVILEGES;
    ```




### Bot Name: Void Deck Cat (Hidden SG - Beta)
### Bot Username: void_deck_cat_bot
