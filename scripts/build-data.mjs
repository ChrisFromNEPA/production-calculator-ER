// scripts/build-data.mjs — validates and generates src/game_data.js from data/game_data.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataPath = join(__dirname, '..', 'data', 'game_data.json');
const outPath = join(__dirname, '..', 'src', 'game_data.js');
const integrityPath = join(__dirname, '..', 'data', 'data-integrity.json');

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const integrity = JSON.parse(readFileSync(integrityPath, 'utf8'));
const errors = [];
const externalMaterials = new Map((integrity.external_materials || []).map(item => [item.name.toLowerCase(), item]));
const iconFallbacks = new Map((integrity.icon_fallbacks || []).map(item => [item.name.toLowerCase(), item]));

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

// Every recipe input must be traceable to a produced item, a mining yield, or
// an explicit external-material record. This prevents silent orphan names.
const produced = new Set(data.recipes.map(r => r.output?.item?.toLowerCase()).filter(Boolean));
const mined = new Set(data.mining_sites.flatMap(s => s.yields || []).map(item => item.toLowerCase()));
data.recipes.forEach((r, i) => {
  const inputs = (r.inputs || []).concat((r.inputs_alternatives || []).flat());
  inputs.forEach(input => {
    const name = input.item?.toLowerCase();
    if (name && !produced.has(name) && !mined.has(name) && !externalMaterials.has(name)) {
      errors.push(`recipe[${i}] (${r.output?.item}): input '${input.item}' has no source or explicit external-material allowlist entry`);
    }
  });
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
    if (!existsSync(iconPath) && !existsSync(iconPathRaw) && !iconFallbacks.has(r.output.item.toLowerCase())) {
      errors.push(`recipe output '${r.output.item}': no icon and no explicit icon-fallback allowlist entry`);
    }
  }
});

if (errors.length) {
  console.error(`[build-data] ${errors.length} validation errors:`);
  errors.forEach(e => console.error('  -', e));
  process.exit(1);
}

// Runtime renderers use this policy to avoid requesting known-missing files and
// producing avoidable 404s. It contains no inferred game facts.
data.icon_fallbacks = [...iconFallbacks.values()].map(item => item.name);

const js = `// GENERATED — edit data/game_data.json and run node scripts/build-data.mjs
window.GAME_DATA = ${JSON.stringify(data, null, 2)};
`;

writeFileSync(outPath, js);
console.log(`[build-data] Generated ${outPath} (${js.length} bytes) from ${dataPath}`);
console.log(`  ${data.recipes.length} recipes, ${data.mining_sites.length} mining sites, ${data.colony_lore.length} colony lore records`);
console.log(`[build-data] integrity validation passed (${externalMaterials.size} external materials, ${iconFallbacks.size} icon fallbacks)`);
