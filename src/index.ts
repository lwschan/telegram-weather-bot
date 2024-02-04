import { configure as configureEnv } from './environment';
import bot from './bot';

import { setDefaultAutoSelectFamily } from 'net';

configureEnv();

if (setDefaultAutoSelectFamily) {
  setDefaultAutoSelectFamily(false);
}

await bot();
