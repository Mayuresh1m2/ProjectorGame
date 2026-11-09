// Game registry. To add a game: create games/<name>/index.js exporting a Game subclass and list it here.
import { ButterflyGame } from './butterfly/index.js';
import { FishGame } from './fish/index.js';
import { BalloonGame } from './balloons/index.js';
import { DiyaGame } from './diwali/diyas.js';
import { SweetsGame } from './diwali/sweets.js';
import { RangoliGame } from './diwali/rangoli.js';
import { SkyGame } from './diwali/sky.js';
import { FriendsGame } from './friends/index.js';
import { ParkGame } from './park/index.js';
import { QuestGame } from './quest/index.js';
import { MenuGame } from './menu.js';

export const GAMES = { butterfly: ButterflyGame, fish: FishGame, balloons: BalloonGame,
  diyas: DiyaGame, sweets: SweetsGame, rangoli: RangoliGame, sky: SkyGame, friends: FriendsGame, park: ParkGame, quest: QuestGame };
export const REGISTRY = { ...GAMES, menu: MenuGame };

export function createGame(id, ctx) {
  const G = REGISTRY[id];
  if (!G) throw new Error(`unknown game ${id}`);
  return id === 'menu' ? new MenuGame(ctx, GAMES) : new G(ctx);
}
