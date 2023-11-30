import { configure as configureEnv } from './environment';
import bot from './bot';

configureEnv();

await bot();
