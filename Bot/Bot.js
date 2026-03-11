import { parse, stringify } from 'yaml'
import { Client as FClient, PermissionFlags } from '@fluxerjs/core'
import { Client as DClient, GatewayIntentBits, PermissionsBitField } from 'discord.js'
import { readFile, writeFile } from 'fs/promises'
import WebSocket from 'ws'
import * as disc from './lib/disc_funcs.js'
import * as flux from './lib/flux_funcs.js'
import * as cmd from './lib/cmds.js'

const PREFIX = process.env.CMD_PREFIX ?? 'brdg;'
const BRIDGE_FILE = new URL('./db/Bridges.yaml', import.meta.url)
if (!process.env.FLUXER_TOKEN || !process.env.DISCORD_TOKEN) {
    throw new Error("One or more tokens missing! Please set them in your environment variables.", {cause: 'MISSING_TOKENS'})
}

const fluxBot = new FClient({ intents: 0, WebSocket });
const discBot = new DClient({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages]});

let bridges;

async function saveBridges() {
    await writeFile(BRIDGE_FILE, stringify(bridges));
}

try {
    const bridgefile = parse(await readFile(BRIDGE_FILE, 'utf8'), {schema: 'failsafe'});
    console.log(`Bridges loaded!`)
    const sanitized = cmd.sanitizeBridges(bridgefile);
    bridges = sanitized.bridges;
    if (sanitized.changed) {
        console.warn('Removed invalid bridge entries from Bridges.yaml. Only numeric channel IDs are supported.');
    }
    await saveBridges();
}
catch {
    console.log("Error finding './Bot/db/Bridges.yaml'.\nAttempting to create one now");
    bridges = {Discord: {}, Fluxer: {}};
    await saveBridges()
}

fluxBot.once('ready', () => console.log(`Fluxer logged in as ${fluxBot.user.username}#${fluxBot.user.discriminator}`));
fluxBot.on('error', (e) => console.error('Fluxer client error:', e?.message ?? e));

fluxBot.on('messageCreate', async (msg) => {
     if (msg.content?.startsWith(PREFIX) && !msg.author.bot) {
        const stripped = msg.content.replace(PREFIX, "");
        const mem = await msg.guild.members.get(msg.author.id)
        const authed = mem?.permissions?.has(PermissionFlags.ManageChannels) ?? false;
        let res = cmd.parse(authed, bridges, 'Fluxer', msg.channel.id, stripped);
        if (typeof res == 'object') {
            bridges = res;
            await saveBridges()
            await msg.react('👍')
        }
        else {
            res = res.replaceAll("[PRFX]", PREFIX)
            await msg.channel.send(res)
        }
        return;
    }
    const rawAttachments = await flux.get_flux_attachments(msg);
    if (msg.author.bot || (!msg.content && rawAttachments.length == 0)) {return};
    if (msg.channelId in bridges.Fluxer) {
        for (const ID of bridges.Fluxer[msg.channelId]) {
            try {
                const discChannel = await discBot.channels.fetch(ID);
                const discGuild = await discBot.guilds.fetch(discChannel.guildId);
                const rawMsg = await flux.get_flux_content(msg, msg.referencedMessage, discGuild)
                const guildHook = await disc.get_disc_hook(discBot, discChannel);
                await guildHook.send({
                    username: msg.author.globalName,
                    avatarURL: `https://fluxerusercontent.com/avatars/${msg.author.id}/${msg.author.avatar}.webp`,
                    content: rawMsg,
                    files: rawAttachments
                })
            }
            catch (e) {
                console.error(`Failed to bridge Fluxer channel ${msg.channelId} to Discord channel ${ID}:`, e.message);
            }
        }
    }
})

// DISCORD / FLUXER BOT DIVIDER FOR RILLABEL EASY READING

discBot.once('clientReady', (data) => console.log(`Discord logged in as ${data.user.tag}!`));

discBot.on('messageCreate', async (msg) => {
    if (msg.content?.startsWith(PREFIX) && !msg.author.bot) {
        const stripped = msg.content.replace(PREFIX, "");
        const authed = msg.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels) ?? false;
        let res = cmd.parse(authed, bridges, 'Discord', msg.channel.id, stripped);
        if (typeof res == 'object') {
            bridges = res;
            await saveBridges()
            await msg.react('👍')
        }
        else {
            res = res.replaceAll("[PRFX]", PREFIX)
            await msg.channel.send(res);
        }

        return;
    }
    const rawAttachments = await disc.get_disc_attachments(msg);
    if (msg.author.bot || (!msg.content && rawAttachments.length == 0)) {return}
    if (msg.channelId in bridges.Discord) {
        let replyTo;
        if (msg.reference) {
            replyTo = await msg.fetchReference();
        }
        for (const ID of bridges.Discord[msg.channelId]) {
            try {
                const fluxChannel = await fluxBot.channels.fetch(ID);
                const fluxGuild = await fluxBot.guilds.fetch(fluxChannel.guildId)
                const rawContent = await disc.get_disc_content(msg, replyTo, fluxGuild)
                const hook = await flux.get_flux_hook(fluxBot, fluxChannel);
                await hook.send({
                    username: msg.author.displayName,
                    content: rawContent,
                    avatar_url: `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}`,
                    files: rawAttachments
                })
            }
            catch (e) {
                console.error(`Failed to bridge Discord channel ${msg.channelId} to Fluxer channel ${ID}:`, e.message);
            }
        }
    }
})

discBot.login(process.env.DISCORD_TOKEN).catch((e) => {
    console.error('Discord login failed:', e.message);
});
fluxBot.login(process.env.FLUXER_TOKEN).catch((e) => {
    console.error('Fluxer login failed:', e.message);
});

// ERROR HANDLING DIVIDER FOR RILLABEL EASIER READING

let handling = 0;
async function reset (attempts) {
    const delay = (attempts <= 3)? 0 : attempts - 3;
    try {
        await fluxBot.destroy()
        await discBot.destroy()
        await discBot.login(process.env.DISCORD_TOKEN)
        await fluxBot.login(process.env.FLUXER_TOKEN)
        console.log('Restarted successfully!')
        handling = 0
    }
    catch (e) {
        console.error('Ran into an issue while restarting:', e.message, '\nAttempting again in', delay, 'minutes.');
        ++attempts;
        setTimeout(() => {reset(attempts)}, 60000 * delay)
    }

}

process.on('uncaughtException', async (e) => {
    if (handling == 0) {
        console.error(new Date().toTimeString().match(/\S+/)[0], 'Ran into an error:', e.message, "\nBoth bots will attempt to restart.")
        handling = 1
        setTimeout(() => {reset(0)}, 5000)
    }
})
