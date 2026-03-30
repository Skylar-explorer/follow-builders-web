#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const webDir = join(root, 'web');

async function loadDigest() {
  try {
    console.error('Fetching latest digest via prepare-digest.js...');
    const digestRaw = execSync(`${process.execPath} prepare-digest.js`, {
      cwd: join(root, 'scripts'),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(digestRaw);
  } catch (err) {
    console.error('prepare-digest.js failed, falling back to local feeds:', err.message);
    const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
      readFile(join(root, 'feed-x.json'), 'utf-8').then(JSON.parse).catch(() => ({ x: [] })),
      readFile(join(root, 'feed-podcasts.json'), 'utf-8').then(JSON.parse).catch(() => ({ podcasts: [] })),
      readFile(join(root, 'feed-blogs.json'), 'utf-8').then(JSON.parse).catch(() => ({ blogs: [] }))
    ]);
    return {
      status: 'ok',
      generatedAt: new Date().toISOString(),
      config: { language: 'en', frequency: 'daily', delivery: { method: 'stdout' } },
      podcasts: feedPodcasts?.podcasts || [],
      x: feedX?.x || [],
      blogs: feedBlogs?.blogs || [],
      stats: {
        podcastEpisodes: feedPodcasts?.podcasts?.length || 0,
        xBuilders: feedX?.x?.length || 0,
        totalTweets: (feedX?.x || []).reduce((sum, a) => sum + (a.tweets?.length || 0), 0),
        blogPosts: feedBlogs?.blogs?.length || 0
      }
    };
  }
}

async function main() {
  const digest = await loadDigest();

  const builders = digest.x || [];
  const podcasts = digest.podcasts || [];
  const blogs = digest.blogs || [];

  // Flatten tweets
  const tweets = [];
  for (const b of builders) {
    for (const t of b.tweets || []) {
      tweets.push({ ...t, builder: b });
    }
  }

  const data = {
    generatedAt: digest.generatedAt,
    builders,
    tweets,
    podcasts,
    blogs
  };

  const dataScript = `window.__FB_DATA__ = ${JSON.stringify(data)};`;

  const templatePath = join(__dirname, 'template.html');
  let html = await readFile(templatePath, 'utf-8');
  html = html.replace('/* DATA_SCRIPT */', dataScript);

  await mkdir(webDir, { recursive: true });
  await writeFile(join(webDir, 'index.html'), html);
  console.log('Built: ' + join(webDir, 'index.html'));
}

main().catch(err => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
