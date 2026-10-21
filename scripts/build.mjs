// Static site generator: content/<lang>/*.md -> dist/
// Writes per-language index pages, article pages with hreflang alternates,
// sitemap.xml (with xhtml:link alternates), robots.txt and 404.html.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const OUT = path.join(ROOT, 'dist');
const langs = Object.keys(config.langs);
const base = config.basePath.replace(/\/$/, '');
const origin = config.siteUrl.replace(/\/$/, '');

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rel = (p) => `${base}${p}`;
const abs = (p) => `${origin}${base}${p}`;
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

function fail(msg) {
  console.error(`build error: ${msg}`);
  process.exit(1);
}

// ---- load posts ----
const posts = [];
for (const lang of langs) {
  const dir = path.join(ROOT, 'content', lang);
  if (!fs.existsSync(dir)) continue;
  const seen = new Set();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const { data, content } = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (data.draft) continue;
    for (const k of ['title', 'description', 'date']) if (!data[k]) fail(`${lang}/${file} is missing "${k}"`);
    const slug = data.slug || file.replace(/\.md$/, '');
    if (!/^[a-z0-9-]+$/.test(slug)) fail(`${lang}/${file}: slug "${slug}" must be lowercase a-z, 0-9 and dashes`);
    if (seen.has(slug)) fail(`${lang}: duplicate slug "${slug}"`);
    seen.add(slug);
    const words = content.split(/\s+/).filter(Boolean).length;
    posts.push({
      lang,
      slug,
      key: data.key || slug,
      title: data.title,
      description: data.description,
      date: isoDate(data.date),
      updated: data.updated ? isoDate(data.updated) : isoDate(data.date),
      tags: data.tags || [],
      cover: data.cover,
      coverAlt: data.coverAlt || data.title,
      coverCredit: data.coverCredit,
      html: marked.parse(content),
      readingMinutes: Math.max(1, Math.round((lang === 'ja' ? content.length / 600 : words / 220))),
      url: `/${lang}/${slug}/`,
    });
  }
}
posts.sort((a, b) => (a.date < b.date ? 1 : -1));
const byKey = new Map();
for (const p of posts) byKey.set(p.key, [...(byKey.get(p.key) || []), p]);

// ---- templates ----
function alternates(versions) {
  // versions: [{lang, url}]
  if (versions.length < 2) return '';
  const def = versions.find((v) => v.lang === config.defaultLang) || versions[0];
  return [
    ...versions.map((v) => `<link rel="alternate" hreflang="${config.langs[v.lang].hreflang}" href="${abs(v.url)}">`),
    `<link rel="alternate" hreflang="x-default" href="${abs(def.url)}">`,
  ].join('\n');
}

function layout({ lang, title, description, url, body, versions = [], jsonLd, image, type = 'website' }) {
  const L = config.langs[lang];
  const switcher = langs
    .map((l) => {
      const v = versions.find((x) => x.lang === l);
      const href = v ? v.url : `/${l}/`;
      return l === lang
        ? `<span aria-current="true">${esc(config.langs[l].label)}</span>`
        : `<a href="${rel(href)}" hreflang="${config.langs[l].hreflang}" lang="${config.langs[l].hreflang}">${esc(config.langs[l].label)}</a>`;
    })
    .join('');
  return `<!doctype html>
<html lang="${L.hreflang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(url)}">
${alternates(versions)}
${config.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">` : ''}
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(url)}">
<meta property="og:site_name" content="${esc(L.title)}">
<meta property="og:locale" content="${L.hreflang}">
${image ? `<meta property="og:image" content="${abs(image)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<link rel="icon" href="${rel('/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${rel('/style.css')}">
<link rel="alternate" type="application/rss+xml" title="${esc(L.title)}" href="${rel(`/${lang}/rss.xml`)}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header class="site-header"><div class="wrap">
<a class="brand" href="${rel(`/${lang}/`)}">${esc(L.title)}</a>
<nav class="langs" aria-label="Language">${switcher}</nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site-footer"><div class="wrap">© ${new Date().getFullYear()} ${esc(L.title)}</div></footer>
</body>
</html>
`;
}

function card(p) {
  const L = config.langs[p.lang];
  return `<article class="card">
${p.cover ? `<a href="${rel(p.url)}"><img src="${rel(p.cover)}" alt="${esc(p.coverAlt)}" loading="lazy" width="1200" height="630"></a>` : ''}
<h2><a href="${rel(p.url)}">${esc(p.title)}</a></h2>
<p>${esc(p.description)}</p>
<p class="meta"><time datetime="${p.date}">${p.date}</time> · <a href="${rel(p.url)}">${esc(L.readMore)} →</a></p>
</article>`;
}

