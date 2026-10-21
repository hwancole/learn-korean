# Learn Korean

Multilingual static blog, published on GitHub Pages.

- Posts live in `content/<lang>/<slug>.md` (`en`, `es`).
- `npm run build` writes the site to `dist/` with per-language pages, hreflang alternates, `sitemap.xml`, RSS and `robots.txt`.
- Every push to `main` deploys via `.github/workflows/deploy.yml`.
- Site URL, base path, languages and the optional `googleSiteVerification` token are in `site.config.json`.

## Post front matter

```yaml
title: "..."            # required, under ~65 characters for search results when possible
description: "..."      # required, ~120-160 characters, answers the search query
date: 2026-10-20        # required
updated: 2026-11-02     # optional, set when facts are revised
key: seoul-subway-guide # same key across languages links translations (hreflang)
slug: seoul-subway-guide # optional, defaults to the file name; lowercase a-z, 0-9, dashes
tags: [transport, seoul]
cover: /images/<file>   # optional, file in public/images
coverAlt: "..."
coverCredit: "Photo by <a href=...>Name</a> on Unsplash"  # required for stock photos
draft: true             # optional, skips the post
```

## Writing rules (for every post, human or automated)

1. One post answers one real search question that travelers ask. Check the topic is not already covered in that language.
2. Write natively for each language's readers (use examples, prices and comparisons that fit that audience). Never publish a raw machine translation.
3. Verify prices, hours, rules and addresses against at least one official or recent source. State "as of <month year>" for anything that changes.
4. No invented first-person experiences, reviews, quotes or statistics.
5. Minimum ~800 words (en) of useful content; lead with a short direct answer, then details, tables, steps and an FAQ.
6. Stock photos must carry the photographer credit; generated graphics go in `public/images`.
7. `npm run build` must pass before publishing.
