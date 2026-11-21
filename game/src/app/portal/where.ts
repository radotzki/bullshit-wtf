/**
 * The "where am I running" switch with this build's settings: portal.ts decides (site, CrazyGames,
 * Discord) and this file gives it the Discord app's id from the environment first. Anything that
 * decides at load time (the routes in app-routing.module.ts) imports the switch from here, so the id
 * is set before the first answer is kept.
 */
import { environment } from '../../environments/environment';
import { launchSearch, useDiscordClientId } from './portal';

// Keep Discord's launch parameters before the router's first navigation takes them off the address.
launchSearch();
useDiscordClientId((environment as any).discordClientId);

export { inPortal, inCrazyGames, inDiscordActivity, runningIn } from './portal';
