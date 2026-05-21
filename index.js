const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, ApplicationCommandOptionType } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Ověření, že .env obsahuje potřebné proměnné
if (!process.env.DISCORD_TOKEN) {
    console.error("[CHYBA] V souboru .env chybí DISCORD_TOKEN!");
    process.exit(1);
}

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // Volitelné pro rychlejší registraci příkazů
const GUILD_ID = process.env.GUILD_ID;   // Volitelné pro okamžitý vývoj na jednom serveru

const DATA_FILE = './cenik_data.json';

// Inicializace bota
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Výchozí struktura dat podle obrázků
let db = {
    suroviny: {
        "KÁMEN": { cena: "2 500 $", sklad: 0 },
        "UHLÍ": { cena: "5 000 $", sklad: 0 },
        "SÍRA": { cena: "10 000 $", sklad: 0 },
        "MOSAZ": { cena: "10 000 $", sklad: 0 },
        "SKLO": { cena: "10 000 $", sklad: 0 },
        "LEDEK": { cena: "10 000 $", sklad: 0 },
        "BRONZ": { cena: "20 000 $", sklad: 0 },
        "OLOVO": { cena: "25 000 $", sklad: 0 },
        "ŽELEZO": { cena: "30 000 $", sklad: 0 },
        "OCEL": { cena: "35 000 $", sklad: 0 },
        "MĚĎ": { cena: "40 000 $", sklad: 0 },
        "STŘÍBRO": { cena: "po domluvě", sklad: 0 },
        "ZLATO": { cena: "po domluvě", sklad: 0 },
        "PLASTY": { cena: "20 000 $", sklad: 0 },
        "DRÁTY": { cena: "20 000 $", sklad: 0 }
    },
    produkty: {
        "AUTODÍL": { cena: "200 000 $", sklad: 0 },
        "MINING STANICE": { cena: "800 000 $", sklad: 0 }
    },
    zakazky: {},
    msg_id: null,
    channel_id: null
};

// Načtení dat ze souboru
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
            const parsed = JSON.parse(rawData);
            db = { ...db, ...parsed };
        } catch (e) {
            console.error("Nepodařilo se načíst JSON data, používám výchozí.", e);
        }
    } else {
        saveData();
    }
}

// Uložení dat do souboru
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 4), 'utf-8');
}

// Funkce pro vytvoření Embedu
function createPriceEmbed() {
    const embed = new EmbedBuilder()
        .setTitle("DCH TERRA | CENÍK MATERIÁLŮ")
        .setDescription("Aktuální přehled zásob a cen surovin na skladě.")
        .setColor(0xFFA500) // Oranžovo-zlatá
        .setFooter({ text: "AKTUALIZOVÁNO 2026 | PROFESIONÁLNÍ TĚŽBA A LOGISTIKA" });

    const surovinyEntries = Object.entries(db.suroviny);
    const half = Math.ceil(surovinyEntries.length / 2);
    const leftCol = surovinyEntries.slice(0, half);
    const rightCol = surovinyEntries.slice(half);

    const formatColumn = (items) => {
        return items.map(([nazev, info]) => {
            const status = info.sklad <= 0 
                ? "🔴 *Není skladem*" 
                : `🟢 Skladem: **${info.sklad.toLocaleString('cs-CZ')} ks**`;
            return `**${nazev}**\n└ Cena: \`${info.cena}\` | ${status}\n`;
        }).join('\n') || "Žádné položky";
    };

    embed.addFields(
        { name: "\u200B", value: "\u200B", inline: false }, // Odskočení od description
        { name: "⛏️ MATERIÁLY (1/2)", value: formatColumn(leftCol), inline: true },
        { name: "⛏️ MATERIÁLY (2/2)", value: formatColumn(rightCol), inline: true },
        { name: "\u200B", value: "\u200B", inline: false } // Odskočení materiálů od produktů
    );

    const prodLines = Object.entries(db.produkty).map(([nazev, info]) => {
        const status = info.sklad <= 0 
            ? "🔴 *Není skladem*" 
            : `🟢 Skladem: **${info.sklad.toLocaleString('cs-CZ')} ks**`;
        return `**${nazev}**\n└ Cena: \`${info.cena}\` | ${status}\n`;
    }).join('\n');

    embed.addFields({ name: "⚙️ CENÍK PRODUKTŮ", value: prodLines || "Žádné položky", inline: false });

    return embed;
}

