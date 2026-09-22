// ==UserScript==
// @name         Spektrum CMS – Autorenansicht exportieren
// @namespace    https://www.spektrum.de/
// @version      0.3.0
// @description  Exportiert Artikel mit Kommentarfunktion, optional eingebetteten Bildern und PDF-Druckansicht.
// @match        https://www.spektrum.de/sixcms/detail.php*
// @grant        GM_xmlhttpRequest
// @connect      static.spektrum.de
// @connect      spektrum.de
// @homepageURL  https://thisisbert.github.io/Spektrum-Userscripts/
// @supportURL   https://github.com/ThisIsBert/Spektrum-Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/spektrum-autorenansicht.user.js
// @downloadURL  https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/spektrum-autorenansicht.user.js
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '0.3.0';

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

        const options = document.createElement('div');
        Object.assign(options.style, {position: 'fixed', right: '18px', bottom: '70px', zIndex: '2147483647', padding: '8px 12px', background: '#fff', color: '#222', border: '1px solid #bbb', borderRadius: '4px', font: '14px Arial,sans-serif'});
        const label = document.createElement('label');
        const embedImages = document.createElement('input');
        embedImages.type = 'checkbox'; embedImages.checked = true;
        embedImages.id = 'sdw-author-embed-images';
        label.append(embedImages, document.createTextNode(' Bilder einbetten'));
        label.title = 'An: Bilder sind offline in der HTML-Datei enthalten. Aus: kleinere Datei; Bilder werden online nachgeladen.';
        options.appendChild(label); document.body.appendChild(options);

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
                embedImages.disabled = true;

                button.textContent = 'Lade Styles und Schrift …';

                await exportArticle(embedImages.checked, status => {
                    button.textContent = status;
                });

                button.textContent = 'Gespeichert ✓';

                setTimeout(() => {
                    button.textContent = oldText;
                    button.disabled = false;
                    embedImages.disabled = false;
                }, 1800);

            } catch (error) {

                console.error('[Autorenansicht]', error);

                alert(
                    'Die Autorenansicht konnte nicht erzeugt werden.\n\n' +
                    (error?.message || error)
                );

                button.textContent = oldText;
                button.disabled = false;
                embedImages.disabled = false;
            }
        });

        document.body.appendChild(button);
    }


    // ============================================================
    // EXPORT
    // ============================================================

    async function exportArticle(embedImages, setStatus) {

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

        const cache = new Map();
        await preparePortableContent(article, embedImages, cache, setStatus);
        const logoContainer = document.createElement('div');
        logoContainer.innerHTML = getLogo();
        await preparePortableContent(logoContainer, embedImages, cache, setStatus);
        const logo = logoContainer.innerHTML;
        setStatus('Bette Gestaltung ein …');
        const originalCss = await portableCss(cssParts.join('\n\n'), embedImages, cache);

        const html =
            buildExportHtml({
                article,
                title,
                logo,
                originalCss,
                embedImages,
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
                timeout: 45000,
                ontimeout() { reject(new Error('Zeitüberschreitung: ' + url)); },

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
                timeout: 45000,
                ontimeout() { reject(new Error('Zeitüberschreitung: ' + url)); },
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
        embedImages,
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' ${embedImages ? '' : 'https: http:'}; img-src data: ${embedImages ? '' : 'https: http:'}; font-src data:; base-uri 'none'; form-action 'none'">

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

${reviewCss()}
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
            <br>${embedImages ? 'Bilder eingebettet · offline lesbar' : 'Bilder werden online nachgeladen'}

        </div>

    </div>

</header>


${reviewMarkup()}

<div id="page-wrap">

    <div id="main">

        ${article.outerHTML}

    </div>

</div>


${reviewPanel()}
<script>(${reviewRuntime.toString()})();<\/script>

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
                                slides.findIndex(function (slide) { return !slide.hidden; }) - 1
                            );
                        }
                    );
                }


                if (next) {

                    next.addEventListener(
                        'click',
                        function () {

                            showSlide(
                                slides.findIndex(function (slide) { return !slide.hidden; }) + 1
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
                                slides.findIndex(function (slide) { return !slide.hidden; }) - 1
                            );
                        }

                        if (
                            event.key ===
                            'ArrowRight'
                        ) {

                            showSlide(
                                slides.findIndex(function (slide) { return !slide.hidden; }) + 1
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


    function assetDataUrl(url, cache) {
        if (/^data:/i.test(url)) return Promise.resolve(url);
        const absolute = new URL(url, location.href).href;
        if (!cache.has(absolute)) {
            cache.set(absolute, new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET', url: absolute, responseType: 'blob', timeout: 45000,
                    onload(response) {
                        if (response.status < 200 || response.status >= 300) {
                            reject(new Error(`Bild/Ressource konnte nicht eingebettet werden: HTTP ${response.status}: ${absolute}`)); return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(new Error(`Ressource konnte nicht gelesen werden: ${absolute}`));
                        reader.readAsDataURL(response.response);
                    },
                    onerror: () => reject(new Error(`Ressource konnte nicht geladen werden: ${absolute}`)),
                    ontimeout: () => reject(new Error(`Zeitüberschreitung beim Laden: ${absolute}`))
                });
            }));
        }
        return cache.get(absolute);
    }

    async function portableCss(css, embedImages, cache) {
        // Fonts are embedded separately. Imports must not trigger later requests.
        css = css.replace(/@font-face\s*\{[^}]*\}/gi, '').replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;/gi, '');
        const urls = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)];
        for (const match of urls) {
            const url = match[2].trim();
            if (!url || /^(data:|#)/i.test(url)) continue;
            // The site CSS also contains decorative assets unused in this article.
            // Omit inaccessible decorations; article image failures remain fatal.
            let replacement = 'none';
            if (!embedImages && /^https?:/i.test(url)) replacement = match[0];
            else {
                try { replacement = `url("${await assetDataUrl(url, cache)}")`; }
                catch (error) { console.warn('[Autorenansicht] Dekorative CSS-Ressource ausgelassen:', error); }
            }
            css = css.split(match[0]).join(replacement);
        }
        return css.replace(/<\/style/gi, '<\\/style');
    }

    async function preparePortableContent(root, embedImages, cache, setStatus) {
        root.querySelectorAll('script,style,link,base,meta,object,embed,foreignObject,noscript').forEach(el => el.remove());
        root.querySelectorAll('iframe,video,audio').forEach(node => {
            const rawUrl = node.getAttribute('src') || node.querySelector('source')?.getAttribute('src');
            const note = document.createElement('p');
            note.className = 'sdw-offline-note';
            note.textContent = 'Interaktiver Inhalt / Medium ist in dieser Autorenansicht nicht enthalten. ';
            if (rawUrl && /^https?:/i.test(rawUrl)) {
                const link = document.createElement('a'); link.href = rawUrl;
                link.textContent = 'Original online öffnen'; link.target = '_blank'; link.rel = 'noopener noreferrer';
                note.appendChild(link);
            }
            node.replaceWith(note);
        });
        const images = [...root.querySelectorAll('img')];
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            let src = img.getAttribute('src') || '';
            // Keep the largest offered variant instead of a tiny lazy-load placeholder.
            const candidates = (img.getAttribute('srcset') || '').split(',').map(part => {
                const bits = part.trim().split(/\s+/);
                return {url: bits[0], size: parseFloat(bits[1]) || 0};
            }).filter(item => item.url && !item.url.startsWith('data:'));
            if (candidates.length) src = candidates.sort((a, b) => b.size - a.size)[0].url;
            img.removeAttribute('srcset'); img.removeAttribute('sizes');
            img.closest('picture')?.querySelectorAll('source').forEach(node => node.remove());
            if (src) {
                setStatus(`Bilder ${i + 1}/${images.length} …`);
                img.setAttribute('src', embedImages ? await assetDataUrl(src, cache) : src);
            }
            img.setAttribute('loading', 'eager');
        }
        for (const node of [root, ...root.querySelectorAll('*')]) {
            for (const attr of [...node.attributes]) {
                if (/^on/i.test(attr.name) || /^(srcdoc|ping|autofocus|contenteditable)$/i.test(attr.name) || /^data-(?:src|lazy)/i.test(attr.name)) node.removeAttribute(attr.name);
                else if (/^(href|xlink:href|src|action|formaction)$/i.test(attr.name) && /^\s*(?:javascript|vbscript):/i.test(attr.value)) node.removeAttribute(attr.name);
            }
            if (node.hasAttribute('style')) node.setAttribute('style', await portableCss(absolutizeCssUrls(node.getAttribute('style'), location.href), embedImages, cache));
            if (node.matches('svg image')) {
                for (const attr of ['href', 'xlink:href']) {
                    const value = node.getAttribute(attr);
                    if (value && !value.startsWith('#') && embedImages) node.setAttribute(attr, await assetDataUrl(value, cache));
                }
            }
            if (node.matches('svg use')) {
                for (const attr of ['href', 'xlink:href']) {
                    const value = node.getAttribute(attr);
                    if (value && !value.startsWith('#')) node.removeAttribute(attr);
                }
            }
        }
    }

    // This function is serialized into the export; it must remain self-contained.
    function reviewRuntime() {
        'use strict';
        var article = document.querySelector('#main article.content');
        var panel = document.getElementById('sdw-review');
        var list = document.getElementById('sdw-review-list');
        var editor = document.getElementById('sdw-review-editor');
        var name = document.getElementById('sdw-review-name');
        var message = document.getElementById('sdw-review-message');
        var quote = document.getElementById('sdw-review-quote');
        var status = document.getElementById('sdw-review-status');
        var data = document.getElementById('sdw-review-data');
        var state;
        try { state = JSON.parse(data.textContent); }
        catch (_) { status.textContent = 'Kommentardaten konnten nicht gelesen werden. Bitte Originaldatei verwenden.'; return; }
        var pending = null, selected = null, replyTo = null, dirty = false;
        var excluded = 'script,style,.sdw-author-gallery__controls';
        name.value = state.name || '';
        function el(tag, text, className) {
            var node = document.createElement(tag);
            if (text !== undefined) node.textContent = text;
            if (className) node.className = className;
            return node;
        }
        function button(text, action) {
            var node = el('button', text);
            node.type = 'button';
            node.addEventListener('click', action);
            return node;
        }
        function index() {
            var walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
            var nodes = [], text = '', node;
            while ((node = walker.nextNode())) {
                if (node.parentElement.closest(excluded)) continue;
                nodes.push({node: node, start: text.length, end: text.length + node.length});
                text += node.data;
            }
            return {nodes: nodes, text: text};
        }
        function offset(container, position) {
            var range = document.createRange();
            range.selectNodeContents(article);
            range.setEnd(container, position);
            var fragment = range.cloneContents();
            fragment.querySelectorAll(excluded).forEach(function (node) { node.remove(); });
            return fragment.textContent.length;
        }
        function capture() {
            var selection = window.getSelection();
            if (!selection.rangeCount || selection.isCollapsed) return null;
            var range = selection.getRangeAt(0);
            if (!article.contains(range.startContainer) || !article.contains(range.endContainer)) return null;
            var text = index().text;
            var start = offset(range.startContainer, range.startOffset);
            var end = offset(range.endContainer, range.endOffset);
            if (!text.slice(start, end).trim()) return null;
            return {start: start, end: end, exact: text.slice(start, end), prefix: text.slice(Math.max(0, start - 48), start), suffix: text.slice(end, end + 48)};
        }
        document.addEventListener('selectionchange', function () {
            var anchor = capture();
            if (anchor) selected = anchor;
        });
        function locate(anchor, text) {
            if (!anchor || !anchor.exact) return null;
            if (text.slice(anchor.start, anchor.end) === anchor.exact &&
                (!anchor.prefix || text.slice(Math.max(0, anchor.start - anchor.prefix.length), anchor.start) === anchor.prefix) &&
                (!anchor.suffix || text.slice(anchor.end, anchor.end + anchor.suffix.length) === anchor.suffix)) return {start: anchor.start, end: anchor.end};
            var candidates = [], from = 0, pos;
            while ((pos = text.indexOf(anchor.exact, from)) !== -1) {
                candidates.push(pos); from = pos + 1;
            }
            var matches = candidates.filter(function (p) {
                return (!anchor.prefix || text.slice(Math.max(0, p - anchor.prefix.length), p) === anchor.prefix) &&
                    (!anchor.suffix || text.slice(p + anchor.exact.length, p + anchor.exact.length + anchor.suffix.length) === anchor.suffix);
            });
            var chosen = matches.length === 1 ? matches[0] : candidates.length === 1 ? candidates[0] : null;
            return chosen === null ? null : {start: chosen, end: chosen + anchor.exact.length};
        }
        function clearMarks(root) {
            root.querySelectorAll('mark[data-sdw-comments]').forEach(function (mark) { mark.replaceWith(document.createTextNode(mark.textContent)); });
            root.normalize();
        }
        function paint() {
            clearMarks(article);
            var map = index();
            var anchors = state.comments.map(function (comment, n) {
                var range = locate(comment.anchor, map.text);
                comment.unmatched = !range;
                return range && {start: range.start, end: range.end, id: comment.id, number: n + 1};
            }).filter(Boolean);
            map.nodes.forEach(function (entry) {
                var hits = anchors.filter(function (a) { return a.start < entry.end && a.end > entry.start; });
                if (!hits.length) return;
                var cuts = [entry.start, entry.end];
                hits.forEach(function (a) { cuts.push(Math.max(entry.start, a.start), Math.min(entry.end, a.end)); });
                cuts = Array.from(new Set(cuts)).sort(function (a, b) { return a - b; });
                var fragment = document.createDocumentFragment();
                cuts.slice(0, -1).forEach(function (start, n) {
                    var end = cuts[n + 1];
                    var active = hits.filter(function (a) { return a.start < end && a.end > start; });
                    var text = entry.node.data.slice(start - entry.start, end - entry.start);
                    if (!active.length) { fragment.appendChild(document.createTextNode(text)); return; }
                    var mark = el('mark', text);
                    mark.dataset.sdwComments = active.map(function (a) { return a.id; }).join(' ');
                    mark.title = 'Kommentar ' + active.map(function (a) { return a.number; }).join(', ');
                    mark.tabIndex = 0;
                    function focusComment() { document.getElementById('sdw-comment-' + active[0].id).focus(); }
                    mark.addEventListener('click', focusComment);
                    mark.addEventListener('keydown', function (event) { if (event.key === 'Enter') focusComment(); });
                    fragment.appendChild(mark);
                });
                entry.node.replaceWith(fragment);
            });
        }
        function reveal(comment) {
            var mark = Array.from(article.querySelectorAll('mark[data-sdw-comments]')).find(function (m) { return m.dataset.sdwComments.split(' ').includes(comment.id); });
            if (!mark) return;
            var slide = mark.closest('.sdw-author-gallery__slide');
            if (slide) {
                var gallery = slide.closest('.sdw-author-gallery');
                var slides = Array.from(gallery.querySelectorAll('.sdw-author-gallery__slide'));
                slides.forEach(function (s) { s.hidden = s !== slide; });
                gallery.querySelector('.sdw-author-gallery__counter').textContent = (slides.indexOf(slide) + 1) + ' / ' + slides.length;
            }
            mark.scrollIntoView({block: 'center'}); mark.focus({preventScroll: true});
        }
        function render() {
            paint(); list.replaceChildren();
            document.getElementById('sdw-review-count').textContent = 'Kommentare (' + state.comments.length + ')';
            if (!state.comments.length) list.appendChild(el('p', 'Noch keine Kommentare. Markieren Sie eine Textstelle im Artikel.'));
            state.comments.forEach(function (comment, n) {
                var card = el('section', undefined, 'sdw-review-card');
                card.id = 'sdw-comment-' + comment.id; card.tabIndex = -1;
                card.appendChild(el('h3', (n + 1) + '. ' + (comment.author || 'Ohne Namen')));
                card.appendChild(el('blockquote', comment.anchor.exact));
                card.appendChild(el('p', comment.text, 'sdw-review-text'));
                (comment.replies || []).forEach(function (reply) {
                    var item = el('div', undefined, 'sdw-review-reply');
                    item.appendChild(el('strong', reply.author || 'Ohne Namen'));
                    item.appendChild(el('p', reply.text, 'sdw-review-text')); card.appendChild(item);
                });
                if (comment.unmatched) card.appendChild(el('p', 'Textstelle nicht eindeutig gefunden; der Kommentar bleibt erhalten.'));
                var actions = el('div', undefined, 'sdw-review-actions');
                actions.appendChild(button('Textstelle zeigen', function () { reveal(comment); }));
                actions.appendChild(button('Antworten', function () { openEditor(null, comment.id); }));
                card.appendChild(actions); list.appendChild(card);
            });
        }
        function openEditor(anchor, id) {
            if (!editor.hidden && message.value.trim() && !window.confirm('Den noch nicht hinzugefügten Kommentar verwerfen?')) return;
            pending = anchor; replyTo = id;
            quote.textContent = anchor ? anchor.exact : 'Antwort auf Kommentar ' + (state.comments.findIndex(function (c) { return c.id === id; }) + 1);
            editor.hidden = false; message.value = '';
            panel.scrollIntoView({block: 'nearest'}); message.focus();
        }
        document.getElementById('sdw-review-add').addEventListener('mousedown', function (event) {
            var anchor = capture(); if (anchor) selected = anchor;
            event.preventDefault();
        });
        document.getElementById('sdw-review-add').addEventListener('click', function () {
            var anchor = capture() || selected;
            if (!anchor) { status.textContent = 'Bitte zuerst eine Textstelle im Artikel markieren.'; return; }
            openEditor(anchor, null);
        });
        document.getElementById('sdw-review-cancel').addEventListener('click', function () {
            if (message.value.trim() && !window.confirm('Diesen Entwurf verwerfen?')) return;
            message.value = ''; editor.hidden = true; pending = null; replyTo = null;
        });
        document.getElementById('sdw-review-submit').addEventListener('click', function () {
            if (!message.value.trim()) { message.focus(); return; }
            var entry = {author: name.value.trim(), text: message.value.trim(), date: new Date().toISOString()};
            if (replyTo) state.comments.find(function (c) { return c.id === replyTo; }).replies.push(entry);
            else {
                entry.id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
                entry.anchor = pending; entry.replies = []; state.comments.push(entry);
            }
            state.name = name.value; dirty = true; message.value = ''; editor.hidden = true;
            pending = null; replyTo = null; selected = null;
            window.getSelection().removeAllRanges(); render();
            status.textContent = 'Änderungen noch nicht als HTML gespeichert.';
        });
        function hasDraft() {
            if (!editor.hidden && message.value.trim()) {
                status.textContent = 'Bitte den Entwurf zuerst mit „Hinzufügen“ übernehmen oder abbrechen.';
                message.focus(); return true;
            }
            return false;
        }
        document.getElementById('sdw-review-save').addEventListener('click', function () {
            if (hasDraft()) return;
            state.name = name.value;
            var clone = document.documentElement.cloneNode(true);
            clearMarks(clone.querySelector('#main article.content'));
            clone.querySelector('#sdw-review-data').textContent = JSON.stringify(state).replace(/</g, '\\u003c');
            clone.querySelector('#sdw-review-list').replaceChildren();
            clone.querySelector('#sdw-review-editor').hidden = true;
            clone.querySelector('#sdw-review-message').textContent = '';
            clone.querySelector('#sdw-review-name').removeAttribute('value');
            clone.querySelector('#sdw-review-quote').textContent = '';
            clone.querySelector('#sdw-review-status').textContent = '';
            var url = URL.createObjectURL(new Blob(['<!doctype html>\n' + clone.outerHTML], {type: 'text/html;charset=utf-8'}));
            var link = el('a'); link.href = url;
            link.download = (document.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'Artikel') + '_kommentiert.html';
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
            dirty = false;
            status.textContent = 'HTML-Download gestartet. Bitte die Datei im Downloadordner prüfen und diese Fassung zurücksenden.';
        });
        document.getElementById('sdw-review-pdf').addEventListener('click', function () {
            if (hasDraft()) return;
            status.textContent = 'Im Druckdialog „Als PDF speichern“ wählen. Kommentare stehen am Ende des Artikels.';
            window.print();
        });
        window.addEventListener('beforeunload', function (event) {
            if (!dirty && !message.value.trim()) return;
            event.preventDefault(); event.returnValue = '';
        });
        render();
    }

    function reviewMarkup() {
        return `<nav id="sdw-review-toolbar" aria-label="Autorenkorrektur">
<strong>Spektrum – Autorenkorrektur</strong>
<p>Text im Artikel markieren, kommentieren und anschließend die kommentierte HTML-Datei speichern und zurücksenden.</p>
<div><button type="button" id="sdw-review-add">Kommentar hinzufügen</button>
<button type="button" id="sdw-review-save">Kommentierte Fassung speichern</button>
<button type="button" id="sdw-review-pdf">Als PDF speichern</button></div>
<p id="sdw-review-status" role="status" aria-live="polite"></p></nav>`;
    }

    function reviewPanel() {
        return `<aside id="sdw-review" aria-label="Kommentare">
<h2 id="sdw-review-count">Kommentare</h2>
<div id="sdw-review-editor" hidden>
<label for="sdw-review-name">Ihr Name (optional)</label><input id="sdw-review-name" type="text" autocomplete="name">
<blockquote id="sdw-review-quote"></blockquote>
<label for="sdw-review-message">Kommentar / Antwort</label><textarea id="sdw-review-message" rows="5"></textarea>
<button type="button" id="sdw-review-submit">Hinzufügen</button> <button type="button" id="sdw-review-cancel">Abbrechen</button>
</div><div id="sdw-review-list"></div></aside>
<script id="sdw-review-data" type="application/json">{"version":1,"name":"","comments":[]}<\/script>`;
    }

    function reviewCss() {
        return `
#sdw-review-toolbar, #sdw-review {font:16px/1.45 Arial,sans-serif;color:#222;background:#f5f6f7;box-sizing:border-box;text-align:left;}
#sdw-review-toolbar {padding:16px 24px;border-bottom:1px solid #bbb;position:sticky;top:0;z-index:10000;}
#sdw-review-toolbar p {font:14px/1.4 Arial,sans-serif;margin:6px 0;}
#sdw-review-toolbar button, #sdw-review button {font:14px/1.3 Arial,sans-serif;padding:9px 12px;margin:3px 3px 3px 0;color:#fff;background:#235b6c;border:1px solid #235b6c;border-radius:4px;cursor:pointer;height:auto;}
#sdw-review-toolbar button:focus-visible, #sdw-review button:focus-visible, #sdw-review input:focus, #sdw-review textarea:focus {outline:3px solid #dc8700;outline-offset:2px;}
#sdw-review {padding:20px;max-width:1100px;margin:20px auto;}
#sdw-review h2 {font:bold 20px/1.3 Arial,sans-serif;margin:0 0 16px;}
#sdw-review h3 {font:bold 16px/1.4 Arial,sans-serif;margin:0 0 10px;}
#sdw-review p {font:16px/1.45 Arial,sans-serif;margin:8px 0;}
#sdw-review blockquote {font:italic 14px/1.4 Arial,sans-serif;border-left:3px solid #d6a52c;margin:12px 0;padding:6px 10px;color:#555;max-height:140px;overflow:auto;white-space:pre-wrap;}
#sdw-review input, #sdw-review textarea {display:block;box-sizing:border-box;width:100%;font:16px/1.4 Arial,sans-serif;color:#222;background:#fff;border:1px solid #888;padding:8px;margin:6px 0 12px;}
#sdw-review [hidden] {display:none!important;}
.sdw-review-card {background:#fff;border:1px solid #ccc;padding:14px;margin:12px 0;overflow-wrap:anywhere;scroll-margin-top:160px;}
.sdw-review-card:focus {outline:3px solid #d6a52c;}
.sdw-review-text {white-space:pre-wrap;}
.sdw-review-reply {border-left:2px solid #ccc;padding-left:12px;margin-top:16px;}
mark[data-sdw-comments] {background:#ffe19a;color:inherit;cursor:pointer;scroll-margin-top:180px;}
mark[data-sdw-comments]:focus {outline:2px solid #9b6200;}
.sdw-offline-note {padding:16px;border:1px solid #aaa;background:#f5f6f7;color:#333;}
@media(min-width:1400px) {body.article {padding-right:350px;} #sdw-review {position:fixed;right:0;top:0;bottom:0;width:350px;margin:0;overflow:auto;z-index:10001;border-left:1px solid #ccc;}}
@media print {
body.article {padding-right:0!important;}
#sdw-review-toolbar, #sdw-review-editor, .sdw-review-actions {display:none!important;}
#sdw-review {position:static!important;width:auto!important;max-width:none!important;overflow:visible!important;background:white;break-before:page;margin:0;padding:0;}
#sdw-review-list, .sdw-review-card, .sdw-review-text, .sdw-review-reply {display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;}
#sdw-review blockquote {max-height:none;overflow:visible;}
.sdw-review-card {break-inside:auto;border:1px solid #aaa;}
#main article.content {width:100%!important;max-width:none!important;color:#222!important;}
.sdw-author-gallery__slide[hidden] {display:block!important;}
.sdw-author-gallery__viewport {overflow:visible!important;}
mark[data-sdw-comments] {text-decoration:underline;text-decoration-style:dotted;background:#fff2c9!important;print-color-adjust:exact;}
@page {margin:15mm;}
}`;
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
