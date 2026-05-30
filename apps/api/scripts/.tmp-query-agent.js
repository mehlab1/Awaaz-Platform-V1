const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const timer = setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 20000);
p.$queryRawUnsafe(
  "SELECT a.id::text as id FROM agents a INNER JOIN agent_versions v ON v.id = a.current_version_id WHERE a.deleted_at IS NULL AND a.is_active = true AND v.tts_provider_id = 'rime' AND v.is_live = true LIMIT 1"
).then((rows) => {
  clearTimeout(timer);
  console.log(JSON.stringify(rows));
  return p.$disconnect();
}).catch((e) => {
  clearTimeout(timer);
  console.error(e.message);
  process.exit(1);
});
