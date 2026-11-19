// How front/public (CSS, JS, images, fonts) is served. Used by server.js.
//
//   asset('/css/index.css')  ->  '/css/index.css?v=lq3k9z'
//     Views link files through this (partials/head.ejs). The ?v= changes
//     whenever the file changes, so browsers can cache files for a year and
//     still get edits right away.
//
//   cssBundle(['base', 'pantry', ...])  ->  '/css/bundle.css?files=base,pantry&v=...'
//     One stylesheet per page instead of six or seven separate downloads that
//     each hold up the first paint. The files stay separate in front/public/css;
//     serveCssBundle joins them in the order given.
//
//   serveImages             WebP for browsers that accept it
//     scripts/optimizeImages.js writes x.webp next to every x.jpg/.png.
//     A request for /images/x.jpg gets x.webp when the browser sends
//     Accept: image/webp, so CSS, views, JS and recipes.image_path in the
//     database can keep pointing at the .jpg.
//
//   srcset('/images/recipes/pasta.jpg')
//     -> 'srcset="/images/recipes/pasta-480.jpg 480w, ...-960.jpg 960w, ....jpg 1600w"'
//     for images that have smaller copies, so the browser downloads the
//     smallest one that is sharp at its size. Empty for anything else
//     (e.g. a full https:// URL).
import express from 'express'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const publicPath = fileURLToPath(new URL('../../front/public', import.meta.url))

// Every file under front/public, as '/images/x.jpg', read once at startup.
const files = new Set(
  readdirSync(publicPath, { recursive: true }).map((file) => '/' + file.split('\\').join('/'))
)

// Widths scripts/optimizeImages.js makes: x-480.jpg, x-960.jpg and x.jpg itself (at most 1600)
export const SIZES = [480, 960]
export const LARGE_WIDTH = 1600
export const sizedName = (url, width) => url.replace(/\.(jpe?g|png)$/i, `-${width}.$1`)

const version = (url) => {
  try {
    return Math.round(statSync(join(publicPath, url)).mtimeMs)
  } catch {
    return 0 // missing file: it 404s normally
  }
}

export function asset(url) {
  return `${url}?v=${version(url).toString(36)}`
}

export function cssBundle(names) {
  const v = Math.max(...names.map((name) => version(`/css/${name}.css`)))
  return `/css/bundle.css?files=${names.join(',')}&v=${v.toString(36)}`
}

const bundles = new Map() // '<files>|<v>' -> joined CSS, so each is read from disk once

export function serveCssBundle(req, res, next) {
  const names = String(req.query.files ?? '').split(',')
  if (!names.every((name) => files.has(`/css/${name}.css`))) return next()
  const key = `${req.query.files}|${req.query.v}`
  if (!bundles.has(key)) {
    bundles.set(key, names.map((name) => `/* ${name}.css */\n${readFileSync(join(publicPath, 'css', `${name}.css`), 'utf8')}`).join('\n'))
  }
  res.type('css').set('Cache-Control', CACHE_FOREVER).send(bundles.get(key))
}

// The srcset list on its own, for JSON (js/index.js sets img.srcset from it)
export function srcsetList(url) {
  if (!url || !files.has(sizedName(url, SIZES[0]))) return ''
  return [...SIZES.map((w) => `${sizedName(url, w)} ${w}w`), `${url} ${LARGE_WIDTH}w`].join(', ')
}

export function srcset(url) {
  const list = srcsetList(url)
  return list && `srcset="${list}"`
}

export function serveImages(req, res, next) {
  const webp = req.path.replace(/\.(jpe?g|png)$/i, '.webp')
  if (webp !== req.path && files.has(webp)) {
    res.vary('Accept')
    if (req.get('accept')?.includes('image/webp')) req.url = req.url.replace(req.path, webp)
  }
  next()
}

// Files linked with ?v= and fonts never change, so they're cached for a year.
// Anything else (CSS url(), recipe photos from the database) for a week.
const CACHE_FOREVER = 'public, max-age=31536000, immutable'
export const serveStatic = express.static(publicPath, {
  setHeaders(res, path) {
    res.set('Cache-Control', res.req.query.v || path.endsWith('.woff2') ? CACHE_FOREVER : 'public, max-age=604800')
  },
})
