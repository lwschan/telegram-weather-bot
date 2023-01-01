import { createClient, IRedisClient } from 'redis';
import getEnv from './environment';

const create = (): IRedisClient => {
  let client: IRedisClient;

  const environment = getEnv();

  if (environment.nodeEnv === 'production') {
    client = createClient({
      url: environment.redisUrl,
      password: environment.redisPassword,
    });
  } else {
    client = createClient();
  }

  client.on('error', (error) => {
    console.error(error);
  });

  client.connect();

  return client;
};

export default create;
