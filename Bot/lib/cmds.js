const requireAuth = ['listen', 'drop', 'mate', 'divorce', 'crsh']
const channelIdPattern = /^\d+$/
const usage = {
    listen: "Usage: [PRFX] listen <Channel ID> [Channel ID ...]\nCreate a one-way bridge from the listed channels into this channel.",
    drop: "Usage: [PRFX] drop <Channel ID> [Channel ID ...]\nRemove one-way bridges from the listed channels into this channel.",
    mate: "Usage: [PRFX] mate <Channel ID>\nCreate a two-way bridge between this channel and the listed channel.",
    divorce: "Usage: [PRFX] divorce <Channel ID>\nRemove the two-way bridge between this channel and the listed channel."
}

export function normalizeChannelId(id) {
    if (typeof id === 'number' && Number.isInteger(id) && id >= 0) {
        return String(id);
    }
    if (typeof id !== 'string') {
        return null;
    }
    const normalized = id.trim().replace(/,+$/g, "");
    return channelIdPattern.test(normalized) ? normalized : null;
}

function parseTokens(msg) {
    if (typeof msg !== 'string') {
        return [];
    }
    return msg.trim().split(/[\s,]+/).filter(Boolean);
}

function validateArgs(command, args, options = {}) {
    const min = options.min ?? 1;
    const max = options.max ?? Infinity;
    if (args.length < min || args.length > max) {
        return usage[command];
    }
    const normalized = args.map(normalizeChannelId);
    if (normalized.includes(null)) {
        return `${usage[command]}\nChannel IDs must be numeric.`;
    }
    return normalized;
}

export function sanitizeBridges(rawBridges) {
    const clean = {Discord: {}, Fluxer: {}};
    let changed = false;

    for (const side of ['Discord', 'Fluxer']) {
        const sideBridges = rawBridges?.[side];
        if (!sideBridges || typeof sideBridges !== 'object' || Array.isArray(sideBridges)) {
            if (sideBridges !== undefined) {
                changed = true;
            }
            continue;
        }

        for (const [sourceId, targets] of Object.entries(sideBridges)) {
            const normalizedSourceId = normalizeChannelId(sourceId);
            if (!normalizedSourceId || !Array.isArray(targets)) {
                changed = true;
                continue;
            }

            const normalizedTargets = [...new Set(targets.map(normalizeChannelId).filter(Boolean))];
            if (normalizedSourceId !== sourceId || normalizedTargets.length !== targets.length) {
                changed = true;
            }
            if (normalizedTargets.length === 0) {
                changed = true;
                continue;
            }

            clean[side][normalizedSourceId] = normalizedTargets;
        }
    }

    return {bridges: clean, changed};
}

function listen(bdg, orig, cid, args) {
    if (orig == 'Fluxer') {
        args.map((id) => {
            bdg.Discord[id] = (bdg.Discord[id])? bdg.Discord[id] : [];
            if (!bdg.Discord[id].includes(cid)) {bdg.Discord[id].push(cid)}
        })
    }
    if (orig == 'Discord') {
        args.map((id) => {
            bdg.Fluxer[id] = (bdg.Fluxer[id])? bdg.Fluxer[id] : [];
            if (!bdg.Fluxer[id].includes(cid)) {bdg.Fluxer[id].push(cid)}
        })
    }
    return bdg;
}

function drop(bdg, orig, cid, args) {
    if (orig == 'Fluxer') {
        args.map((id) => {
            if (bdg.Discord[id] && bdg.Discord[id].includes(cid)) {
                bdg.Discord[id].splice(bdg.Discord[id].indexOf(cid), 1);
                if (bdg.Discord[id].length == 0) {delete bdg.Discord[id]}
            }
        })
    }
    if (orig == 'Discord') {
        args.map((id) => {
            if (bdg.Fluxer[id] && bdg.Fluxer[id].includes(cid)) {
                bdg.Fluxer[id].splice(bdg.Fluxer[id].indexOf(cid), 1);
                if (bdg.Fluxer[id].length == 0) {delete bdg.Fluxer[id]}
            }
        })
    }
    return bdg;
}

function mate(bdg, orig, cid, args) {
    if (orig == 'Fluxer') {
        bdg = listen(bdg, 'Fluxer', cid, [args[0]]);
        bdg = listen(bdg, 'Discord', args[0], [cid]);
    }
    if (orig == 'Discord') {
        bdg = listen(bdg, 'Discord', cid, [args[0]]);
        bdg = listen(bdg, 'Fluxer', args[0], [cid]);
    }
    return bdg;
}

function divorce(bdg, orig, cid, args) {
    if (orig == 'Fluxer') {
        bdg = drop(bdg, 'Fluxer', cid, [args[0]]);
        bdg = drop(bdg, 'Discord', args[0], [cid]);
    }
    if (orig == 'Discord') {
        bdg = drop(bdg, 'Discord', cid, [args[0]]);
        bdg = drop(bdg, 'Fluxer', args[0], [cid]);
    }
    return bdg;
}

function help() {
    return "### [PRFX] listen <Channel ID> [Channel ID ...]\n" +
    "Create a one-way bridge from the listed channels into this channel\n" +
    "### [PRFX] drop <Channel ID> [Channel ID ...]\n" +
    "Remove one-way bridges from the listed channels into this channel\n" +
    "### [PRFX] mate <Channel ID>\n" +
    "Create a two-way bridge between this channel and another channel\n" +
    "### [PRFX] divorce <Channel ID>\n" +
    "Remove the two-way bridge between this channel and another channel\n" +
    "Channel IDs must be numeric. Commas between IDs are optional."
}

export function parse(auth, bdg, orig, cid, msg) {
    const cmd = parseTokens(msg);
    if (cmd.length === 0) {return "Unknown command. Use [PRFX] help";}
    if (requireAuth.includes(cmd[0]) && auth == false) {return "This command requires Manage Channels permission."}
    if (cmd[0] == 'listen') {
        const ids = validateArgs('listen', cmd.slice(1), {min: 1});
        return Array.isArray(ids) ? listen(bdg, orig, cid, ids) : ids;
    }
    if (cmd[0] == 'drop') {
        const ids = validateArgs('drop', cmd.slice(1), {min: 1});
        return Array.isArray(ids) ? drop(bdg, orig, cid, ids) : ids;
    }
    if (cmd[0] == 'mate') {
        const ids = validateArgs('mate', cmd.slice(1), {min: 1, max: 1});
        return Array.isArray(ids) ? mate(bdg, orig, cid, ids) : ids;
    }
    if (cmd[0] == 'divorce') {
        const ids = validateArgs('divorce', cmd.slice(1), {min: 1, max: 1});
        return Array.isArray(ids) ? divorce(bdg, orig, cid, ids) : ids;
    }
    if (cmd[0] == 'help') {return help()}
    if (cmd[0] == 'crsh') {throw new Error("Crashed. Scary!")}
    return "Unknown command. Use [PRFX] help";
}
