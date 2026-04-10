import fs from 'node:fs/promises';
import path from 'node:path';

const TOTAL = 111;
const FEMALE = 33;
const ROOT = path.join(process.cwd(), 'public', 'generated', 'presto-sidekicks');
const IMG = path.join(ROOT, 'images');
const META = path.join(ROOT, 'metadata');
const RARITY = { Legendary: 6, Rare: 11, Special: 17, Common: 77 };
const VIBES = ['Nova', 'Harbor', 'Pixel', 'Lunar', 'Jade', 'Velvet', 'Orbit', 'Neon', 'Solar', 'Moss', 'Echo'];
const ROLES = ['Scout', 'Stylist', 'Rider', 'Dreamer', 'Maker'];
const BG = {
  Common: [
    ['Night Grid', '#101a31', '#182548', '#2d4a87'],
    ['Sky Bloom', '#1a2240', '#22386c', '#5cc7ff'],
    ['Moon Dust', '#1b1f38', '#28345c', '#8ab4ff'],
    ['Arc Glow', '#122033', '#173457', '#25c0f4'],
  ],
  Special: [
    ['Candy Pulse', '#291e3e', '#25376f', '#ff8bd1'],
    ['City Sunset', '#30203c', '#4c335e', '#ffb266'],
    ['Mint Current', '#102f33', '#18545a', '#6df6d6'],
  ],
  Rare: [
    ['Prism Storm', '#1d203f', '#2f2665', '#8d87ff'],
    ['Aurora Rail', '#13273d', '#174969', '#5affd7'],
    ['Signal Heat', '#351e2a', '#57263a', '#ff6f91'],
  ],
  Legendary: [
    ['Celestial Core', '#0c1527', '#1b2953', '#f7d46a'],
    ['Mythic Arc', '#121022', '#2c1f5a', '#7cf8ff'],
    ['Golden Runtime', '#24170f', '#4d3116', '#ffd86b'],
  ],
};
const SKIN = ['#f6d2b5', '#efc4a2', '#d7a47a', '#b77d58', '#8f5c41', '#6f4332'];
const FUR = ['#f1efe4', '#d9c6a1', '#9d7a59', '#4b3a2f', '#151822'];
const HAIR_COLORS = ['#111827', '#1f3d68', '#6a3ec9', '#e95f7a', '#f4c14f', '#f3f7ff', '#1b8c7a', '#ff8b3d'];
const OUTFIT_COLORS = ['#25c0f4', '#4c7df7', '#7d5cff', '#18c47c', '#f97316', '#f43f5e', '#e5e7eb', '#121826'];
const ACC_COLORS = ['#d4d9f0', '#7cf8ff', '#ffda6a', '#ff7ab3', '#22d3ee', '#f5f5f5'];
const EYES = ['#f5f7ff', '#9df9f0', '#8fb6ff', '#ffd36f', '#ff9fb7'];
const HAIR = {
  Female: ['Twin Buns', 'High Ponytail', 'Soft Bob', 'Long Braid', 'Ribbon Curls', 'Halo Puff'],
  Male: ['Slick Sweep', 'Side Fade', 'Short Spikes', 'Messy Crop', 'Neo Mullet', 'Split Undercut'],
  Any: ['Beanie', 'Bucket Hat', 'Tech Cap', 'Hood Tuck', 'Short Waves'],
};
const OUTFITS = {
  Female: ['Varsity Jacket', 'Padded Bomber', 'Tech Hoodie', 'Oversized Tee', 'Patchwork Coat'],
  Male: ['Street Hoodie', 'Signal Vest', 'Track Jacket', 'Puffer Shell', 'Utility Jersey'],
  Any: ['Neon Raincoat', 'Arc Crewneck', 'Studio Shell', 'Pixel Poncho'],
};
const ACCESSORIES = {
  Common: ['Slim Shades', 'Cheek Bandage', 'Mini Scarf', 'Ear Cuff', 'Freckle Sticker', 'None'],
  Special: ['Star Goggles', 'Crystal Clip', 'Audio Halo', 'Bloom Visor'],
  Rare: ['Neon Monocle', 'Data Crown', 'Split Visor'],
  Legendary: ['Aurora Halo', 'Mythic Crown', 'Solar Horns'],
};
const OBJECTS = {
  Common: ['Drink Can', 'Sketch Book', 'Charm Card', 'Gamepad', 'Glow Flower', 'Camera', 'None'],
  Special: ['Arc Orb', 'Mint Pet', 'Pixel Spray'],
  Rare: ['Golden Cassette', 'Holo Drone'],
  Legendary: ['Celestial Cube', 'Myth Key'],
};

