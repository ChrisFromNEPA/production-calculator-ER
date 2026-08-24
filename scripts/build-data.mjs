// scripts/build-data.mjs — validates and generates src/game_data.js from data/game_data.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataPath = join(__dirname, '..', 'data', 'game_data.json');
const outPath = join(__dirname, '..', 'src', 'game_data.js');

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const errors = [];

// Validate recipes
const recipeNames = new Set();
data.recipes.forEach((r, i) => {
  if (!r.output || !r.output.item) errors.push(`recipe[${i}]: missing output.item`);
  else if (recipeNames.has(r.output.item)) errors.push(`recipe[${i}]: duplicate output '${r.output.item}'`);
  else recipeNames.add(r.output.item);

  const inputs = (r.inputs || []).concat((r.inputs_alternatives || []).flat());
  inputs.forEach(inp => {
    if (!inp.item) errors.push(`recipe[${i}] (${r.output?.item}): input missing item`);
  });
  if (r.inputs_alternatives) {
    r.inputs_alternatives.forEach((alt, j) => {
      if (!alt.length) errors.push(`recipe[${i}] (${r.output?.item}): empty alternative[${j}]`);
    });
  }
});

// Validate mining sites
data.mining_sites.forEach((s, i) => {
  if (!s.location) errors.push(`mining_site[${i}]: missing location`);
  if (!s.yields || !s.yields.length) errors.push(`mining_site[${i}] (${s.location}): no yields`);
});

// Validate screenshot-derived colony lore. The security value is intentionally
// nullable: the supplied panels show qualitative meters, not numeric ratings.
if (!Array.isArray(data.colony_lore)) {
  errors.push('colony_lore: expected an array');
} else {
  const loreIds = new Set();
  data.colony_lore.forEach((entry, i) => {
    if (!entry.id || loreIds.has(entry.id)) errors.push(`colony_lore[${i}]: missing or duplicate id`);
    loreIds.add(entry.id);
    if (!entry.name) errors.push(`colony_lore[${i}]: missing name`);
    if (!entry.description) errors.push(`colony_lore[${i}] (${entry.name}): missing description`);
    if (!Number.isInteger(entry.resource_icon_count) || entry.resource_icon_count < 0) {
      errors.push(`colony_lore[${i}] (${entry.name}): invalid resource_icon_count`);
    }
    if (entry.resources_labeled !== false) errors.push(`colony_lore[${i}] (${entry.name}): resources_labeled must stay false`);
    if (!entry.security || entry.security.numeric !== null || !entry.security.visual) {
      errors.push(`colony_lore[${i}] (${entry.name}): security must preserve a null numeric value and visual note`);
    }
  });
}

// Check icons exist for recipe outputs
const iconDir = join(__dirname, '..', 'icons');
data.recipes.forEach(r => {
  if (r.output?.item) {
    const iconPath = join(iconDir, encodeURIComponent(r.output.item.toLowerCase()) + '.png');
    const iconPathRaw = join(iconDir, r.output.item.toLowerCase() + '.png');
    if (!existsSync(iconPath) && !existsSync(iconPathRaw)) {
      console.warn(`[build-data] WARNING: no icon for '${r.output.item}'`);
    }
  }
});

if (errors.length) {
  console.error(`[build-data] ${errors.length} validation errors:`);
  errors.forEach(e => console.error('  -', e));
  process.exit(1);
}

const js = `// GENERATED — edit data/game_data.json and run node scripts/build-data.mjs
window.GAME_DATA = ${JSON.stringify(data, null, 2)};
`;

writeFileSync(outPath, js);
console.log(`[build-data] Generated ${outPath} (${js.length} bytes) from ${dataPath}`);
console.log(`  ${data.recipes.length} recipes, ${data.mining_sites.length} mining sites, ${data.colony_lore.length} colony lore records`);