// Definice příkazů pro Discord API
const commands = [
    {
        name: 'poslat_cenik',
        description: 'Odešle nový hlavní embed s ceníkem do aktuálního kanálu.',
    },
    {
        name: 'update',
        description: 'Aktualizuje množství suroviny nebo produktu na skladě.',
        options: [
            {
                name: 'polozka',
                description: 'Název suroviny nebo produktu',
                type: ApplicationCommandOptionType.String,
                required: true,
                autocomplete: true
            },
            {
                name: 'mnozstvi',
                description: 'Nové množství na skladě (kusy)',
                type: ApplicationCommandOptionType.Integer,
                required: true
            }
        ]
    },
    {
        name: 'zakazka',
        description: 'Vytvoří zápis o nové zakázce.',
        options: [
            {
                name: 'pro_koho',
                description: 'Jméno nebo organizace, pro koho zakázka je',
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: 'co',
                description: 'Co se má vyrobit / dodat',
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: 'kolik',
                description: 'Množství položek do zakázky',
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: 'kdy_do',
                description: 'Termín dodání (např. 25.10. nebo Pátek)',
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: 'cena',
                description: 'Celková cena zakázky',
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    },
    {
        name: 'dokoncit',
        description: 'Označí zakázku jako splněnou a pošle oznámení do kanálu.',
        options: [
            {
                name: 'zakazka_id',
                description: 'Vyber zakázku k dokončení',
                type: ApplicationCommandOptionType.String,
                required: true,
                autocomplete: true
            }
        ]
    }
];

client.once('ready', async () => {
    console.log(`Bot přihlášen jako ${client.user.tag}`);
    loadData();

    // Registrace příkazů (Slash Commands)
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Aktualizuji lomítkové příkazy...');
        if (GUILD_ID && CLIENT_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log('Příkazy úspěšně zaregistrovány pro lokální server.');
        } else if (CLIENT_ID) {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log('Příkazy úspěšně zaregistrovány globálně.');
        } else {
            console.log('POZNÁMKA: Příkazy se neregistrovaly automaticky, protože v .env chybí CLIENT_ID.');
        }
    } catch (error) {
        console.error('Chyba při registraci příkazů:', error);
    }
});

// Zpracování interakcí (příkazů a autocomplete)
client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        const focusedOption = interaction.options.getFocused(true);
        
        if (focusedOption.name === 'polozka') {
            const vsechnyPolozky = [...Object.keys(db.suroviny), ...Object.keys(db.produkty)];
            const filtered = vsechnyPolozky.filter(choice => choice.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
            await interaction.respond(filtered.map(choice => ({ name: choice, value: choice })));
        } else if (focusedOption.name === 'zakazka_id') {
            const zakazkyArr = Object.entries(db.zakazky || {}).map(([id, z]) => ({
                name: `${z.pro_koho} - ${z.co} (${z.kolik})`.substring(0, 100),
                value: id
            }));
            const filtered = zakazkyArr.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
            await interaction.respond(filtered);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'poslat_cenik') {
        // Kontrola administrátorských práv
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'Na tento příkaz nemáš práva!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const embed = createPriceEmbed();
        const message = await interaction.channel.send({ embeds: [embed] });

        db.msg_id = message.id;
        db.channel_id = interaction.channel.id;
        saveData();

        await interaction.editReply({ content: 'Ceník byl úspěšně odeslán a provázán s botem.' });
    }

    if (commandName === 'update') {
        // Kontrola práv pro správu zpráv
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: 'Na tento příkaz nemáš dostatečná práva!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const polozka = interaction.options.getString('polozka');
        const mnozstvi = interaction.options.getInteger('mnozstvi');

        if (mnozstvi < 0) {
            return interaction.editReply({ content: 'Množství nemůže být záporné číslo!' });
        }

        let isSurovina = polozka in db.suroviny;
        let isProdukt = polozka in db.produkty;

        if (!isSurovina && !isProdukt) {
            return interaction.editReply({ content: `Položka \`${polozka}\` nebyla nalezena v ceníku.` });
        }

        // Aktualizace hodnoty
        if (isSurovina) {
            db.suroviny[polozka].sklad = mnozstvi;
        } else {
            db.produkty[polozka].sklad = mnozstvi;
        }
        saveData();

        let updateStatus = "";
        if (db.msg_id && db.channel_id) {
            try {
                const channel = await client.channels.fetch(db.channel_id);
                const message = await channel.messages.fetch(db.msg_id);
                const newEmbed = createPriceEmbed();
                await message.edit({ embeds: [newEmbed] });
                updateStatus = "Embed na serveru byl úspěšně aktualizován.";
            } catch (e) {
                updateStatus = "Nepodařilo se upravit zprávu na serveru (možná byla smazána). Použijte znovu `/poslat_cenik`.";
            }
        } else {
            updateStatus = "Položka uložena, ale zatím nebyl odeslán hlavní ceník přes `/poslat_cenik`.";
        }

        const statusTxt = mnozstvi === 0 ? "není skladem 🔴" : `je nyní **${mnozstvi.toLocaleString('cs-CZ')} ks** 🟢`;
        await interaction.editReply({ 
            content: `Položka **${polozka}** byla úspěšně aktualizována. Stav: ${statusTxt}\n*${updateStatus}*` 
        });
    }

    if (commandName === 'zakazka') {
        const pro_koho = interaction.options.getString('pro_koho');
        const co = interaction.options.getString('co');
        const kolik = interaction.options.getString('kolik');
        const kdy_do = interaction.options.getString('kdy_do');
        const cena = interaction.options.getString('cena');

        const embed = new EmbedBuilder()
            .setTitle("📦 │ NOVÁ ZAKÁZKA")
            .setDescription("Byla zaevidována nová zakázka do systému.")
            .setColor(0x2B2D31) // Tmavá, moderní Discord barva
            .addFields(
                { name: "👤 Pro koho", value: `\`${pro_koho}\``, inline: false },
                { name: "🛠️ Předmět zakázky", value: `\`${co}\``, inline: false },
                { name: "📊 Množství", value: `\`${kolik}\``, inline: false },
                { name: "💰 Cena", value: `\`${cena}\``, inline: false },
                { name: "📅 Termín dodání", value: `\`${kdy_do}\``, inline: false }
            )
            .setFooter({ text: `Zadal: ${interaction.user.tag}` })
            .setTimestamp();

        const message = await interaction.reply({ embeds: [embed], fetchReply: true });

        // Uložení zakázky do databáze včetně informací k pozdějšímu smazání zprávy
        const id = Date.now().toString();
        if (!db.zakazky) db.zakazky = {};
        db.zakazky[id] = { 
            pro_koho, co, kolik, kdy_do, cena,
            message_id: message.id,
            channel_id: interaction.channelId
        };
        saveData();
    }

    if (commandName === 'dokoncit') {
        const zakazka_id = interaction.options.getString('zakazka_id');
        
        if (!db.zakazky || !db.zakazky[zakazka_id]) {
            return interaction.reply({ content: 'Zakázka nebyla nalezena. Možná už byla dokončena.', ephemeral: true });
        }

        const z = db.zakazky[zakazka_id];
        
        try {
            // Smazání původní zprávy zakázky v místnosti, kde byla vytvořena
            if (z.channel_id && z.message_id) {
                try {
                    const originChannel = await client.channels.fetch(z.channel_id);
                    const originMessage = await originChannel.messages.fetch(z.message_id);
                    await originMessage.delete();
                } catch (e) {
                    console.error("Nepodařilo se smazat původní zprávu zakázky (možná už byla smazána ručně).", e);
                }
            }

            const targetChannel = await client.channels.fetch('1507104721092087881');
            const embed = new EmbedBuilder()
                .setTitle("✅ │ ZAKÁZKA SPLNĚNA")
                .setDescription("Níže naleznete souhrn úspěšně doručené zakázky.")
                .setColor(0x57F287) // Moderní hezká Discord zelená
                .addFields(
                    { name: "👤 Odběratel", value: `\`${z.pro_koho}\``, inline: false },
                    { name: "📦 Dodané zboží", value: `\`${z.co}\``, inline: false },
                    { name: "📊 Množství", value: `\`${z.kolik}\``, inline: false },
                    { name: "💰 Vyfakturováno", value: `\`${z.cena}\``, inline: false }
                )
                .setFooter({ text: `Vyřídil: ${interaction.user.tag}` })
                .setTimestamp();
            
            await targetChannel.send({ embeds: [embed] });
            
            // Smazání zakázky po dokončení ze seznamu aktivních
            delete db.zakazky[zakazka_id];
            saveData();
            
            await interaction.reply({ content: `✅ Zakázka (Pro: ${z.pro_koho}) byla úspěšně označena jako splněná a odeslána do cílového kanálu.`, ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '❌ Nepodařilo se odeslat zprávu! Zkontroluj, zda má bot do kanálu 1507104721092087881 právo posílat zprávy.', ephemeral: true });
        }
    }
});

// Dummy web server pro Render.com (aby Web Service nespadl kvůli chybějícímu portu)
const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DCH-bot běží na Renderu!\n');
}).listen(port, () => {
    console.log(`Render Web Service dummy server naslouchá na portu ${port}`);
});

client.login(TOKEN);