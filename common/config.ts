import assert from "node:assert";

import { client } from "strife.js";
import type { NonFalsy } from "./misc.js";

const IS_TESTING = process.argv.some((file) => file.endsWith(".test.js"));

const guild = IS_TESTING ? undefined : await client.guilds.fetch(process.env.GUILD_ID);
if (guild && !guild.available) throw new ReferenceError("Main guild is unavailable!");

function assertOutsideTests<T>(value: T): NonFalsy<T> {
	if (!IS_TESTING) assert(value);
	return value as NonFalsy<T>;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function getConfig() {
	return {
		guild: assertOutsideTests(guild),
	};
}

const config = await getConfig();

export default config;
