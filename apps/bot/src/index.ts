// What the in-process integration tests in `apps/gateway/tests` wire up (design §14): bots on
// client-core's online session. Nothing in the services imports this.
export { type Bot, type BotOptions, type BotSession, type BotTarget, startBot } from './bot';
export { choosePlacement, type Placement } from './brain';
export { BOT_HANDLING, type Pilot, type Seat, startPilot } from './pilot';
export { BOT_PROFILES, type BotProfile, type BotProfileName } from './profile';
export { type Random, seededRandom } from './random';