function write(urlPath, html) {
  const file = path.join(OUT, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---- build ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

const sitemap = []; // {url, lastmod, versions}

for (const p of posts) {
  const L = config.langs[p.lang];
  const versions = (byKey.get(p.key) || []).map((v) => ({ lang: v.lang, url: v.url }));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.description,
    datePublished: p.date,
    dateModified: p.updated,
    inLanguage: L.hreflang,
    mainEntityOfPage: abs(p.url),
    author: { '@type': 'Organization', name: L.title, url: abs(`/${p.lang}/`) },
    publisher: { '@type': 'Organization', name: L.title },
    ...(p.cover ? { image: abs(p.cover) } : {}),
  };
  const body = `<article class="post">
<p class="crumbs"><a href="${rel(`/${p.lang}/`)}">${esc(L.home)}</a></p>
<h1>${esc(p.title)}</h1>
<p class="meta"><time datetime="${p.date}">${p.date}</time>${p.updated !== p.date ? ` · ${esc(L.updated)} <time datetime="${p.updated}">${p.updated}</time>` : ''} · ${p.readingMinutes} ${esc(L.minRead)}</p>
${p.cover ? `<figure><img src="${rel(p.cover)}" alt="${esc(p.coverAlt)}" width="1200" height="630">${p.coverCredit ? `<figcaption>${p.coverCredit}</figcaption>` : ''}</figure>` : ''}
<div class="prose">${p.html}</div>
</article>`;
  write(p.url, layout({ lang: p.lang, title: `${p.title} | ${L.title}`, description: p.description, url: p.url, body, versions, jsonLd, image: p.cover, type: 'article' }));
  sitemap.push({ url: p.url, lastmod: p.updated, versions });
}

const homeVersions = langs.map((l) => ({ lang: l, url: `/${l}/` }));
for (const lang of langs) {
  const L = config.langs[lang];
  const list = posts.filter((p) => p.lang === lang);
  const body = `<section class="hero"><h1>${esc(L.title)}</h1><p>${esc(L.tagline)}</p></section>
<h2 class="section-title">${esc(L.latest)}</h2>
<div class="cards">${list.map(card).join('\n')}</div>`;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: L.title, url: abs(`/${lang}/`), inLanguage: L.hreflang };
  write(`/${lang}/`, layout({ lang, title: `${L.title} | ${L.tagline}`, description: L.tagline, url: `/${lang}/`, body, versions: homeVersions, jsonLd }));
  sitemap.push({ url: `/${lang}/`, lastmod: list[0]?.updated, versions: homeVersions });

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(L.title)}</title><link>${abs(`/${lang}/`)}</link><description>${esc(L.tagline)}</description><language>${L.hreflang}</language>
${list.slice(0, 30).map((p) => `<item><title>${esc(p.title)}</title><link>${abs(p.url)}</link><guid>${abs(p.url)}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join('\n')}
</channel></rss>
`;
  write(`/${lang}/rss.xml`, rss);
}

// Root: language chooser. Visitors are sent to their browser language; crawlers follow the links.
const def = config.langs[config.defaultLang];
write('/', `<!doctype html>
<html lang="${def.hreflang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(def.title)}</title>
<meta name="description" content="${esc(def.tagline)}">
<link rel="canonical" href="${abs('/')}">
${homeVersions.map((v) => `<link rel="alternate" hreflang="${config.langs[v.lang].hreflang}" href="${abs(v.url)}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${abs('/')}">
${config.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">` : ''}
<link rel="icon" href="${rel('/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${rel('/style.css')}">
<script>
(function(){var l=(navigator.languages||[navigator.language||'']).map(function(x){return x.slice(0,2)});
var a=${JSON.stringify(langs)};for(var i=0;i<l.length;i++){if(a.indexOf(l[i])>=0){location.replace(${JSON.stringify(base)}+'/'+l[i]+'/');return}}
location.replace(${JSON.stringify(`${base}/${config.defaultLang}/`)});})();
</script>
</head>
<body><main class="wrap chooser">
${langs.map((l) => `<a href="${rel(`/${l}/`)}" hreflang="${config.langs[l].hreflang}" lang="${config.langs[l].hreflang}">${esc(config.langs[l].title)} · ${esc(config.langs[l].label)}</a>`).join('\n')}
</main></body></html>
`);

write('/404.html', layout({ lang: config.defaultLang, title: `404 | ${def.title}`, description: def.tagline, url: '/404.html', body: `<section class="hero"><h1>404</h1><p>${langs.map((l) => `<a href="${rel(`/${l}/`)}">${esc(config.langs[l].title)}</a>`).join(' · ')}</p></section>` }));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemap
  .map(
    (e) => `<url><loc>${abs(e.url)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}${
      e.versions.length > 1 ? e.versions.map((v) => `<xhtml:link rel="alternate" hreflang="${config.langs[v.lang].hreflang}" href="${abs(v.url)}"/>`).join('') : ''
    }</url>`
  )
  .join('\n')}
</urlset>
`;
write('/sitemap.xml', xml);
write('/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);

console.log(`built ${posts.length} posts in ${langs.length} languages -> dist/`);
