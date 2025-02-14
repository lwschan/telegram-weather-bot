import TelegramBot, { Message } from 'node-telegram-bot-api';
import getAddressInfo from './location/geocode';
import { getWeather } from './weather';
import { formattedMessage } from './formatting';
import getEnv from './environment';
import redisClient from './redisClient';
import { getUserIdRedisKey } from './utils';

async function weatherBot() {
  console.info('Starting Das Wetter Bot!');

  const environment = getEnv();

  if (environment.telegramToken == null) {
    throw new Error('Please set env var TELEGRAM_TOKEN');
  }

  if (environment.authorizedUsers == null) {
    throw new Error('Please set env var AUTHORIZED_USERS');
  }

  const authorizedUsers = environment.authorizedUsers.split(',').map((id) => parseInt(id, 10));

  const bot =
    environment.nodeEnv === 'production'
      ? new TelegramBot(environment.telegramToken, {
          polling: false,
          filepath: false,
          webHook: {
            port: 443,
            host: '0.0.0.0',
          },
        })
      : new TelegramBot(environment.telegramToken, {
          polling: true,
          filepath: false,
        });

  const redis = redisClient.create();

  if (environment.nodeEnv === 'production') {
    await bot.setWebHook(`${environment.appUrl}/bot${environment.telegramToken}`);
  }

  console.info('Web hook / polling configured...');

  bot.onText(/\/ping/, handlePing);
  bot.onText(/\/start/, handleStart);
  bot.onText(/\/help/, handleHelp);

  const wCommandRegex = `/(w|w${environment.botUsername})$`;
  bot.onText(new RegExp(wCommandRegex), handleWeather);

  bot.onText(/\/wo/, handleWeatherForOtherLocation);
  bot.onText(/\/setlocation/, handleSetLocation);
  bot.onText(/\/deletelocation/, handleDeleteLocation);

  async function handlePing(message: Message) {
    console.info(`Processing ping command for ${message.chat.id}`);

    await bot.sendMessage(message.chat.id, 'This server is better than HWS! 🤯');
  }

  async function handleStart(message: Message) {
    if (!authorizedUsers.includes(message.chat.id)) {
      console.warn(`Ignore start request from ${message.chat.id}!`);

      await bot.sendMessage(message.chat.id, 'Unauthorized user.');
    } else {
      await bot.sendMessage(
        message.chat.id,
        `Use /help${environment.botUsername} for information on how to use this bot.`,
      );
    }
  }

  async function handleHelp(message: Message) {
    if (!authorizedUsers.includes(message.chat.id)) {
      console.warn(`Ignore help request from ${message.chat.id}!`);

      await bot.sendMessage(message.chat.id, 'Unauthorized user.');

      return;
    }

    const helpMessage = `I can give you the weather information given a location. You can control me by sending these commands:

/ping - check if I am alive
/w - get weather for your default location set
/wo {location} - get weather for a different location

<strong>Default Location</strong>
/setlocation {location} - set a default location
/deletelocation - delete your default location`;

    await bot.sendMessage(message.chat.id, helpMessage, {
      parse_mode: 'HTML',
    });
  }

  async function handleWeather(message: Message) {
    if (!authorizedUsers.includes(message.chat.id)) {
      console.warn(`Ignore weather request from ${message.chat.id}!`);

      await bot.sendMessage(message.chat.id, 'Unauthorized user.');
    }

    try {
      const userId = message.from?.id;

      if (userId == null) {
        return;
      }

      const userIdRedisKey = getUserIdRedisKey(userId);
      const address = await redis.get(userIdRedisKey);

      if (address == null) {
        await bot.sendMessage(
          message.chat.id,
          `Please set a default location using /setlocation${environment.botUsername}.`,
        );

        return;
      }

      const addressObject = JSON.parse(address);

      const { current, today } = await getWeather({
        latitude: addressObject.geometry.lat,
        longitude: addressObject.geometry.lng,
      });

      const reply = formattedMessage(addressObject.formattedName, current, today);

      await bot.sendMessage(message.chat.id, reply, { parse_mode: 'HTML' });
    } catch (error) {
      await bot.sendMessage(
        message.chat.id,
        `Unable to get current weather for your default loation.`,
      );
    }
  }

  async function handleWeatherForOtherLocation(message: Message) {
    if (!authorizedUsers.includes(message.chat.id)) {
      console.warn(`Ignore weather request from ${message.chat.id}!`);

      await bot.sendMessage(message.chat.id, 'Unauthorized user.');
    }

    const input = message.text?.replace('/wo', '').replace(`${environment.botUsername}`, '').trim();

    if (input == null || input.length < 1) {
      await bot.sendMessage(message.chat.id, 'Please enter a location.');
      return;
    }

    try {
      const address = await getAddressInfo(input);

      console.log(address);

      const { current, today } = await getWeather({
        latitude: address.geometry.lat,
        longitude: address.geometry.lng,
      });

      const reply = formattedMessage(address.formattedName, current, today);

      await bot.sendMessage(message.chat.id, reply, { parse_mode: 'HTML' });
    } catch (error) {
      await bot.sendMessage(message.chat.id, `Unable to find a valid address for ${input}`);
    }
  }

  async function handleSetLocation(message: Message) {
    if (!authorizedUsers.includes(message.chat.id)) {
      console.warn(`Ignore set location from ${message.chat.id}!`);

      await bot.sendMessage(message.chat.id, 'Unauthorized user.');
    }

    const chatId = message.chat.id;
    const userId = message.from?.id;

    if (userId == null) {
      return;
    }

    const input = message.text
      ?.replace('/setlocation', '')
      .replace(`${environment.botUsername}`, '')
      .trim();

    if (input == null || input.length < 1) {
      await bot.sendMessage(message.chat.id, 'Please enter a location.');
      return;
    }

    try {
      const address = await getAddressInfo(input);
      const userIdRedisKey = getUserIdRedisKey(userId);

      await redis.set(userIdRedisKey, JSON.stringify(address));

      await bot.sendMessage(chatId, `Default location ${address.formattedName} set.`, {
        reply_to_message_id: message.message_id,
      });
    } catch (error) {
      await bot.sendMessage(chatId, `Unable to find a valid address for ${input}`);
    }
  }

  async function handleDeleteLocation(message: Message) {
    if (!authorizedUsers.includes(message.chat.id)) {
      console.warn(`Ignore set location from ${message.chat.id}!`);

      await bot.sendMessage(message.chat.id, 'Unauthorized user.');
    }

    const chatId = message.chat.id;
    const userId = message.from?.id;

    if (userId == null) {
      return;
    }

    const userRedisKey = getUserIdRedisKey(userId);

    const addressSaved = await redis.get(userRedisKey);

    if (addressSaved == null) {
      await bot.sendMessage(chatId, `No default location to delete.`, {
        reply_to_message_id: message.message_id,
      });

      return;
    }

    await redis.del(userRedisKey);

    const locationDeleted = JSON.parse(addressSaved).formattedName;

    await bot.sendMessage(chatId, `Default location ${locationDeleted} deleted.`, {
      reply_to_message_id: message.message_id,
    });
  }
}

export default weatherBot;