const pad = (v) => String(v).padStart(3, '0');
const rng = (seed) => () => {
  seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
  seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
  return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr, seed) => {
  const rand = rng(seed);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function archetypes() {
  return VIBES.flatMap((vibe) => ROLES.map((role) => `${vibe} ${role}`));
}

function renderBg([label, top, bottom, accent], rand) {
  const points = Array.from({ length: 12 }, (_, i) => {
    const x = 70 + ((i * 73) % 640);
    const y = 80 + ((i * 59) % 520);
    const r = 8 + (i % 3) * 10;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" opacity="${0.08 + (i % 4) * 0.04}" />`;
  }).join('');
  return { label, accent, svg: `<defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="${top}"/><stop offset="100%" stop-color="${bottom}"/></linearGradient></defs><rect width="800" height="800" fill="url(#bg)"/>${points}` };
}

function renderHair(shape, color) {
  const shapes = [
    `<path d="M246 252 C266 170 536 168 554 252 L538 338 C504 302 460 286 400 288 C340 290 292 306 260 340 Z" fill="${color}"/>`,
    `<path d="M242 252 C256 156 544 154 558 252 L544 350 C510 304 470 292 400 294 C330 296 290 312 258 350 Z" fill="${color}"/><circle cx="280" cy="224" r="28" fill="${color}"/><circle cx="520" cy="224" r="28" fill="${color}"/>`,
    `<path d="M250 250 C274 188 526 188 552 270 L542 332 C504 304 458 290 400 292 C342 294 294 308 258 334 Z" fill="${color}"/><rect x="250" y="194" width="300" height="84" rx="42" fill="${color}" opacity="0.82"/>`,
    `<path d="M246 252 C268 168 540 166 554 252 L540 340 C506 300 460 284 400 286 C338 288 292 306 260 344 Z" fill="${color}"/><path d="M282 330 C260 372 258 442 292 496" fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round"/><path d="M518 330 C540 372 542 442 508 496" fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round"/>`,
    `<ellipse cx="400" cy="214" rx="168" ry="86" fill="${color}"/><path d="M244 252 C266 166 534 166 554 252 L540 348 C510 304 470 292 400 294 C330 296 290 310 262 348 Z" fill="${color}"/>`,
  ];
  return shapes[shape % shapes.length];
}

function renderAccessory(shape, color) {
  const shapes = [
    `<g><rect x="312" y="352" width="66" height="26" rx="10" fill="#18233b" stroke="${color}" stroke-width="4"/><rect x="422" y="350" width="66" height="28" rx="10" fill="#18233b" stroke="${color}" stroke-width="4"/><rect x="378" y="360" width="44" height="6" rx="3" fill="${color}"/></g>`,
    `<path d="M292 348 C344 320 456 320 508 348 C494 390 448 410 400 410 C352 410 306 392 292 348 Z" fill="${color}" opacity="0.72"/>`,
    `<ellipse cx="400" cy="232" rx="144" ry="36" fill="none" stroke="${color}" stroke-width="10" opacity="0.84"/>`,
    `<path d="M284 250 L330 190 L382 236 L432 178 L476 236 L526 200 L544 272 L256 272 Z" fill="${color}" opacity="0.88"/>`,
    `<circle cx="558" cy="430" r="9" fill="${color}" opacity="0.9"/>`,
  ];
  return shapes[shape % shapes.length];
}

function renderObject(shape, color) {
  const shapes = [
    `<g transform="translate(520 620)"><rect x="0" y="0" width="58" height="92" rx="18" fill="${color}" opacity="0.85"/></g>`,
    `<g transform="translate(214 642)"><rect x="0" y="0" width="110" height="62" rx="26" fill="${color}" opacity="0.84"/></g>`,
    `<g transform="translate(528 628)"><circle cx="42" cy="42" r="42" fill="${color}" opacity="0.76"/><circle cx="42" cy="42" r="24" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="6"/></g>`,
    `<g transform="translate(214 636)"><rect x="0" y="0" width="112" height="78" rx="18" fill="${color}" opacity="0.82"/><circle cx="56" cy="38" r="20" fill="#ffffff" opacity="0.26"/></g>`,
    '',
  ];
  return shapes[shape % shapes.length];
}

function renderCharacter(item) {
  const mouth = ['M378 468 C392 476 408 476 422 468', 'M372 466 C390 486 410 486 428 466', 'M384 470 C398 474 412 474 430 464', 'M396 466 C404 476 414 476 422 466'][item.expressionIndex % 4];
  return `<?xml version="1.0" encoding="UTF-8"?><svg width="800" height="800" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
    ${item.backgroundSvg}
    <ellipse cx="400" cy="748" rx="210" ry="34" fill="#0b1220" opacity="0.35"/>
    <path d="M236 572 C248 484 308 434 400 432 C492 430 552 484 564 572 L586 740 C532 770 470 786 400 786 C330 786 268 770 214 740 Z" fill="${item.outfitColor}" stroke="rgba(11,16,27,0.18)" stroke-width="3"/>
    <ellipse cx="400" cy="376" rx="158" ry="174" fill="${item.complexion}"/><path d="M270 388 C282 520 338 600 400 612 C464 598 518 520 530 388" fill="${item.complexion}"/>
    ${item.hasAnimalEars ? `<path d="M294 224 L326 146 L366 248 Z" fill="${item.complexion}" opacity="0.92"/><path d="M506 224 L474 146 L434 248 Z" fill="${item.complexion}" opacity="0.92"/>` : ''}
    ${renderHair(item.hairShape, item.hairColor)}
    <path d="M338 318 C356 308 372 310 386 320" stroke="#132238" stroke-width="8" stroke-linecap="round"/><path d="M430 312 C444 304 462 306 480 318" stroke="#132238" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="358" cy="370" rx="22" ry="28" fill="${item.eyeColor}"/><ellipse cx="454" cy="366" rx="28" ry="32" fill="${item.eyeColor}"/><circle cx="364" cy="366" r="9" fill="#0f172a"/><circle cx="460" cy="362" r="10" fill="#0f172a"/><circle cx="368" cy="360" r="3" fill="#ffffff"/><circle cx="464" cy="356" r="3" fill="#ffffff"/>
    ${item.gender === 'Female' ? '<path d="M340 350 l-10 -8 M349 344 l-8 -10 M466 338 l12 -8 M476 346 l10 -8" stroke="#132238" stroke-width="3" stroke-linecap="round"/>' : ''}
    <path d="M404 392 C416 420 416 446 404 456" stroke="#c38d7d" stroke-width="5" fill="none" stroke-linecap="round"/><path d="${mouth}" fill="none" stroke="#132238" stroke-width="6" stroke-linecap="round"/>
    ${item.faceMark ? '<circle cx="304" cy="430" r="9" fill="#25c0f4" opacity="0.18"/><circle cx="304" cy="430" r="4" fill="#25c0f4" opacity="0.65"/>' : ''}
    ${renderAccessory(item.accessoryShape, item.accColor)}
    ${renderObject(item.objectShape, item.accColor)}
    <rect x="28" y="28" width="168" height="46" rx="20" fill="#0f172a" fill-opacity="0.28" stroke="rgba(255,255,255,0.12)"/><text x="52" y="57" fill="#25c0f4" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700">${item.rarity}</text>
  </svg>`;
}

async function main() {
  await fs.mkdir(IMG, { recursive: true });
  await fs.mkdir(META, { recursive: true });
  const types = archetypes();
  const rarities = shuffle(Object.entries(RARITY).flatMap(([k, c]) => Array.from({ length: c }, () => k)), 1204);
  const genders = shuffle([...Array.from({ length: FEMALE }, () => 'Female'), ...Array.from({ length: TOTAL - FEMALE }, () => 'Male')], 3204);
  const items = [];

  for (let i = 0; i < TOTAL; i += 1) {
    const rand = rng(5000 + i * 17);
    const rarity = rarities[i];
    const backgroundSeed = pick(BG[rarity] || BG.Common, rand);
    const [bgName, bgTop, bgBottom, bgAccent] = backgroundSeed;
    const hairPool = [...HAIR[genders[i]], ...HAIR.Any];
    const wearPool = [...OUTFITS[genders[i]], ...OUTFITS.Any];
    const accessoryPool = [...(ACCESSORIES[rarity] || []), ...(rarity === 'Common' ? [] : ACCESSORIES.Common)];
    const objectPool = [...(OBJECTS[rarity] || []), ...(rarity === 'Common' ? [] : OBJECTS.Common)];
    const item = {
      id: i,
      name: `Presto Sidekick #${pad(i)}`,
      rarity,
      gender: genders[i],
      archetype: types[i % types.length],
      background: bgName,
      backgroundSvg: renderBg(backgroundSeed, rand).svg,
      complexion: rand() < 0.16 ? pick(FUR, rand) : pick(SKIN, rand),
      hair: pick(hairPool, rand),
      hairShape: Math.floor(rand() * 5),
      hairColor: pick(HAIR_COLORS, rand),
      outfit: pick(wearPool, rand),
      outfitColor: pick(OUTFIT_COLORS, rand),
      accessory: pick(accessoryPool, rand),
      accessoryShape: Math.floor(rand() * 5),
      object: pick(objectPool, rand),
      objectShape: Math.floor(rand() * 5),
      accColor: pick(ACC_COLORS, rand),
      eyeColor: pick(EYES, rand),
      hasAnimalEars: rand() < (rarity === 'Legendary' ? 0.58 : rarity === 'Rare' ? 0.34 : 0.18),
      faceMark: rand() < 0.28,
      expressionIndex: Math.floor(rand() * 4),
    };
    const imagePath = `/generated/presto-sidekicks/images/${pad(i)}.svg`;
    const metadata = {
      name: item.name,
      description: 'Presto Sidekicks is an original 111-piece Arc Testnet companion collection with weighted rarity, streetwear traits, and a compact anime-inspired silhouette built for Presto mint testing.',
      image: imagePath,
      external_url: '/generated/presto-sidekicks/gallery.html',
      attributes: [
        { trait_type: 'Rarity', value: item.rarity },
        { trait_type: 'Gender', value: item.gender },
        { trait_type: 'Archetype', value: item.archetype },
        { trait_type: 'Background', value: item.background },
        { trait_type: 'Hair', value: item.hair },
        { trait_type: 'Outfit', value: item.outfit },
        { trait_type: 'Accessory', value: item.accessory },
        { trait_type: 'Object', value: item.object },
      ],
    };
    await fs.writeFile(path.join(IMG, `${pad(i)}.svg`), renderCharacter(item), 'utf8');
    await fs.writeFile(path.join(META, `${i}.json`), JSON.stringify(metadata, null, 2), 'utf8');
    await fs.writeFile(path.join(META, String(i)), JSON.stringify(metadata, null, 2), 'utf8');
    items.push({ ...item, imagePath });
  }

  const cover = `<?xml version="1.0" encoding="UTF-8"?><svg width="800" height="520" viewBox="0 0 800 520" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="520" rx="28" fill="#101a2c"/><rect x="20" y="20" width="760" height="480" rx="24" fill="#152137" stroke="rgba(255,255,255,0.08)"/><text x="40" y="64" fill="#25c0f4" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" letter-spacing="3">PRESTO SIDEKICKS</text><text x="40" y="98" fill="#f8fafc" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="800">111 Arc-ready companion NFTs</text>${items.slice(0,6).map((item, idx) => `<image href="./images/${pad(idx)}.svg" x="${40 + (idx % 3) * 240}" y="${130 + Math.floor(idx / 3) * 170}" width="200" height="200" clip-path="inset(0 round 22px)"/>`).join('')}</svg>`;
  await fs.writeFile(path.join(ROOT, 'cover.svg'), cover, 'utf8');
  await fs.writeFile(path.join(ROOT, 'gallery.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Presto Sidekicks</title><style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:Inter,Arial,sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:40px 24px 80px}h1{font-size:42px;margin:0 0 12px}.lead{color:#94a3b8;max-width:760px;line-height:1.6}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:24px 0 32px}.pill,.card{border:1px solid rgba(255,255,255,.08);background:#17233a;border-radius:20px}.pill{padding:16px 18px}.pill strong{display:block;font-size:24px;color:#25c0f4}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}.card img{display:block;width:100%;aspect-ratio:1;object-fit:cover}.meta{padding:14px}.meta h3{margin:0 0 6px;font-size:17px}.meta p{margin:0;color:#94a3b8;font-size:13px}@media(max-width:760px){.stats{grid-template-columns:1fr 1fr}}</style></head><body><main class="wrap"><h1>Presto Sidekicks</h1><p class="lead">Original Arc Testnet collection pack with 111 NFTs, 55 archetypes, weighted rarity, and 30 percent female companions. Use this gallery to preview the deploy preset before you deploy.</p><section class="stats"><div class="pill"><strong>111</strong>Total supply</div><div class="pill"><strong>55</strong>Archetypes</div><div class="pill"><strong>33</strong>Female traits</div><div class="pill"><strong>6</strong>Legendary</div></section><section class="grid">${items.slice(0, 30).map((item, idx) => `<article class="card"><img src="./images/${pad(idx)}.svg" alt="${item.name}"/><div class="meta"><h3>${item.name}</h3><p>${item.rarity} · ${item.gender} · ${item.archetype}</p></div></article>`).join('')}</section></main></body></html>`, 'utf8');
  await fs.writeFile(path.join(ROOT, 'manifest.json'), JSON.stringify({ collection: { name: 'Presto Sidekicks', symbol: 'PSK', supply: TOTAL, archetypes: 55, female: FEMALE }, rarity: RARITY, items: items.map(({ id, name, rarity, gender, archetype, imagePath }) => ({ id, name, rarity, gender, archetype, imagePath })) }, null, 2), 'utf8');
  console.log(`Generated ${TOTAL} NFTs into ${ROOT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
