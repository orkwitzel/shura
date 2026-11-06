// What the in-process integration tests in `apps/gateway/tests` wire up (design §14): bots on
// client-core's online session. Nothing in the services imports this.
export { type Bot, type BotOptions, type BotTarget, startBot } from './bot/bot';
export { BOT_HANDLING, type Pilot, type Seat, startPilot } from './bot/pilot';
export { choosePlacement, type Placement } from './brain/brain';
export { BOT_PROFILES, type BotProfile, type BotProfileName } from './brain/profile';
export { type Random, seededRandom } from './brain/random';
