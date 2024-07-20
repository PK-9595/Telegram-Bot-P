### Bot Name: Void Deck Cat (Hidden SG - Beta)
### Bot Username: void_deck_cat_bot

## Application Usage:
  - Run `npm install; npm update` to install and update packages in the package.json file.
  - Download mysql (E.g., `sudo pacman -S mysql`; `choco install mysql`).
  - Ensure mysql is running (E.g., `sudo systemctl start mysql`; use the task manager)
  - Create mysql root account
  - Update `.env` file with sensitive details (bot token, mysql password, etc.)
  - Update `userInput.js` file with game details (acceptable gamecodes, startPhrase, etc.)
  - Run `node telegram-bot.js` in the terminal to run your bot, while running, the bot is operational and can respond to messages.
  - `node_modules` should be in the `.gitignore` file, as it is very big and shouldn't be tracked in the repository. 
  - Ensure your machine is using IPv4 for connection and not IPv6.

## Other things that are good to know:
  - The telegram bot is hosted on the local machine you run `node telegram-bot.js` on. 
  - This bot uses polling; Users sends message to the telegram server, and the telegram bot running on the local machine regularly asks the telegram server if it has any messages for it.
  - If there is an issue accessing the mysql server from the client, `ALTER USER 'yourUsername'@'localhost' IDENTIFIED WITH mysql_native_password BY 'yourPassword'; FLUSH PRIVILEGES;` might help