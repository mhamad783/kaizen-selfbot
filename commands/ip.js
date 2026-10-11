const { fetch } = require('undici');

module.exports = {
    async handle(message) {
        const content = message.content.trim();

        const regex = /^ip\s+(.+)$/i;
        const match = content.match(regex);

        if (!match) return false;

        const query = match[1].trim();

        try {

            const res = await fetch(`http://ip-api.com/json/${query}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`);
            const data = await res.json();

            if (data.status === 'fail') {
                await message.channel.send(`\`\`\`\n❌ IP Lookup Failed: ${data.message}\n\`\`\``);
                return true;
            }

            let msg = '```ini\n';
            msg += `[ IP LOOKUP RESULTS ]\n\n`;
            msg += `Target      : ${data.query}\n`;
            msg += `ISP         : ${data.isp}\n`;
            msg += `Organization: ${data.org}\n`;
            msg += `AS          : ${data.as}\n`;
            msg += `----------------------------------------\n`;
            msg += `Country     : ${data.country} (${data.countryCode})\n`;
            msg += `Region      : ${data.regionName} (${data.region})\n`;
            msg += `City        : ${data.city}\n`;
            msg += `Zip Code    : ${data.zip}\n`;
            msg += `Timezone    : ${data.timezone}\n`;
            msg += `Coordinates : ${data.lat}, ${data.lon}\n`;
            msg += '```\n';

            // Add Google Maps link outside code block
            msg += `[View on Google Maps](https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lon})`;

            await message.channel.send(msg);
            return true;

        } catch (error) {
            console.error('IP Lookup Error:', error);

            return false;
        }
    }
};
