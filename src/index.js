require('dotenv').config();
const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  REST,
  Routes,
} = require('discord.js');

const storage = require('./storage');
const {
  loadExpressions,
  messageMatches,
  watchExpressions,
} = require('./expressions');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Variable DISCORD_TOKEN manquante dans .env');
  process.exit(1);
}

const TIMEOUT_MS = 24 * 60 * 60 * 1000;
const DM_LINK = 'https://youtu.be/WALZZrcPA9g';
const DM_TEXT =
  'Ton compte a été hacké. Regarde cette vidéo pour savoir comment le récupérer. ATTENTION : si tu ne suis pas les instructions données, ton compte sera banni de façon permamente de tous les serveurs sur lesquels je suis !';
const DM_TRIPLE =
  "Bravo t'as tout gagné, t'es ban perm de tous les serveurs sur lesquels je suis. C'est ça de pas écouter les instructions";

let expressions = loadExpressions();
watchExpressions(() => {
  expressions = loadExpressions();
  console.log(`[expressions] Liste rechargée (${expressions.length} entrée(s))`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const body = [
    {
      name: 'sexbotstat',
      description: 'Affiche les statistiques de sanctions du bot',
    },
    {
      name: 'info',
      description: 'Présentation du bot, installation et support',
    },
  ];
  await rest.put(Routes.applicationCommands(client.user.id), { body });
  console.log('Commandes slash enregistrées.');
}

async function deleteMessageSafe(message) {
  try {
    await message.delete();
  } catch (e) {
    console.warn('Suppression du message impossible:', e.message);
  }
}

async function dmUser(user, text) {
  try {
    await user.send(text);
  } catch {
    console.warn(`DM impossible pour ${user.tag}`);
  }
}

/**
 * Résout une Guild exploitable (avec GuildMemberManager).
 * fetch(id) avec un ID = Guild complète ; sans ID = OAuth2Guild sans .members.
 */
async function resolveGuild(client, guildId) {
  const g = client.guilds.cache.get(guildId);
  if (g?.members) return g;
  return client.guilds.fetch(guildId);
}

async function fetchMemberReliable(guild, userId) {
  const member = await guild.members
    .fetch({ user: userId, force: true })
    .catch(() => null);
  if (!member) return null;
  if (member.partial) {
    try {
      return await member.fetch();
    } catch {
      return member;
    }
  }
  return member;
}

async function applyTimeoutAllGuilds(userId) {
  for (const guildId of client.guilds.cache.keys()) {
    try {
      const guild = await resolveGuild(client, guildId);
      const member = await fetchMemberReliable(guild, userId);
      if (!member) continue;
      if (!member.moderatable) {
        console.warn(
          `[cross-serveur] Timeout ignoré sur "${guild.name}" : rôle du bot trop bas ou cible non modérable.`
        );
        continue;
      }
      await member.timeout(TIMEOUT_MS, 'Sexbot - Message détecté');
    } catch (e) {
      console.warn(`Timeout échoué sur le serveur ${guildId}:`, e.message);
    }
  }
}

async function kickAllGuilds(userId) {
  for (const guildId of client.guilds.cache.keys()) {
    try {
      const guild = await resolveGuild(client, guildId);
      const member = await fetchMemberReliable(guild, userId);
      if (!member) continue;
      if (!member.kickable) {
        console.warn(
          `[cross-serveur] Kick ignoré sur "${guild.name}" : rôle du bot trop bas ou cible non expulsable.`
        );
        continue;
      }
      await member.kick('Sexbot - Récidive détectée');
    } catch (e) {
      console.warn(`Kick échoué sur le serveur ${guildId}:`, e.message);
    }
  }
}

async function banAllGuilds(userId) {
  const reason = 'Sexbot - Triple Récidive détectée';
  for (const guildId of client.guilds.cache.keys()) {
    try {
      const guild = await resolveGuild(client, guildId);
      const member = await fetchMemberReliable(guild, userId);
      if (member && !member.bannable) {
        console.warn(
          `[cross-serveur] Ban ignoré sur "${guild.name}" : rôle du bot trop bas ou cible non bannissable.`
        );
        continue;
      }
      await guild.members.ban(userId, { reason, deleteMessageSeconds: 0 });
    } catch (e) {
      console.warn(`Ban échoué sur le serveur ${guildId}:`, e.message);
    }
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  await registerSlashCommands();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (!messageMatches(message.content, expressions)) return;

  let data = storage.load();
  data = storage.pruneBlacklist(data);
  data = storage.pruneStrikes(data);
  const userId = message.author.id;
  const priorStrikes = storage.strikeCount(data, userId);

  await deleteMessageSafe(message);

  const originGuildId = message.guild.id;

  if (priorStrikes >= 2) {
    await dmUser(message.author, DM_TRIPLE);
    await banAllGuilds(userId);
    data = storage.incrementSanctions(data, originGuildId);
    data = storage.addStrike(data, userId);
    return;
  }

  if (priorStrikes === 1) {
    await kickAllGuilds(userId);
    data = storage.incrementSanctions(data, originGuildId);
    data = storage.addStrike(data, userId);
    return;
  }

  await applyTimeoutAllGuilds(userId);
  await dmUser(message.author, `${DM_TEXT}\n${DM_LINK}`);

  data = storage.incrementSanctions(data, originGuildId);
  data = storage.addStrike(data, userId);
});

function buildInfoEmbed() {
  return new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle('Anti Sexbot')
    .setDescription(
      '*Un bot créé par **Bavouille** pour faire taire les spammers insupportables.*'
    )
    .addFields(
      {
        name: 'Que fait-il ?',
        value: [
          'Détecte automatiquement les messages contenant une **invitation de serveur** et un texte du style *« Omg girl in vc »*.',
          '',
          '**Première détection** — Supprime le message, inflige un **mute de 1 h** au spammer sur **tous les serveurs** qui ont le bot, et lui envoie un MP avec un tuto pour **réinitialiser son token**.',
          '',
          '**Deuxième détection** — Supprime le message et **kick** le spammer de tous les serveurs qui ont le bot.',
          '',
          '**Troisième détection** — Supprime le message et **bannit** le spammer de tous les serveurs qui ont le bot.',
        ].join('\n'),
      },
      {
        name: 'Comment l’installer ?',
        value: [
          '• Cliquer sur son profil, **Ajouter l’application**.',
          '• Glisser le rôle **Anti Sexbot** tout en haut de la liste des rôles pour qu’il puisse sanctionner n’importe quel membre.',
        ].join('\n'),
      },
      {
        name: 'Comment supporter le bot ?',
        value:
          'Je paye le serveur moi-même parce que ça ne me coûte pas grand-chose, mais si vous voulez me remercier, [allez regarder mes vidéos](https://www.youtube.com/@bavouille/videos).',
      }
    );
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'info') {
    await interaction.reply({ embeds: [buildInfoEmbed()] });
    return;
  }

  if (interaction.commandName !== 'sexbotstat') return;

  let data = storage.load();
  data = storage.normalizeCounters(data);
  data = storage.pruneBlacklist(data);
  data = storage.pruneStrikes(data);
  storage.save(data);

  const embed = new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle('SexBotStat — Statistiques')
    .setDescription('Statistiques sur tous les casses couilles éliminés grâce à moi :)')
    .addFields(
      {
        name: 'Global — Total',
        value: String(data.total),
        inline: true,
      },
      {
        name: 'Global — Ce mois-ci',
        value: String(data.monthCount),
        inline: true,
      },
      {
        name: "Global — Aujourd'hui",
        value: String(data.dayCount),
        inline: true,
      }
    )
    .setTimestamp();

  if (interaction.inGuild() && interaction.guildId) {
    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
    const guildName = guild?.name ?? 'ce serveur';
    const g = storage.getGuildSnapshot(data, interaction.guildId);
    embed.addFields(
      {
        name: `Sur ce serveur (${guildName}) — Total`,
        value: String(g.total),
        inline: true,
      },
      {
        name: 'Ce mois-ci',
        value: String(g.monthCount),
        inline: true,
      },
      {
        name: "Aujourd'hui",
        value: String(g.dayCount),
        inline: true,
      }
    );
  }

  storage.save(data);

  await interaction.reply({ embeds: [embed] });
});

client.login(TOKEN);
