// Find the webhook tied to a given channel or make one if it can't
export async function get_disc_hook(api, channel) {

    const hooks = await channel.fetchWebhooks()
    for (let hook of hooks) {
        if (hook[1].name === 'Bridge') {
            return hook[1]
        }
    }
    console.log(`No hook found for Discord channel ${channel.id}. Creating one now.`)
    return channel.createWebhook({
        name: "Bridge"
    })
}

// Reformatting the message to include info about pings and replies
export async function get_disc_content(msg, ref, guild) {
    let res = msg.content;
    const users = msg.mentions['users'];
    const guildEmojis = await guild.fetchEmojis()
    const msgEmojis = [...new Set(msg.content.match(/(?<=<:)\S+(?=:\d+>)/g))]
    msgEmojis.map((e) => {
        const emoji = guildEmojis.find((i) => i.name === e);
        if (emoji) {
            const rgx = new RegExp(`<:${emoji.name}:\\d+>`, 'g');
            res = res.replaceAll(rgx, `<:${emoji.name}:${emoji.id}>`);
        }
    })
    users.map((user) => {
        res = res.replaceAll(`<@${user.id}>`, `\`@${user.displayName ?? user.username}\``)
    })
    if (ref) {
        let refBody = ref.content;
        const refUsers = ref.mentions['users'];
        refUsers.map((user) => {refBody = refBody.replaceAll(`<@${user.id}>`, `@${user.displayName ?? user.username}`)});
        refBody = refBody.replace(/^`. reply to .+\n/, "");
        refBody = (refBody.split(/\s+/).length > 5) ? refBody.split(/\s+/).slice(0,5).join(" ") + '...' : refBody;
        refBody = refBody.replace(/`/g, "");
        res = `\`↱ reply to @${ref.author.displayName ?? ref.author.username}: ${refBody}\`\n` + res;
    }
    return res;
}

export async function get_disc_attachments(msg) {
    let res = [];
    const attachments = msg.attachments;
    attachments.map((a) => {
        if (/^(?:image|video|audio)/.test(a.contentType) && a.size < 10485760) {
            res.push({
                name: a.name,
                url: a.url
            })
        }
    })
    return res;
}
