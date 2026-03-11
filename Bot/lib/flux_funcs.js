export async function get_flux_content(msg, ref, guild) {
    let res = msg.content;
    const users = msg.mentions;
    const guildEmojis = await guild.emojis.fetch()
    const msgEmojis = [...new Set(msg.content.match(/(?<=<:)\S+(?=:\d+>)/g))]
    msgEmojis.map((e) => {
        const emoji = guildEmojis.find((i) => i.name === e);
        if (emoji) {
            const rgx = new RegExp(`<:${emoji.name}:\\d+>`, 'g');
            res = res.replaceAll(rgx, `<:${emoji.name}:${emoji.id}>`)
        }
    })
    users.map((user) => {
        res = res.replaceAll(`<@${user.id}>`, `\`@${user.displayName ?? user.username}\``)
    })
    if (ref) {
        let refBody = ref.content;
        const refUsers = ref.mentions;
        refUsers.map((user) => {refBody = refBody.replaceAll(`<@${user.id}>`, `@${user.displayName ?? user.username}`)})
        refBody = refBody.replace(/^`. reply to .+\n/, "");
        refBody = (refBody.split(/\s+/).length > 5) ? refBody.split(/\s+/).slice(0,5).join(" ") + '...' : refBody;
        refBody = refBody.replaceAll("`", "");
        res = `\`↱ reply to @${ref.author.globalName ?? ref.author.username}: ${refBody}\`\n` + res;
    }
    return res;
}

export async function get_flux_attachments(msg, fileTypes) {
    const attachments = msg.attachments;
    let res = [];
    attachments.map((a) => {
        if (/^(?:image|video|audio)/.test(a.content_type) && a.size < 10485760) {
            res.push(a.url)
        }
    })
    return res;
}

export async function get_flux_hook(api, channel) {
    const hooks = await channel.fetchWebhooks();
    for (var hook in hooks) {
        if(hooks[hook].name === 'Bridge') {
            return hooks[hook]
        }
    }
    console.log(`No webhook found for Fluxer channel ${channel.id}. Creating one now`)
    return channel.createWebhook({
        name: 'Bridge'
    })
}
