#!/usr/bin/env node
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']);
const COMMON_DIRS = [
  path.join(process.env.HOME || '/Users/charm', 'Downloads'),
  path.join(process.env.HOME || '/Users/charm', 'Desktop'),
  path.join(process.env.HOME || '/Users/charm', 'Pictures')
];

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);

main().catch(error => {
  console.error(`匯入失敗：${error.message}`);
  process.exit(1);
});

async function main() {
  if (args.help) {
    printHelp();
    return;
  }

  if (args.scan) {
    await scanRecent();
    return;
  }

  const sourceDir = args.source ? path.resolve(args.source) : null;
  if (!sourceDir) {
    throw new Error('請提供 --source 圖片資料夾，或先用 --scan 找最近的候選圖片。');
  }

  const slug = slugify(args.slug || path.basename(sourceDir));
  if (!slug) throw new Error('無法產生 slug，請用 --slug 指定英文/數字名稱。');

  const sourceImages = await collectImages(sourceDir);
  if (!sourceImages.length) throw new Error(`在 ${sourceDir} 找不到圖片。`);

  const limit = args.limit ? Number(args.limit) : sourceImages.length;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit 必須是正整數。');
  const selected = sourceImages.slice(0, limit);
  const title = args.title || path.basename(sourceDir);
  const subtitle = args.subtitle || `教師用隱藏頁：${selected.length} 頁繪本閱讀任務。`;
  const theme = normalizeTheme(args.theme || 'generic');
  const assetDir = path.join(projectRoot, 'assets', 'picturebooks', slug);
  const browserUrl = `picturebook-imported.html?lesson=${encodeURIComponent(slug)}`;

  await mkdir(assetDir, { recursive: true });
  const pages = [];
  for (let index = 0; index < selected.length; index += 1) {
    const source = selected[index];
    const ext = normalizeExt(path.extname(source.name));
    const file = `page-${String(index + 1).padStart(2, '0')}${ext}`;
    await copyFile(source.path, path.join(assetDir, file));
    pages.push(makePage({ index, file, theme }));
  }

  const config = {
    id: slug,
    title,
    subtitle,
    imageRoot: `assets/picturebooks/${slug}/`,
    storageKey: `picturebook:${slug}`,
    finishText: args.finish || '完成了！你已經把這本繪本看完，也練習了看圖、聽故事和回答問題。',
    pages
  };

  const lessonJs = `window.PICTUREBOOK_LESSON_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
  await writeFile(path.join(assetDir, 'lesson.js'), lessonJs, 'utf8');
  await writeFile(path.join(assetDir, 'import-summary.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    sourceDir,
    pageCount: pages.length,
    sourceFiles: selected.map(item => item.name),
    open: browserUrl
  }, null, 2), 'utf8');

  console.log(`已匯入 ${pages.length} 頁到 assets/picturebooks/${slug}/`);
  console.log(`開啟：${browserUrl}`);
  console.log('下一步：編輯 lesson.js 裡每頁的 title、text、companionLine 與 question。');
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--help' || item === '-h') out.help = true;
    else if (item === '--scan') out.scan = true;
    else if (item.startsWith('--')) {
      const key = item.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        index += 1;
      }
    }
  }
  return out;
}

async function scanRecent() {
  const candidates = [];
  for (const dir of COMMON_DIRS) {
    try {
      const images = await collectImages(dir, { recursive: false });
      candidates.push(...images);
    } catch {
      // Ignore missing common folders.
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  candidates.slice(0, 30).forEach(item => {
    const time = new Date(item.mtimeMs).toLocaleString('zh-TW', { hour12: false });
    console.log(`${time}  ${item.path}`);
  });
}

async function collectImages(dir, options = { recursive: true }) {
  const entries = await readdir(dir, { withFileTypes: true });
  const images = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (options.recursive) images.push(...await collectImages(fullPath, options));
      continue;
    }
    if (!entry.isFile() || !IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    const info = await stat(fullPath);
    images.push({ name: entry.name, path: fullPath, mtimeMs: info.mtimeMs });
  }
  return images.sort((a, b) => naturalCompare(a.name, b.name));
}

function makePage({ index, file, theme }) {
  const number = index + 1;
  const topic = THEMES[theme][index % THEMES[theme].length];
  return {
    image: file,
    title: `第 ${number} 頁`,
    text: `請在這裡改寫第 ${number} 頁的短句。`,
    fairy: topic.fairy,
    companionLine: topic.companionLine,
    question: {
      prompt: topic.prompt,
      choices: topic.choices,
      feedback: topic.feedback
    }
  };
}

function normalizeTheme(theme) {
  return Object.hasOwn(THEMES, theme) ? theme : 'generic';
}

function normalizeExt(ext) {
  return ext.toLowerCase() === '.jpeg' ? '.jpg' : ext.toLowerCase();
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function naturalCompare(left, right) {
  return left.localeCompare(right, 'zh-Hant-TW', { numeric: true, sensitivity: 'base' });
}

function printHelp() {
  console.log(`用法：
  node tools/import-picturebook.mjs --scan
  node tools/import-picturebook.mjs --source ~/Downloads/book --slug my-book --title "我的繪本"

選項：
  --source     圖片資料夾，會依檔名自然排序
  --slug       網址與資料夾名稱，只保留英文數字與連字號
  --title      繪本頁標題
  --subtitle   頁面副標
  --theme      generic | emotion | food
  --limit      只匯入前 N 張
  --finish     完成訊息
  --scan       列出 Downloads/Desktop/Pictures 最近圖片候選
`);
}

const THEMES = {
  generic: [
    {
      fairy: 'calm',
      companionLine: '先看圖片，再慢慢說出你看到的事情。',
      prompt: '這一頁可以先做什麼？',
      choices: [
        { label: '看圖片', icon: '👀', correct: true },
        { label: '亂按', icon: '🌀' },
        { label: '跑走', icon: '🏃' }
      ],
      feedback: '對，先看圖片，再慢慢讀。'
    },
    {
      fairy: 'happy',
      companionLine: '你可以用一句短短的話，說出這一頁發生什麼事。',
      prompt: '讀完一頁後，可以練習什麼？',
      choices: [
        { label: '說一句話', icon: '💬', correct: true },
        { label: '閉眼猜', icon: '🙈' },
        { label: '大聲吵', icon: '📢' }
      ],
      feedback: '很好，說一句話就是閱讀理解。'
    }
  ],
  emotion: [
    {
      fairy: 'angry',
      companionLine: '看看角色的臉和身體，猜猜現在的心情。',
      prompt: '看心情時，可以先看哪裡？',
      choices: [
        { label: '臉和身體', icon: '🙂', correct: true },
        { label: '頁碼', icon: '🔢' },
        { label: '按鈕', icon: '🔘' }
      ],
      feedback: '對，臉和身體會告訴我們很多心情線索。'
    },
    {
      fairy: 'calm',
      companionLine: '如果情緒很大，可以先停一下、慢慢呼吸。',
      prompt: '情緒很大時，第一步可以做什麼？',
      choices: [
        { label: '停一下', icon: '✋', correct: true },
        { label: '推人', icon: '🖐️' },
        { label: '丟東西', icon: '🧱' }
      ],
      feedback: '對，先停一下，身體會比較安全。'
    }
  ],
  food: [
    {
      fairy: 'happy',
      companionLine: '先看一看食物的顏色和樣子。',
      prompt: '吃之前可以先怎麼觀察？',
      choices: [
        { label: '看一看', icon: '👀', correct: true },
        { label: '亂丟掉', icon: '🗑️' },
        { label: '大聲叫', icon: '📢' }
      ],
      feedback: '很好，先看一看會比較安心。'
    },
    {
      fairy: 'calm',
      companionLine: '願意小小嘗試，就是很棒的進步。',
      prompt: '新食物可以先吃多少？',
      choices: [
        { label: '小小一口', icon: '🥄', correct: true },
        { label: '整盤吞', icon: '😵' },
        { label: '完全不看', icon: '🙈' }
      ],
      feedback: '對，小小一口也很勇敢。'
    }
  ]
};
