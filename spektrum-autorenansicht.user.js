// ==UserScript==
// @name         Spektrum CMS – Autorenansicht exportieren
// @namespace    https://www.spektrum.de/
// @version      0.2.1
// @description  Exportiert eine Spektrum-Artikelvorschau als einzelne HTML-Datei im Light Mode.
// @match        https://www.spektrum.de/sixcms/detail.php*
// @grant        GM_xmlhttpRequest
// @connect      static.spektrum.de
// @homepageURL  https://thisisbert.github.io/Spektrum-Userscripts/
// @supportURL   https://github.com/ThisIsBert/Spektrum-Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/spektrum-autorenansicht.user.js
// @downloadURL  https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/spektrum-autorenansicht.user.js
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '0.2.1';

    const FONT_BASE =
        'https://static.spektrum.de/js_css/assets/fonts/custom/';

    const FONT_FILES = [
        {
            weight: 300,
            style: 'normal',
            url: FONT_BASE + 'Roboto_Condensed-300-latin-normal.woff2'
        },
        {
            weight: 400,
            style: 'normal',
            url: FONT_BASE + 'Roboto_Condensed-400-latin-normal.woff2'
        },
        {
            weight: 700,
            style: 'normal',
            url: FONT_BASE + 'Roboto_Condensed-700-latin-normal.woff2'
        },
        {
            weight: 300,
            style: 'italic',
            url: FONT_BASE + 'Roboto_Condensed-300-latin-italic.woff2'
        },
        {
            weight: 400,
            style: 'italic',
            url: FONT_BASE + 'Roboto_Condensed-400-latin-italic.woff2'
        },
        {
            weight: 700,
            style: 'italic',
            url: FONT_BASE + 'Roboto_Condensed-700-latin-italic.woff2'
        }
    ];

    if (!document.querySelector('#main article.content')) {
        return;
    }

    createExportButton();

    // ============================================================
    // BUTTON
    // ============================================================

    function createExportButton() {

        if (document.getElementById('sdw-author-export-button')) {
            return;
        }

        const button = document.createElement('button');

        button.id = 'sdw-author-export-button';
        button.type = 'button';
        button.textContent = 'Autorenansicht speichern';

        Object.assign(button.style, {
            position: 'fixed',
            right: '18px',
            bottom: '18px',
            zIndex: '2147483647',
            padding: '11px 16px',
            border: '0',
            borderRadius: '6px',
            background: '#222',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0,0,0,.28)'
        });

        button.addEventListener('mouseenter', () => {
            button.style.background = '#444';
        });

        button.addEventListener('mouseleave', () => {
            button.style.background = '#222';
        });

        button.addEventListener('click', async () => {

            const oldText = button.textContent;

            try {

                button.disabled = true;

                button.textContent = 'Lade Styles und Schrift …';

                await exportArticle(status => {
                    button.textContent = status;
                });

                button.textContent = 'Gespeichert ✓';

                setTimeout(() => {
                    button.textContent = oldText;
                    button.disabled = false;
                }, 1800);

            } catch (error) {

                console.error('[Autorenansicht]', error);

                alert(
                    'Die Autorenansicht konnte nicht erzeugt werden.\n\n' +
                    (error?.message || error)
                );

                button.textContent = oldText;
                button.disabled = false;
            }
        });

        document.body.appendChild(button);
    }


    // ============================================================
    // EXPORT
    // ============================================================

    async function exportArticle(setStatus) {

        const originalArticle =
            document.querySelector('#main article.content');

        if (!originalArticle) {
            throw new Error('Artikel konnte nicht gefunden werden.');
        }

        // --------------------------------------------------------
        // CSS laden
        // --------------------------------------------------------

        setStatus('Lade Spektrum-CSS …');

        const stylesheetUrls =
            getStylesheetUrls();

        const cssParts = [];

        for (const url of stylesheetUrls) {

            try {

                let css = await gmGetText(url);

                /*
                 * Relative URL(...) innerhalb des CSS müssen absolut
                 * werden, weil das CSS später inline in file:// steckt.
                 */
                css = absolutizeCssUrls(css, url);

                /*
                 * Dunkle prefers-color-scheme-Regeln komplett entfernen.
                 */
                css = stripDarkModeMediaBlocks(css);

                cssParts.push(
                    `/* Quelle: ${url} */\n${css}`
                );

            } catch (error) {

                console.warn(
                    '[Autorenansicht] Stylesheet konnte nicht eingebettet werden:',
                    url,
                    error
                );
            }
        }

        // --------------------------------------------------------
        // Fonts laden
        // --------------------------------------------------------

        setStatus('Bette Schrift ein …');

        const embeddedFontCss =
            await buildEmbeddedFontCss();

        // --------------------------------------------------------
        // Artikel klonen
        // --------------------------------------------------------

        setStatus('Baue Autorenansicht …');

        const article =
            originalArticle.cloneNode(true);

        removeUnwantedElements(article);

        activateLazyImages(article);

        absolutizeUrls(article);

        convertGalleries(article);

        prepareIframes(article);

        cleanRuntimeStyles(article);

        const title =
            article.querySelector('h1')?.textContent.trim()
            ||
            document.title
            ||
            'Artikel';

        const logo =
            getLogo();

        const html =
            buildExportHtml({
                article,
                title,
                logo,
                originalCss: cssParts.join('\n\n'),
                embeddedFontCss
            });

        downloadHtml(
            html,
            makeFilename(title)
        );
    }


    // ============================================================
    // CSS HERUNTERLADEN
    // ============================================================

    function getStylesheetUrls() {

        return [
            ...new Set(
                [...document.querySelectorAll(
                    'link[rel="stylesheet"][href]'
                )]
                    .map(link => link.href)
                    .filter(Boolean)
            )
        ];
    }


    function gmGetText(url) {

        return new Promise((resolve, reject) => {

            GM_xmlhttpRequest({

                method: 'GET',
                url,

                onload(response) {

                    if (
                        response.status >= 200 &&
                        response.status < 300
                    ) {
                        resolve(response.responseText);
                    } else {
                        reject(
                            new Error(
                                `HTTP ${response.status}: ${url}`
                            )
                        );
                    }
                },

                onerror() {
                    reject(
                        new Error(
                            `Netzwerkfehler: ${url}`
                        )
                    );
                }
            });
        });
    }


    // ============================================================
    // FONT HERUNTERLADEN
    // ============================================================

    function gmGetArrayBuffer(url) {

        return new Promise((resolve, reject) => {

            GM_xmlhttpRequest({

                method: 'GET',
                url,
                responseType: 'arraybuffer',

                onload(response) {

                    if (
                        response.status >= 200 &&
                        response.status < 300
                    ) {

                        resolve(response.response);

                    } else {

                        reject(
                            new Error(
                                `HTTP ${response.status}: ${url}`
                            )
                        );
                    }
                },

                onerror() {

                    reject(
                        new Error(
                            `Netzwerkfehler: ${url}`
                        )
                    );
                }
            });
        });
    }


    async function arrayBufferToBase64(buffer) {

        const bytes =
            new Uint8Array(buffer);

        /*
         * Nicht alles auf einmal an String.fromCharCode übergeben,
         * sonst gibt es bei größeren Dateien ggf. Stackprobleme.
         */
        const CHUNK = 0x8000;

        let binary = '';

        for (
            let i = 0;
            i < bytes.length;
            i += CHUNK
        ) {

            binary += String.fromCharCode(
                ...bytes.subarray(
                    i,
                    Math.min(
                        i + CHUNK,
                        bytes.length
                    )
                )
            );
        }

        return btoa(binary);
    }


    async function buildEmbeddedFontCss() {

        const rules = [];

        for (const font of FONT_FILES) {

            try {

                const buffer =
                    await gmGetArrayBuffer(font.url);

                const base64 =
                    await arrayBufferToBase64(buffer);

                rules.push(`
@font-face {
    font-family: "Roboto Condensed";
    font-style: ${font.style};
    font-weight: ${font.weight};
    font-display: block;
    src: url("data:font/woff2;base64,${base64}") format("woff2");
}
`);

            } catch (error) {

                console.error(
                    '[Autorenansicht] Font konnte nicht eingebettet werden:',
                    font.url,
                    error
                );
            }
        }

        if (!rules.length) {

            throw new Error(
                'Roboto Condensed konnte nicht eingebettet werden.'
            );
        }

        return rules.join('\n');
    }


    // ============================================================
    // DARK-MODE-MEDIAQUERIES ENTFERNEN
    // ============================================================

    function stripDarkModeMediaBlocks(css) {

        /*
         * Entfernt komplette
         *
         * @media (... prefers-color-scheme: dark ...) { ... }
         *
         * Blöcke einschließlich verschachtelter Klammern.
         */

        let output = '';

        let pos = 0;

        while (pos < css.length) {

            const mediaPos =
                css.indexOf('@media', pos);

            if (mediaPos === -1) {

                output += css.slice(pos);
                break;
            }

            output +=
                css.slice(pos, mediaPos);

            const openBrace =
                findNextOpeningBrace(
                    css,
                    mediaPos + 6
                );

            if (openBrace === -1) {

                output +=
                    css.slice(mediaPos);

                break;
            }

            const condition =
                css
                    .slice(
                        mediaPos + 6,
                        openBrace
                    )
                    .toLowerCase();

            const endBrace =
                findMatchingBrace(
                    css,
                    openBrace
                );

            if (endBrace === -1) {

                output +=
                    css.slice(mediaPos);

                break;
            }

            const isDark =
                condition.includes(
                    'prefers-color-scheme'
                )
                &&
                condition.includes('dark');

            if (!isDark) {

                output +=
                    css.slice(
                        mediaPos,
                        endBrace + 1
                    );
            }

            pos =
                endBrace + 1;
        }

        return output;
    }


    function findNextOpeningBrace(css, start) {

        let quote = null;

        let inComment = false;

        for (
            let i = start;
            i < css.length;
            i++
        ) {

            const ch = css[i];
            const next = css[i + 1];

            if (inComment) {

                if (
                    ch === '*' &&
                    next === '/'
                ) {

                    inComment = false;
                    i++;
                }

                continue;
            }

            if (
                !quote &&
                ch === '/' &&
                next === '*'
            ) {

                inComment = true;
                i++;
                continue;
            }

            if (quote) {

                if (
                    ch === '\\'
                ) {

                    i++;
                    continue;
                }

                if (ch === quote) {
                    quote = null;
                }

                continue;
            }

            if (
                ch === '"' ||
                ch === "'"
            ) {

                quote = ch;
                continue;
            }

            if (ch === '{') {
                return i;
            }
        }

        return -1;
    }


    function findMatchingBrace(css, openPos) {

        let depth = 0;

        let quote = null;

        let inComment = false;

        for (
            let i = openPos;
            i < css.length;
            i++
        ) {

            const ch = css[i];
            const next = css[i + 1];

            if (inComment) {

                if (
                    ch === '*' &&
                    next === '/'
                ) {

                    inComment = false;
                    i++;
                }

                continue;
            }

            if (
                !quote &&
                ch === '/' &&
                next === '*'
            ) {

                inComment = true;
                i++;
                continue;
            }

            if (quote) {

                if (ch === '\\') {

                    i++;
                    continue;
                }

                if (ch === quote) {
                    quote = null;
                }

                continue;
            }

            if (
                ch === '"' ||
                ch === "'"
            ) {

                quote = ch;
                continue;
            }

            if (ch === '{') {
                depth++;
            }

            if (ch === '}') {

                depth--;

                if (depth === 0) {
                    return i;
                }
            }
        }

        return -1;
    }


    // ============================================================
    // CSS-URLS ABSOLUT MACHEN
    // ============================================================

    function absolutizeCssUrls(css, cssUrl) {

        return css.replace(
            /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
            (match, quote, rawUrl) => {

                const url =
                    rawUrl.trim();

                if (
                    !url ||
                    url.startsWith('data:') ||
                    url.startsWith('blob:') ||
                    url.startsWith('#')
                ) {
                    return match;
                }

                try {

                    const absolute =
                        new URL(
                            url,
                            cssUrl
                        ).href;

                    return `url("${absolute}")`;

                } catch {

                    return match;
                }
            }
        );
    }


    // ============================================================
    // NICHT BENÖTIGTE ELEMENTE
    // ============================================================

    function removeUnwantedElements(root) {

        const selectors = [

            'script',

            '[data-container-ad-unit-id]',

            '#pw-before-text-widget',
            '#pw-after-text-widget',

            '#civey-widget',

            '.kiosk__inline',

            '.content__share',

            '.comments',

            '[data-content="relatedarticles"]',

            '.callout.alert.show-for-print',

            '.content__meta__print',

            'form'
        ];

        selectors.forEach(selector => {

            root
                .querySelectorAll(selector)
                .forEach(el => el.remove());
        });

        root.querySelectorAll('div')
            .forEach(div => {

                const id =
                    (div.id || '')
                        .toLowerCase();

                if (
                    id.includes('ad-container') ||
                    id.includes('advertising') ||
                    id.startsWith('div-gpt-ad')
                ) {
                    div.remove();
                }
            });
    }


    // ============================================================
    // LAZY IMAGES
    // ============================================================

    function activateLazyImages(root) {

        root
            .querySelectorAll(
                'noscript.loading-lazy'
            )
            .forEach(noscript => {

                let raw =
                    noscript.textContent ||
                    noscript.innerHTML ||
                    '';

                raw = raw.trim();

                if (!raw) {

                    noscript.remove();
                    return;
                }

                const template =
                    document.createElement(
                        'template'
                    );

                try {

                    template.innerHTML =
                        raw;

                } catch {

                    return;
                }

                const img =
                    template.content
                        .querySelector('img');

                if (!img) {
                    return;
                }

                img.removeAttribute('loading');

                img.removeAttribute('data-src');

                img.removeAttribute(
                    'data-srcset'
                );

                noscript.replaceWith(img);
            });


        root.querySelectorAll('img')
            .forEach(img => {

                if (
                    !img.getAttribute('src')
                ) {

                    const lazySrc =
                        img.getAttribute(
                            'data-src'
                        )
                        ||
                        img.getAttribute(
                            'data-lazy-src'
                        );

                    if (lazySrc) {

                        img.setAttribute(
                            'src',
                            lazySrc
                        );
                    }
                }


                if (
                    !img.getAttribute('srcset')
                ) {

                    const lazySrcset =
                        img.getAttribute(
                            'data-srcset'
                        )
                        ||
                        img.getAttribute(
                            'data-lazy-srcset'
                        );

                    if (lazySrcset) {

                        img.setAttribute(
                            'srcset',
                            lazySrcset
                        );
                    }
                }

                img.removeAttribute('loading');
            });
    }


    // ============================================================
    // GALERIEN
    // ============================================================

    function convertGalleries(root) {

    const galleries = [
        ...root.querySelectorAll('.swiper__gallery')
    ];

    galleries.forEach((gallery, galleryIndex) => {

        /*
         * Swiper erzeugt bei loop=true zusätzliche Slides:
         *
         *   .swiper-slide-duplicate
         *
         * Außerdem tragen echte und geklonte Slides meist denselben
         * data-swiper-slide-index.
         *
         * Wir bauen deshalb zuerst eine Liste eindeutiger Originalslides.
         */

        const allSlides = [
            ...gallery.querySelectorAll('.swiper-slide')
        ];

        const slidesByIndex = new Map();
        const slidesWithoutIndex = [];

        allSlides.forEach(slide => {

            /*
             * Offensichtliche Swiper-Klone ignorieren.
             */
            if (
                slide.classList.contains('swiper-slide-duplicate')
            ) {
                return;
            }

            const swiperIndex =
                slide.getAttribute('data-swiper-slide-index');

            if (swiperIndex !== null) {

                /*
                 * Nur das erste Exemplar jedes logischen Slides übernehmen.
                 */
                if (!slidesByIndex.has(swiperIndex)) {
                    slidesByIndex.set(swiperIndex, slide);
                }

            } else {

                slidesWithoutIndex.push(slide);
            }
        });


        let originalSlides;

        if (slidesByIndex.size) {

            /*
             * Wichtig:
             * In die ursprüngliche Reihenfolge 0,1,2,... sortieren.
             */
            originalSlides = [
                ...slidesByIndex.entries()
            ]
                .sort(
                    (a, b) =>
                        Number(a[0]) - Number(b[0])
                )
                .map(entry => entry[1]);

        } else {

            /*
             * Fallback für Galerien ohne data-swiper-slide-index.
             */
            originalSlides =
                slidesWithoutIndex.length
                    ? slidesWithoutIndex
                    : allSlides.filter(
                        slide =>
                            !slide.classList.contains(
                                'swiper-slide-duplicate'
                            )
                    );
        }


        if (!originalSlides.length) {
            return;
        }


        const replacement =
            document.createElement('section');

        replacement.className =
            'sdw-author-gallery';


        const viewport =
            document.createElement('div');

        viewport.className =
            'sdw-author-gallery__viewport';


        const slidesContainer =
            document.createElement('div');

        slidesContainer.className =
            'sdw-author-gallery__slides';


        originalSlides.forEach(
            (oldSlide, index) => {

                const slide =
                    document.createElement('div');

                slide.className =
                    'sdw-author-gallery__slide';

                slide.dataset.slide =
                    String(index);

                if (index !== 0) {
                    slide.hidden = true;
                }


                /*
                 * Nur Inhalt des echten Slides übernehmen.
                 */
                [...oldSlide.childNodes]
                    .forEach(node => {

                        slide.appendChild(
                            node.cloneNode(true)
                        );
                    });


                /*
                 * Von Swiper gesetzte Runtime-Stile entfernen.
                 */
                slide
                    .querySelectorAll('[style]')
                    .forEach(el => {

                        el.style.removeProperty(
                            'transform'
                        );

                        el.style.removeProperty(
                            'left'
                        );
                    });


                slidesContainer.appendChild(
                    slide
                );
            }
        );


        viewport.appendChild(
            slidesContainer
        );


        const controls =
            document.createElement('div');

        controls.className =
            'sdw-author-gallery__controls';


        const previous =
            document.createElement('button');

        previous.type =
            'button';

        previous.className =
            'sdw-author-gallery__button';

        previous.dataset.galleryPrev =
            String(galleryIndex);

        previous.setAttribute(
            'aria-label',
            'Vorheriges Bild'
        );

        previous.textContent =
            '‹';


        const counter =
            document.createElement('div');

        counter.className =
            'sdw-author-gallery__counter';

        counter.textContent =
            `1 / ${originalSlides.length}`;


        const next =
            document.createElement('button');

        next.type =
            'button';

        next.className =
            'sdw-author-gallery__button';

        next.dataset.galleryNext =
            String(galleryIndex);

        next.setAttribute(
            'aria-label',
            'Nächstes Bild'
        );

        next.textContent =
            '›';


        controls.append(
            previous,
            counter,
            next
        );

        replacement.append(
            viewport,
            controls
        );

        gallery.replaceWith(
            replacement
        );
    });
}


    // ============================================================
    // IFRAMES / KARTEN
    // ============================================================

    function prepareIframes(root) {

        root.querySelectorAll('iframe')
            .forEach(iframe => {

                const src =
                    iframe.getAttribute('src');

                if (src) {

                    try {

                        iframe.src =
                            new URL(
                                src,
                                location.href
                            ).href;

                    } catch {
                        // lassen
                    }
                }

                iframe.removeAttribute(
                    'srcdoc'
                );

                iframe.style.width =
                    '100%';

                iframe.style.maxWidth =
                    '100%';

                iframe.style.border =
                    '0';

                if (
                    !iframe.getAttribute(
                        'height'
                    )
                ) {

                    iframe.setAttribute(
                        'height',
                        '600'
                    );
                }

                iframe.setAttribute(
                    'loading',
                    'eager'
                );
            });
    }


    // ============================================================
    // RUNTIME-STYLES ENTFERNEN
    // ============================================================

    function cleanRuntimeStyles(root) {

        root.querySelectorAll(
            '.swiper-wrapper, .swiper-slide, .swiper-container'
        )
            .forEach(el => {

                el.removeAttribute(
                    'style'
                );
            });
    }


    // ============================================================
    // HTML-URLS ABSOLUT
    // ============================================================

    function absolutizeUrls(root) {

        const attributes = [

            ['a', 'href'],
            ['img', 'src'],
            ['iframe', 'src'],
            ['source', 'src'],
            ['video', 'src'],
            ['audio', 'src']
        ];

        attributes.forEach(
            ([selector, attribute]) => {

                root
                    .querySelectorAll(
                        `${selector}[${attribute}]`
                    )
                    .forEach(el => {

                        const value =
                            el.getAttribute(
                                attribute
                            );

                        if (!value) {
                            return;
                        }

                        if (
                            value.startsWith('#') ||
                            value.startsWith(
                                'javascript:'
                            ) ||
                            value.startsWith(
                                'mailto:'
                            ) ||
                            value.startsWith(
                                'tel:'
                            ) ||
                            value.startsWith(
                                'data:'
                            )
                        ) {
                            return;
                        }

                        try {

                            el.setAttribute(
                                attribute,
                                new URL(
                                    value,
                                    location.href
                                ).href
                            );

                        } catch {
                            // lassen
                        }
                    });
            }
        );


        root.querySelectorAll('[srcset]')
            .forEach(el => {

                const srcset =
                    el.getAttribute(
                        'srcset'
                    );

                if (!srcset) {
                    return;
                }

                const absolute =
                    srcset
                        .split(',')
                        .map(part => {

                            const bits =
                                part
                                    .trim()
                                    .split(/\s+/);

                            const url =
                                bits.shift();

                            try {

                                bits.unshift(
                                    new URL(
                                        url,
                                        location.href
                                    ).href
                                );

                            } catch {

                                bits.unshift(
                                    url
                                );
                            }

                            return bits.join(' ');
                        })
                        .join(', ');

                el.setAttribute(
                    'srcset',
                    absolute
                );
            });


        root
            .querySelectorAll(
                'a[href^="javascript:"]'
            )
            .forEach(a => {

                a.removeAttribute('href');
            });
    }


    // ============================================================
    // LOGO
    // ============================================================

    function getLogo() {

        const logo =
            document.querySelector(
                '.header__top__logo'
            )
            ||
            document.querySelector(
                'header svg'
            );

        if (!logo) {

            return `
                <strong>Spektrum.de</strong>
            `;
        }

        const clone =
            logo.cloneNode(true);

        clone
            .querySelectorAll('a')
            .forEach(a => {

                a.removeAttribute(
                    'href'
                );
            });

        return clone.outerHTML;
    }


    // ============================================================
    // EXPORT-HTML
    // ============================================================

    function buildExportHtml({
        article,
        title,
        logo,
        originalCss,
        embeddedFontCss
    }) {

        const exportDate =
            new Intl.DateTimeFormat(
                'de-DE',
                {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }
            )
                .format(new Date());


        return `<!doctype html>

<html lang="de">

<head>

<meta charset="utf-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1"
>

<meta
    name="color-scheme"
    content="light"
>

<title>${escapeHtml(title)} – Autorenansicht</title>


<style>

/* ==========================================================
   ORIGINAL SPEKTRUM-CSS
   Dark-Mode-Mediaqueries wurden beim Export entfernt.
   ========================================================== */

${originalCss}


/* ==========================================================
   SCHRIFT
   Direkt in dieser HTML-Datei eingebettet.
   ========================================================== */

${embeddedFontCss}


/* ==========================================================
   LIGHT MODE FEST ERZWINGEN
   ========================================================== */

:root {
    color-scheme: light only !important;
}

html {
    background: #fff !important;
}

body {
    background: #fff !important;
    color: #222 !important;
}


/*
 * Roboto Condensed explizit setzen.
 *
 * Das Original-CSS darf für einzelne Elemente weiterhin
 * andere Fonts setzen, falls es das tatsächlich tut.
 */

article.content,
article.content p,
article.content li,
article.content figcaption {
    font-family:
        "Roboto Condensed",
        "DejaVu Sans Condensed Custom",
        Arial,
        sans-serif;
}


/* ==========================================================
   EXPORTKOPF
   ========================================================== */

.sdw-author-export-header {

    background: #fff;

    border-bottom:
        1px solid #ddd;

    padding:
        14px 20px;

    color: #333;
}


.sdw-author-export-header__inner {

    max-width:
        1170px;

    margin:
        0 auto;

    display:
        flex;

    align-items:
        center;

    justify-content:
        space-between;

    gap:
        20px;
}


.sdw-author-export-logo {

    width:
        220px;

    max-width:
        42vw;
}


.sdw-author-export-logo svg {

    display:
        block;

    width:
        100%;

    height:
        auto;
}


.sdw-author-export-note {

    font-family:
        "Roboto Condensed",
        Arial,
        sans-serif;

    font-size:
        13px;

    line-height:
        1.35;

    color:
        #666;

    text-align:
        right;
}


.sdw-author-export-note strong {
    color: #222;
}


/* ==========================================================
   GALERIE
   ========================================================== */

.sdw-author-gallery {

    position:
        relative;

    margin:
        2rem auto;

    width:
        100%;
}


.sdw-author-gallery__viewport {

    position:
        relative;

    width:
        100%;

    overflow:
        hidden;
}


.sdw-author-gallery__slide {
    width: 100%;
}


.sdw-author-gallery__slide[hidden] {

    display:
        none !important;
}


.sdw-author-gallery__slide figure {

    margin-top:
        0;

    margin-bottom:
        0;
}


.sdw-author-gallery__slide img {

    display:
        block;

    width:
        100%;

    height:
        auto;
}


.sdw-author-gallery__slide .img-wrapper {

    height:
        auto !important;

    min-height:
        0 !important;

    padding-bottom:
        0 !important;
}


.sdw-author-gallery__controls {

    display:
        flex;

    align-items:
        center;

    justify-content:
        center;

    gap:
        18px;

    padding:
        8px 0 4px;
}


.sdw-author-gallery__button {

    appearance:
        none;

    -webkit-appearance:
        none;

    border:
        1px solid #555;

    border-radius:
        50%;

    width:
        42px;

    height:
        42px;

    line-height:
        38px;

    font-family:
        Arial,
        sans-serif;

    font-size:
        32px;

    background:
        #fff;

    color:
        #333;

    cursor:
        pointer;

    padding:
        0 0 4px 0;
}


.sdw-author-gallery__button:hover {

    background:
        #eee;
}


.sdw-author-gallery__counter {

    min-width:
        65px;

    text-align:
        center;

    font-family:
        "Roboto Condensed",
        Arial,
        sans-serif;

    font-size:
        13px;

    color:
        #666;
}


.sdw-author-gallery .button__prev,
.sdw-author-gallery .button__next {

    display:
        none !important;
}


/* ==========================================================
   IFRAMES
   ========================================================== */

iframe {

    display:
        block;

    max-width:
        100%;

    margin-left:
        auto;

    margin-right:
        auto;
}


/* ==========================================================
   WERBERESTE
   ========================================================== */

[data-container-ad-unit-id] {

    display:
        none !important;
}


/* ==========================================================
   MOBIL
   ========================================================== */

@media (max-width: 640px) {

    .sdw-author-export-header__inner {
        display: block;
    }

    .sdw-author-export-note {

        margin-top:
            8px;

        text-align:
            left;
    }
}


/* ==========================================================
   DRUCK
   ========================================================== */

@media print {

    .sdw-author-export-header {

        display:
            none !important;
    }

    .sdw-author-gallery__controls {

        display:
            none !important;
    }

    .sdw-author-gallery__slide {

        display:
            block !important;

        page-break-inside:
            avoid;
    }
}

</style>

</head>


<body class="article">

<header class="sdw-author-export-header">

    <div class="sdw-author-export-header__inner">

        <div class="sdw-author-export-logo">
            ${logo}
        </div>

        <div class="sdw-author-export-note">

            <strong>
                Autorenansicht
            </strong>

            <br>

            Exportiert am
            ${escapeHtml(exportDate)}

        </div>

    </div>

</header>


<div id="page-wrap">

    <div id="main">

        ${article.outerHTML}

    </div>

</div>


<script>

(function () {

    'use strict';

    document
        .querySelectorAll(
            '.sdw-author-gallery'
        )
        .forEach(
            function (gallery) {

                var slides =
                    Array.from(
                        gallery.querySelectorAll(
                            '.sdw-author-gallery__slide'
                        )
                    );

                if (!slides.length) {
                    return;
                }

                var index =
                    0;

                var counter =
                    gallery.querySelector(
                        '.sdw-author-gallery__counter'
                    );

                var previous =
                    gallery.querySelector(
                        '[data-gallery-prev]'
                    );

                var next =
                    gallery.querySelector(
                        '[data-gallery-next]'
                    );


                function showSlide(
                    newIndex
                ) {

                    index =
                        newIndex;

                    if (index < 0) {

                        index =
                            slides.length - 1;
                    }

                    if (
                        index >=
                        slides.length
                    ) {

                        index =
                            0;
                    }

                    slides.forEach(
                        function (
                            slide,
                            i
                        ) {

                            slide.hidden =
                                i !== index;
                        }
                    );

                    if (counter) {

                        counter.textContent =
                            (index + 1) +
                            ' / ' +
                            slides.length;
                    }
                }


                if (previous) {

                    previous.addEventListener(
                        'click',
                        function () {

                            showSlide(
                                index - 1
                            );
                        }
                    );
                }


                if (next) {

                    next.addEventListener(
                        'click',
                        function () {

                            showSlide(
                                index + 1
                            );
                        }
                    );
                }


                gallery.tabIndex =
                    0;


                gallery.addEventListener(
                    'keydown',
                    function (event) {

                        if (
                            event.key ===
                            'ArrowLeft'
                        ) {

                            showSlide(
                                index - 1
                            );
                        }

                        if (
                            event.key ===
                            'ArrowRight'
                        ) {

                            showSlide(
                                index + 1
                            );
                        }
                    }
                );


                showSlide(0);
            }
        );

})();

<\/script>

</body>

</html>`;
    }


    // ============================================================
    // DOWNLOAD
    // ============================================================

    function downloadHtml(
        html,
        filename
    ) {

        const blob =
            new Blob(
                [html],
                {
                    type:
                        'text/html;charset=utf-8'
                }
            );

        const url =
            URL.createObjectURL(
                blob
            );

        const a =
            document.createElement(
                'a'
            );

        a.href =
            url;

        a.download =
            filename;

        document.body
            .appendChild(a);

        a.click();

        a.remove();

        setTimeout(
            () => {

                URL.revokeObjectURL(
                    url
                );

            },
            5000
        );
    }


    // ============================================================
    // DATEINAME
    // ============================================================

    function makeFilename(title) {

        const safe =
            title
                .normalize('NFKD')
                .replace(
                    /[^\p{L}\p{N}\s_-]/gu,
                    ''
                )
                .trim()
                .replace(
                    /\s+/g,
                    '_'
                )
                .replace(
                    /_+/g,
                    '_'
                )
                .slice(
                    0,
                    100
                );

        return (
            safe ||
            'Artikel'
        ) +
        '_Autorenansicht.html';
    }


    // ============================================================
    // ESCAPING
    // ============================================================

    function escapeHtml(value) {

        return String(value)

            .replace(
                /&/g,
                '&amp;'
            )

            .replace(
                /</g,
                '&lt;'
            )

            .replace(
                />/g,
                '&gt;'
            )

            .replace(
                /"/g,
                '&quot;'
            )

            .replace(
                /'/g,
                '&#039;'
            );
    }

})();