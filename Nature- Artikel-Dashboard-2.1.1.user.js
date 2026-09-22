// ==UserScript==
// @name         Nature: Artikel-Dashboard
// @namespace    https://www.nature.com/
// @version      2.1.1
// @description  Kopiert Artikeltext, Übersetzungsquelle und alphabetisch sortierte References im Spektrum-Format.
// @match        https://www.nature.com/articles/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const ARTICLE_SELECTORS = [
        '.c-article-body',
        '[data-container-type="article-body"]',
        'article .article-body',
        'main article'
    ];

    const REMOVE_SELECTORS = [
        'figure',
        'picture',
        'img',
        'video',
        'audio',
        'canvas',
        'svg',
        'figcaption',
        'aside',
        '[role="complementary"]',
        '[data-component*="related"]',
        '[data-test*="related"]',
        '[class*="related"]',
        '[class*="Related"]',
        '[class*="recommend"]',
        '[class*="Recommend"]',
        '[class*="advert"]',
        '[class*="Advert"]',
        '.c-ad',
        '.advertisement',
        'button',
        'form',
        'input',
        'select',
        'textarea',
        'nav',
        'script',
        'style',
        'noscript',
        'template',
        '[hidden]',
        '[aria-hidden="true"]'
    ];

    const RELATED_HEADINGS = new Set([
        'related',
        'related article',
        'related articles',
        'related content',
        'related story',
        'related stories',
        'recommended',
        'recommended articles',
        'you may also like'
    ]);

    const IDS = {
        dashboard: 'nature-copy-dashboard',
        length: 'nature-copy-length',
        status: 'nature-copy-status',
        copy: 'nature-copy-article-button',
        source: 'nature-copy-source-button',
        references: 'nature-copy-references-button'
    };

    let statusTimer = 0;
    let updateTimer = 0;

    function cleanInlineText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeText(value) {
        return cleanInlineText(value)
            .replace(/[:：]\s*$/, '')
            .toLowerCase();
    }

    function findArticleBody() {
        for (const selector of ARTICLE_SELECTORS) {
            const element = document.querySelector(selector);

            if (element) {
                return element;
            }
        }

        return null;
    }

    function removeRelatedBoxesByHeading(clone) {
        clone
            .querySelectorAll(
                'h2, h3, h4, h5, h6, strong, [role="heading"]'
            )
            .forEach(heading => {
                if (
                    !RELATED_HEADINGS.has(
                        normalizeText(heading.textContent)
                    )
                ) {
                    return;
                }

                const box = heading.closest([
                    'aside',
                    'section',
                    '[role="complementary"]',
                    '[class*="related"]',
                    '[class*="Related"]',
                    '[class*="recommend"]',
                    '[class*="Recommend"]',
                    '[data-component*="related"]',
                    '[data-test*="related"]'
                ].join(','));

                if (box && box !== clone) {
                    box.remove();
                } else if (
                    heading.parentElement &&
                    heading.parentElement !== clone
                ) {
                    heading.parentElement.remove();
                }
            });
    }

    function cleanArticleText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function extractArticleText() {
        const articleBody = findArticleBody();

        if (!articleBody) {
            throw new Error(
                'Der Artikeltext wurde auf dieser Seite nicht gefunden.'
            );
        }

        const clone = articleBody.cloneNode(true);

        clone
            .querySelectorAll(REMOVE_SELECTORS.join(','))
            .forEach(element => {
                element.remove();
            });

        removeRelatedBoxesByHeading(clone);

        clone.querySelectorAll('a').forEach(link => {
            link.replaceWith(
                document.createTextNode(
                    link.textContent || ''
                )
            );
        });

        clone
            .querySelectorAll(
                'h1, h2, h3, h4, h5, h6, p, blockquote, li'
            )
            .forEach(element => {
                element.insertAdjacentText(
                    'beforeend',
                    '\n\n'
                );
            });

        clone.querySelectorAll('br').forEach(element => {
            element.replaceWith(
                document.createTextNode('\n')
            );
        });

        return cleanArticleText(
            clone.innerText ||
            clone.textContent ||
            ''
        );
    }

    function getMetaContent(selectors) {
        for (const selector of selectors) {
            const content = document
                .querySelector(selector)
                ?.getAttribute('content')
                ?.trim();

            if (content) {
                return content;
            }
        }

        return '';
    }

    function normalizeDoi(value) {
        if (!value) {
            return '';
        }

        let normalized = String(value)
            .replace(/\u00a0/g, ' ')
            .trim();

        try {
            normalized = decodeURIComponent(normalized);
        } catch (error) {
            // Nicht korrekt URL-kodierte Werte
            // werden unverändert geprüft.
        }

        normalized = normalized
            .replace(/^doi:\s*/i, '')
            .replace(
                /^https?:\/\/(?:dx\.)?doi\.org\//i,
                ''
            );

        const match = normalized.match(
            /10\.\d{4,9}\/[^\s"'<>]+/i
        );

        return match
            ? match[0].replace(/[),.;]+$/, '')
            : '';
    }

    function getArticleId() {
        const match = location.pathname.match(
            /^\/articles\/([^/?#]+)/
        );

        return match
            ? decodeURIComponent(match[1])
            : '';
    }

    function getArticleDoi() {
        const metaValue = getMetaContent([
            'meta[name="citation_doi"]',
            'meta[name="dc.identifier"]',
            'meta[name="DC.identifier"]',
            'meta[name="prism.doi"]',
            'meta[property="prism:doi"]'
        ]);

        const doiLink =
            document.querySelector(
                'a[href*="doi.org/10."]'
            )?.href || '';

        const articleId = getArticleId();

        const doiFromUrl = articleId
            ? `10.1038/${articleId}`
            : '';

        return (
            normalizeDoi(metaValue) ||
            normalizeDoi(doiLink) ||
            normalizeDoi(doiFromUrl)
        );
    }

    function extractYear(value) {
        const match = String(value || '').match(
            /\b((?:19|20)\d{2})\b/
        );

        return match
            ? match[1]
            : '';
    }

    function getPublicationYear() {
        const metaValue = getMetaContent([
            'meta[name="citation_publication_date"]',
            'meta[name="citation_date"]',
            'meta[name="dc.date"]',
            'meta[name="DC.date"]',
            'meta[name="prism.publicationDate"]',
            'meta[property="article:published_time"]',
            'meta[itemprop="datePublished"]'
        ]);

        const timeValue = document
            .querySelector('time[datetime]')
            ?.getAttribute('datetime') || '';

        const shortYear =
            getArticleId().match(/-(\d{3})-/)?.[1] ||
            '';

        const yearFromArticleId = shortYear
            ? String(2000 + Number(shortYear))
            : '';

        return (
            extractYear(metaValue) ||
            extractYear(timeValue) ||
            yearFromArticleId
        );
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getCanonicalArticleUrl() {
        return (
            document.querySelector(
                'link[rel="canonical"]'
            )?.href ||
            `${location.origin}${location.pathname}`
        );
    }

    function createTranslationSource() {
        const doi = getArticleDoi();
        const year = getPublicationYear();
        const articleUrl =
            getCanonicalArticleUrl();

        if (!doi) {
            throw new Error(
                'Die DOI konnte nicht ermittelt werden.'
            );
        }

        if (!year) {
            throw new Error(
                'Das Veröffentlichungsjahr konnte nicht ermittelt werden.'
            );
        }

        return (
            'Nature, ' +
            `<a href="${escapeHtml(articleUrl)}" target="_blank">` +
            `${escapeHtml(doi)}</a>, ${year}`
        );
    }

    function findReferencesSection() {
        const directSection =
            document.querySelector([
                '.c-article-references',
                '[data-container-type="references"]',
                '[data-test="references"]'
            ].join(','));

        if (directSection) {
            return directSection;
        }

        const heading = Array.from(
            document.querySelectorAll(
                'h2, h3, h4, [role="heading"]'
            )
        ).find(element => (
            normalizeText(element.textContent) ===
            'references'
        ));

        if (!heading) {
            return null;
        }

        return (
            heading.closest([
                'section',
                '.c-article-references',
                '[data-container-type="references"]'
            ].join(',')) ||
            heading.parentElement
        );
    }

    function isArticleDoiLink(link) {
        return (
            normalizeText(link.textContent) ===
                'article' &&
            Boolean(normalizeDoi(link.href))
        );
    }

    function getReferenceEntries() {
        const section = findReferencesSection();

        if (!section) {
            throw new Error(
                'Der Abschnitt „References“ wurde nicht gefunden.'
            );
        }

        const entries = [];
        const seen = new Set();

        section.querySelectorAll('a[href]')
            .forEach(link => {
                if (!isArticleDoiLink(link)) {
                    return;
                }

                const item = (
                    link.closest('li') ||
                    link.closest([
                        '[data-test*="reference"]',
                        '[class*="reference-item"]',
                        '[class*="references__item"]'
                    ].join(','))
                );

                if (!item || seen.has(item)) {
                    return;
                }

                seen.add(item);

                entries.push({
                    item,
                    articleLink: link
                });
            });

        if (!entries.length) {
            throw new Error(
                'Im Abschnitt „References“ wurden keine ' +
                '„Article“-Links mit DOI gefunden.'
            );
        }

        return entries;
    }

    function getReferenceCitationElement(item) {
        return (
            item.querySelector([
                '.c-article-references__text',
                '[class*="references__text"]',
                '[data-test*="citation"]',
                'p'
            ].join(',')) ||
            item
        );
    }

function getReferenceJournal(
    item,
    citationElement
) {
    /*
     * Auf manchen Nature-Seiten ist „et al.“
     * kursiv gesetzt. Die frühere Suche nach dem
     * ersten <i>- oder <em>-Element hielt es dann
     * irrtümlich für den Journalnamen.
     */
    const journalElement = Array.from(
        item.querySelectorAll([
            '.c-article-references__journal',
            '[class*="references__journal"]',
            '[data-test*="journal"]',
            'i',
            'em'
        ].join(','))
    ).find(element => {
        const candidate = cleanInlineText(
            element.textContent
        )
            .replace(/[.,;:]\s*$/, '')
            .trim();

        return (
            candidate &&
            !/^et\s+al\.?$/i.test(candidate)
        );
    });

    if (journalElement) {
        const journal = cleanInlineText(
            journalElement.textContent
        )
            .replace(
                /^et\s+al\.?\s*[.,;:]?\s*/i,
                ''
            )
            .replace(/[.,;:]\s*$/, '')
            .replace(
                /\s+\d+(?:\s*,.*)?$/,
                ''
            )
            .trim();

        return {
            element: journalElement,
            journal
        };
    }

    const authorsElement =
        item.querySelector([
            '.c-article-references__authors',
            '[class*="references__authors"]',
            '[data-test*="author"]'
        ].join(','));

    const citationText = cleanInlineText(
        citationElement.textContent
    );

    const authorsText = cleanInlineText(
        authorsElement?.textContent
    );

    if (!authorsText) {
        return {
            element: null,
            journal: ''
        };
    }

    const authorsIndex =
        citationText.indexOf(authorsText);

    const afterAuthors =
        authorsIndex >= 0
            ? citationText.slice(
                authorsIndex +
                authorsText.length
            )
            : '';

    const journal =
        cleanInlineText(afterAuthors)
            .replace(
                /^\s*(?:et\s+al\.)?\s*/i,
                ''
            )
            .replace(/^[.,;:]\s*/, '')
            .split(
                /\s+(?=(?:https?:\/\/(?:dx\.)?doi\.org\/|10\.\d{4,9}\/|\d+\s*,|\((?:19|20)\d{2}\)))/i
            )[0]
            .replace(/[.,;:]\s*$/, '')
            .trim();

    return {
        element: null,
        journal
    };
}

    function getReferenceAuthorsText(
        item,
        citationElement,
        journalElement,
        journal
    ) {
        const authorsElement =
            item.querySelector([
                '.c-article-references__authors',
                '[class*="references__authors"]',
                '[data-test*="author"]'
            ].join(','));

        if (authorsElement) {
            return cleanInlineText(
                authorsElement.textContent
            );
        }

        const citationText = cleanInlineText(
            citationElement.textContent
        );

        if (journalElement) {
            const journalText = cleanInlineText(
                journalElement.textContent
            );

            const journalIndex =
                citationText.indexOf(journalText);

            if (journalIndex > 0) {
                return cleanInlineText(
                    citationText.slice(
                        0,
                        journalIndex
                    )
                );
            }
        }

        if (journal) {
            const journalIndex =
                citationText.indexOf(journal);

            if (journalIndex > 0) {
                return cleanInlineText(
                    citationText.slice(
                        0,
                        journalIndex
                    )
                );
            }
        }

        return '';
    }

    function parseReferenceAuthors(value) {
        /*
         * Nature schreibt Autoren normalerweise
         * paarweise als „Nachname, Initialen“.
         *
         * Wir zerlegen diese Struktur an den
         * Kommata. Dadurch funktionieren auch
         * Akzente und Bindestriche zuverlässig.
         */
        const text = cleanInlineText(value)
            .replace(/^\d+\.\s*/, '')
            .replace(/\bet\s+al\.?/gi, '')
            .replace(
                /\s+(?:&|and)\s+/gi,
                ', '
            )
            .replace(/\s*;\s*/g, ', ')
            .replace(/[,;\s]+$/, '')
            .trim();

        if (!text) {
            return [];
        }

        const parts = text
            .split(/\s*,\s*/)
            .map(part => cleanInlineText(part))
            .filter(Boolean);

        const authors = [];

        for (
            let index = 0;
            index + 1 < parts.length;
            index += 2
        ) {
            const surname = parts[index];
            const initials = parts[index + 1];

            /*
             * Der Initialenteil muss lediglich
             * mindestens einen Punkt enthalten.
             * Seine Schreibweise bleibt unverändert.
             */
            if (
                !surname ||
                !initials ||
                !initials.includes('.')
            ) {
                return [];
            }

            authors.push(
                `${surname}, ${initials}`
            );
        }

        return authors.length * 2 === parts.length
            ? authors
            : [];
    }

    function formatReferenceAuthors(
        value,
        completeCitationText = ''
    ) {
        const authors =
            parseReferenceAuthors(value);

        /*
         * Bei manchen Nature-Seiten steht
         * „et al.“ außerhalb des eigentlichen
         * Autoren-Elements. Deshalb prüfen wir
         * zusätzlich den kompletten Zitationstext.
         */
        const alreadyShortened =
            /\bet\s+al\.?/i.test(
                `${value} ${completeCitationText}`
            );

        if (!authors.length) {
            throw new Error(
                `Autoren konnten nicht gelesen werden: ${value}`
            );
        }

        if (
            authors.length >= 3 ||
            alreadyShortened
        ) {
            return `${authors[0]} et al.`;
        }

        return authors.join(', ');
    }

    function getReferenceYear(
        citationElement
    ) {
        const text = cleanInlineText(
            citationElement.textContent
        );

        const parentheticalYears =
            Array.from(
                text.matchAll(
                    /\(((?:19|20)\d{2})[a-z]?\)/gi
                ),
                match => match[1]
            );

        if (parentheticalYears.length) {
            return parentheticalYears.at(-1);
        }

        const trailingYear = text.match(
            /\b((?:19|20)\d{2})[a-z]?\.?$/i
        );

        return trailingYear
            ? trailingYear[1]
            : '';
    }

    function parseReferenceEntry(
        entry,
        index
    ) {
        const citationElement =
            getReferenceCitationElement(
                entry.item
            );

        const {
            element: journalElement,
            journal
        } = getReferenceJournal(
            entry.item,
            citationElement
        );

        const authorsText =
            getReferenceAuthorsText(
                entry.item,
                citationElement,
                journalElement,
                journal
            );

        const authors =
            formatReferenceAuthors(
                authorsText,
                citationElement.textContent
            );

        /*
         * Die DOI wird ausschließlich aus
         * dem Link „Article“ gelesen.
         */
        const doi = normalizeDoi(
            entry.articleLink.href
        );

        const year = getReferenceYear(
            citationElement
        );

        const missing = [];

        if (!journal) {
            missing.push('Journal');
        }

        if (!doi) {
            missing.push('DOI');
        }

        if (!year) {
            missing.push('Jahr');
        }

        if (missing.length) {
            throw new Error(
                `Reference ${index + 1}: ` +
                `${missing.join(', ')} nicht erkannt.`
            );
        }

        return {
            authors,
            journal,
            doi,
            year,
            sortKey: authors
                .replace(
                    /\bet\s+al\..*$/i,
                    ''
                )
                .trim()
        };
    }

    function createFormattedReferences() {
        const references =
            getReferenceEntries()
                .map(parseReferenceEntry)
                .sort((first, second) => (
                    first.sortKey.localeCompare(
                        second.sortKey,
                        'de',
                        {
                            sensitivity: 'base',
                            ignorePunctuation: true
                        }
                    )
                ));

        return references
            .map(reference => (
                `${reference.authors}, ` +
                `${reference.journal} ` +
                `${reference.doi}, ` +
                reference.year
            ))
            .join('\n');
    }

    async function writeToClipboard(text) {
        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {
            try {
                await navigator.clipboard.writeText(
                    text
                );

                return;
            } catch (error) {
                console.debug(
                    '[Nature-Dashboard] ' +
                    'Clipboard-API fehlgeschlagen:',
                    error
                );
            }
        }

        if (
            typeof GM_setClipboard ===
            'function'
        ) {
            GM_setClipboard(text, 'text');
            return;
        }

        const textarea =
            document.createElement(
                'textarea'
            );

        textarea.value = text;

        Object.assign(textarea.style, {
            position: 'fixed',
            left: '-9999px',
            top: '0',
            opacity: '0'
        });

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        const successful =
            document.execCommand('copy');

        textarea.remove();

        if (!successful) {
            throw new Error(
                'Der Zugriff auf die Zwischenablage wurde verweigert.'
            );
        }
    }

    function setStatus(
        message,
        isError = false
    ) {
        const status =
            document.getElementById(
                IDS.status
            );

        if (!status) {
            return;
        }

        window.clearTimeout(statusTimer);

        status.textContent = message;

        status.style.color = isError
            ? '#b3261e'
            : '#176b35';

        statusTimer =
            window.setTimeout(
                () => {
                    status.textContent = '';
                },
                3500
            );
    }

    function setBusy(
        button,
        busy,
        busyText = 'Wird kopiert …'
    ) {
        if (busy) {
            button.dataset.originalText =
                button.textContent;

            button.textContent =
                busyText;

            button.disabled = true;
            button.style.opacity = '0.7';
            button.style.cursor = 'wait';
        } else {
            button.textContent =
                button.dataset.originalText ||
                button.textContent;

            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    }

    async function copyArticle(button) {
        if (button.disabled) {
            return;
        }

        try {
            setBusy(button, true);

            const text =
                extractArticleText();

            if (!text) {
                throw new Error(
                    'Der Artikel enthält keinen kopierbaren Text.'
                );
            }

            await writeToClipboard(text);

            setStatus(
                `Artikeltext kopiert: ${
                    text.length.toLocaleString(
                        'de-DE'
                    )
                } Zeichen`
            );
        } catch (error) {
            console.error(
                '[Nature-Dashboard]',
                error
            );

            setStatus(
                error.message ||
                'Kopieren fehlgeschlagen.',
                true
            );
        } finally {
            setBusy(button, false);
            updateLengthDisplay();
        }
    }

    async function copyTranslationSource(
        button
    ) {
        if (button.disabled) {
            return;
        }

        try {
            setBusy(button, true);

            await writeToClipboard(
                createTranslationSource()
            );

            setStatus(
                'Quellenangabe kopiert.'
            );
        } catch (error) {
            console.error(
                '[Nature-Dashboard]',
                error
            );

            setStatus(
                error.message ||
                'Quellenangabe konnte nicht kopiert werden.',
                true
            );
        } finally {
            setBusy(button, false);
        }
    }

    async function copyReferences(button) {
        if (button.disabled) {
            return;
        }

        try {
            setBusy(
                button,
                true,
                'References werden erfasst …'
            );

            const references =
                createFormattedReferences();

            await writeToClipboard(
                references
            );

            const count = references
                .split('\n')
                .filter(Boolean)
                .length;

            setStatus(
                `${
                    count.toLocaleString('de-DE')
                } References kopiert.`
            );
        } catch (error) {
            console.error(
                '[Nature-Dashboard]',
                error
            );

            setStatus(
                error.message ||
                'References konnten nicht kopiert werden.',
                true
            );
        } finally {
            setBusy(button, false);
        }
    }

    function updateLengthDisplay() {
        const output =
            document.getElementById(
                IDS.length
            );

        if (!output) {
            return;
        }

        try {
            const text =
                extractArticleText();

            const words = text
                ? text
                    .split(/\s+/)
                    .filter(Boolean)
                    .length
                : 0;

            output.textContent =
                `${
                    text.length.toLocaleString(
                        'de-DE'
                    )
                } Zeichen · ` +
                `${
                    words.toLocaleString(
                        'de-DE'
                    )
                } Wörter`;

            output.style.color = '#222';
        } catch (error) {
            output.textContent =
                'Artikeltext noch nicht gefunden';

            output.style.color =
                '#b3261e';
        }
    }

    function createButton(
        id,
        text,
        secondary = false
    ) {
        const button =
            document.createElement(
                'button'
            );

        button.id = id;
        button.type = 'button';
        button.textContent = text;

        Object.assign(button.style, {
            display: 'block',
            width: '100%',
            padding: '10px 12px',
            marginTop: secondary
                ? '8px'
                : '0',
            borderRadius: '6px',
            border: secondary
                ? '1px solid #555'
                : '0',
            backgroundColor: secondary
                ? '#fff'
                : '#222',
            color: secondary
                ? '#222'
                : '#fff',
            cursor: 'pointer',
            fontFamily:
                'Arial, sans-serif',
            fontSize: '13px',
            fontWeight: '600',
            lineHeight: '1.25'
        });

        button.addEventListener(
            'mouseenter',
            () => {
                if (!button.disabled) {
                    button.style
                        .backgroundColor =
                            secondary
                                ? '#f1f1f1'
                                : '#444';
                }
            }
        );

        button.addEventListener(
            'mouseleave',
            () => {
                if (!button.disabled) {
                    button.style
                        .backgroundColor =
                            secondary
                                ? '#fff'
                                : '#222';
                }
            }
        );

        return button;
    }

    function addDashboard() {
        if (
            document.getElementById(
                IDS.dashboard
            ) ||
            !document.body
        ) {
            return;
        }

        const dashboard =
            document.createElement(
                'section'
            );

        dashboard.id =
            IDS.dashboard;

        dashboard.setAttribute(
            'aria-label',
            'Werkzeuge für den Nature-Artikel'
        );

        Object.assign(
            dashboard.style,
            {
                position: 'fixed',
                right: '20px',
                bottom: '20px',
                zIndex: '2147483647',
                width: '285px',
                padding: '14px',
                boxSizing: 'border-box',
                border:
                    '1px solid rgba(0, 0, 0, 0.18)',
                borderRadius: '10px',
                backgroundColor: '#fff',
                color: '#222',
                boxShadow:
                    '0 4px 18px rgba(0, 0, 0, 0.28)',
                fontFamily:
                    'Arial, sans-serif'
            }
        );

        const heading =
            document.createElement('div');

        heading.textContent =
            'Nature-Artikel';

        Object.assign(
            heading.style,
            {
                marginBottom: '6px',
                fontSize: '15px',
                fontWeight: '700'
            }
        );

        const lengthLabel =
            document.createElement('div');

        lengthLabel.textContent =
            'Kopierbarer Artikeltext:';

        Object.assign(
            lengthLabel.style,
            {
                marginBottom: '2px',
                color: '#666',
                fontSize: '12px'
            }
        );

        const lengthOutput =
            document.createElement('div');

        lengthOutput.id =
            IDS.length;

        lengthOutput.textContent =
            'Wird ermittelt …';

        Object.assign(
            lengthOutput.style,
            {
                minHeight: '18px',
                marginBottom: '12px',
                fontSize: '13px',
                fontWeight: '700'
            }
        );

        const copyButton =
            createButton(
                IDS.copy,
                'Artikeltext kopieren'
            );

        copyButton.title =
            'Reinen Artikeltext in die Zwischenablage kopieren';

        const sourceButton =
            createButton(
                IDS.source,
                'Quellenangabe für Übersetzung',
                true
            );

        sourceButton.title =
            'HTML-Quellenangabe mit DOI und Veröffentlichungsjahr kopieren';

        const referencesButton =
            createButton(
                IDS.references,
                'References kopieren',
                true
            );

        referencesButton.title =
            'References ins Spektrum-Format bringen und alphabetisch kopieren';

        const status =
            document.createElement('div');

        status.id =
            IDS.status;

        status.setAttribute(
            'aria-live',
            'polite'
        );

        Object.assign(
            status.style,
            {
                minHeight: '16px',
                marginTop: '9px',
                fontSize: '12px',
                fontWeight: '600'
            }
        );

        copyButton.addEventListener(
            'click',
            () => copyArticle(
                copyButton
            )
        );

        sourceButton.addEventListener(
            'click',
            () => copyTranslationSource(
                sourceButton
            )
        );

        referencesButton.addEventListener(
            'click',
            () => copyReferences(
                referencesButton
            )
        );

        dashboard.append(
            heading,
            lengthLabel,
            lengthOutput,
            copyButton,
            sourceButton,
            referencesButton,
            status
        );

        document.body.appendChild(
            dashboard
        );

        updateLengthDisplay();
    }

    function scheduleUpdate() {
        window.clearTimeout(
            updateTimer
        );

        updateTimer =
            window.setTimeout(
                updateLengthDisplay,
                500
            );
    }

    addDashboard();

    const articleBody =
        findArticleBody();

    if (articleBody) {
        const observer =
            new MutationObserver(
                scheduleUpdate
            );

        observer.observe(
            articleBody,
            {
                childList: true,
                subtree: true,
                characterData: true
            }
        );
    }

    // Alt + Umschalt + C = Artikeltext
    // Alt + Umschalt + R = References
    document.addEventListener(
        'keydown',
        event => {
            if (
                event.altKey &&
                event.shiftKey &&
                event.code === 'KeyC'
            ) {
                event.preventDefault();

                const button =
                    document.getElementById(
                        IDS.copy
                    );

                if (button) {
                    copyArticle(button);
                }
            }

            if (
                event.altKey &&
                event.shiftKey &&
                event.code === 'KeyR'
            ) {
                event.preventDefault();

                const button =
                    document.getElementById(
                        IDS.references
                    );

                if (button) {
                    copyReferences(button);
                }
            }
        }
    );
})();