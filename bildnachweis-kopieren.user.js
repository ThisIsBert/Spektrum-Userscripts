// ==UserScript==
// @name         Bildnachweis kopieren
// @namespace    https://www.spektrum.de/
// @version      1.0.2
// @description  Kopiert Bildnachweise von Getty Images, Adobe Stock und Picture Alliance in ein einheitliches Format.
// @author       Jan
// @include      *://gettyimages.*/*
// @include      *://*.gettyimages.*/*
// @match        https://stock.adobe.com/*
// @match        *://picture-alliance.com/*
// @match        *://*.picture-alliance.com/*
// @match        *://picture-alliance.de/*
// @match        *://*.picture-alliance.de/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @homepageURL  https://thisisbert.github.io/Spektrum-Userscripts/
// @supportURL   https://github.com/ThisIsBert/Spektrum-Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/bildnachweis-kopieren.user.js
// @downloadURL  https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/bildnachweis-kopieren.user.js
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_ID = 'tm-image-credit-copy-button';
    const TOAST_ID = 'tm-image-credit-toast';
    const STYLE_ID = 'tm-image-credit-styles';

    let refreshTimer = null;
    let toastTimer = null;

    function norm(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isMostlyAllCaps(value) {
        const text = norm(value);

        if (!text) {
            return false;
        }

        const casedLetters = Array.from(text).filter((char) => {
            if (!/\p{L}/u.test(char)) {
                return false;
            }

            return char.toLowerCase() !== char.toUpperCase();
        });

        if (casedLetters.length < 2) {
            return false;
        }

        const upperCaseLetters = casedLetters.filter(
            (char) => char === char.toUpperCase()
        ).length;

        return upperCaseLetters / casedLetters.length > 0.85;
    }

    function smartTitleWord(word) {
        if (!word) {
            return word;
        }

        const match = word.match(
            /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u
        );

        const prefix = match ? match[1] : '';
        const core = match ? match[2] : word;
        const suffix = match ? match[3] : '';

        if (!core) {
            return word;
        }

        const protectedAcronyms = new Set([
            'AFP',
            'DPA',
            'AP',
            'EPA',
            'UPI',
            'NASA',
            'ESA',
            'EU',
            'US',
            'UK'
        ]);

        if (protectedAcronyms.has(core.toUpperCase())) {
            return prefix + core.toUpperCase() + suffix;
        }

        if (/^\d+$/u.test(core)) {
            return word;
        }

        return (
            prefix +
            core.charAt(0).toUpperCase() +
            core.slice(1).toLowerCase() +
            suffix
        );
    }

    function smartTitleCase(value) {
        const text = norm(value);

        if (!text || !isMostlyAllCaps(text)) {
            return text;
        }

        return text
            .split(/(\s+)/u)
            .map((part) => {
                if (/^\s+$/u.test(part)) {
                    return part;
                }

                return part
                    .split(/([\-/])/u)
                    .map((segment) => {
                        if (segment === '-' || segment === '/') {
                            return segment;
                        }

                        return segment
                            .split(/([’'])/u)
                            .map((piece) => {
                                if (piece === "'" || piece === '’') {
                                    return piece;
                                }

                                return smartTitleWord(piece);
                            })
                            .join('');
                    })
                    .join('');
            })
            .join('');
    }

    function nextNonEmptyElement(element) {
        let next = element && element.nextElementSibling;

        while (next && !norm(next.textContent)) {
            next = next.nextElementSibling;
        }

        return next;
    }

    function findValueAfterHeading(label) {
        const headings = Array.from(
            document.querySelectorAll('h1, h2, h3, h4, h5, h6')
        );

        const heading = headings.find((element) => {
            const text = norm(element.textContent).replace(/:$/, '');

            return text.toLowerCase() === label.toLowerCase();
        });

        if (!heading) {
            return null;
        }

        const valueElement = nextNonEmptyElement(heading);

        if (!valueElement) {
            return null;
        }

        return {
            value: norm(valueElement.textContent),
            anchor: valueElement
        };
    }

    function attributeSelectorValue(value) {
        return String(value)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    }

    function getGettyFieldByTestId(ids) {
        for (const id of ids) {
            const selector =
                `[data-testid="${attributeSelectorValue(id)}"]`;

            const block = document.querySelector(selector);

            if (!block) {
                continue;
            }

            const childValues = Array.from(block.children)
                .map((element) => norm(element.textContent))
                .filter(Boolean);

            if (childValues.length >= 2) {
                return {
                    value: childValues[1],
                    anchor: block
                };
            }

            const lines = String(
                block.innerText || block.textContent || ''
            )
                .split(/\n+/u)
                .map(norm)
                .filter(Boolean)
                .filter((line) => {
                    return !ids.some((candidate) => {
                        return (
                            line.replace(/:$/, '') ===
                            candidate.replace(/:$/, '')
                        );
                    });
                });

            if (lines.length) {
                return {
                    value: lines[0],
                    anchor: block
                };
            }
        }

        return null;
    }

    function findLabeledValue(labels) {
        const candidates = Array.from(
            document.querySelectorAll(
                'dt, dd, div, span, p, strong, h1, h2, h3, h4, h5, h6'
            )
        );

        const normalizedLabels = labels.map((label) => {
            return norm(label)
                .replace(/:$/, '')
                .toLowerCase();
        });

        for (const element of candidates) {
            if (
                element.id === BUTTON_ID ||
                element.closest(`#${BUTTON_ID}`)
            ) {
                continue;
            }

            const ownText = norm(element.textContent)
                .replace(/:$/, '')
                .toLowerCase();

            if (!normalizedLabels.includes(ownText)) {
                continue;
            }

            const sibling = nextNonEmptyElement(element);

            if (sibling) {
                const value = norm(sibling.textContent);

                if (value && value.length < 500) {
                    return {
                        value,
                        anchor: sibling
                    };
                }
            }

            const parent = element.parentElement;

            if (parent) {
                const siblings = Array.from(parent.children);
                const index = siblings.indexOf(element);

                for (
                    let i = index + 1;
                    i < siblings.length;
                    i += 1
                ) {
                    const value = norm(siblings[i].textContent);

                    if (value && value.length < 500) {
                        return {
                            value,
                            anchor: siblings[i]
                        };
                    }
                }
            }
        }

        return null;
    }

    function findGettyValue(labels) {
        const labeled = findLabeledValue(labels);

        if (labeled) {
            return labeled;
        }

        const bodyText = String(
            document.body?.innerText || ''
        ).replace(/\u00a0/g, ' ');

        for (const label of labels) {
            const safeLabel = label.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );

            const regex = new RegExp(
                `${safeLabel}:?\\s*\\n+([^\\n]+)`,
                'i'
            );

            const match = bodyText.match(regex);

            if (match) {
                return {
                    value: norm(match[1]),
                    anchor: null
                };
            }
        }

        return null;
    }

    function findAdobeAuthor() {
        const author = document.querySelector(
            '[data-t="detail-panel-content-author-name"]'
        );

        if (!author) {
            return null;
        }

        return {
            value: norm(author.textContent),
            anchor: author
        };
    }

    function findPictureAllianceRawCredit() {
        const fromHeading =
            findValueAfterHeading('Bildnachweis');

        if (fromHeading?.value) {
            return fromHeading;
        }

        const bodyText = String(
            document.body?.innerText || ''
        ).replace(/\u00a0/g, ' ');

        const patterns = [
            /Bildnachweis\s*[:\n]\s*(picture[- ]alliance\s*\/\s*.+?\|\s*.+)/i,
            /(picture[- ]alliance\s*\/\s*[^|\n\r]+?\s*\|\s*[^\n\r]+)/i
        ];

        for (const pattern of patterns) {
            const match = bodyText.match(pattern);

            if (match) {
                return {
                    value: norm(match[1]),
                    anchor: findElementContainingExactText(match[1])
                };
            }
        }

        return null;
    }

    function findElementContainingExactText(text) {
        const target = norm(text);

        if (!target) {
            return null;
        }

        const elements = Array.from(
            document.querySelectorAll('body *')
        );

        return (
            elements.find((element) => {
                if (
                    element.id === BUTTON_ID ||
                    element.closest(`#${BUTTON_ID}`)
                ) {
                    return false;
                }

                if (norm(element.textContent) !== target) {
                    return false;
                }

                return !Array.from(element.children).some(
                    (child) => norm(child.textContent) === target
                );
            }) || null
        );
    }

    function buildPictureAllianceCredit() {
        const rawResult = findPictureAllianceRawCredit();

        if (!rawResult?.value) {
            return {
                error:
                    'Kein Picture-Alliance-Bildnachweis gefunden.',
                anchor: null
            };
        }

        const match = rawResult.value.match(
            /^picture[- ]alliance\s*\/\s*(.+?)\s*\|\s*(.+)$/i
        );

        if (!match) {
            return {
                error:
                    'Der Picture-Alliance-Bildnachweis hat nicht ' +
                    'das erwartete Format:\n' +
                    rawResult.value,
                anchor: rawResult.anchor
            };
        }

        return {
            text:
                `${smartTitleCase(match[2].trim())} / ` +
                `${smartTitleCase(match[1].trim())} / ` +
                'picture alliance',
            anchor: rawResult.anchor
        };
    }

    function buildGettyCredit() {
        const credit =
            getGettyFieldByTestId(['Credit:', 'Credit']) ||
            findGettyValue(['Credit', 'Bildnachweis']);

        const collection =
            getGettyFieldByTestId(['Collection:', 'Collection']) ||
            findGettyValue(['Collection', 'Kollektion']);

        if (!credit?.value) {
            return {
                error: 'Kein Getty-Bildnachweis gefunden.',
                anchor: collection?.anchor || null
            };
        }

        if (!collection?.value) {
            return {
                error: 'Keine Getty-Kollektion gefunden.',
                anchor: credit.anchor || null
            };
        }

        const photographer = smartTitleCase(
            credit.value.split('/')[0].trim()
        );

        if (!photographer) {
            return {
                error:
                    'Der Getty-Fotograf konnte nicht ermittelt werden:\n' +
                    credit.value,
                anchor: credit.anchor || null
            };
        }

        return {
            text:
                `${photographer} / Getty Images / ` +
                `${smartTitleCase(collection.value.trim())}`,
            anchor:
                credit.anchor ||
                collection.anchor ||
                null
        };
    }

    function buildAdobeCredit() {
        const author = findAdobeAuthor();

        if (!author?.value) {
            return {
                error: 'Kein Adobe-Urheber gefunden.',
                anchor: null
            };
        }

        return {
            text: `${author.value} / stock.adobe.com`,
            anchor: author.anchor
        };
    }

    function getSiteType() {
        const host = location.hostname.toLowerCase();

        if (/gettyimages\./i.test(host)) {
            return 'getty';
        }

        if (host === 'stock.adobe.com') {
            return 'adobe';
        }

        if (/picture-alliance\.(com|de)$/i.test(host)) {
            return 'picture-alliance';
        }

        return null;
    }

    function buildCurrentCredit() {
        switch (getSiteType()) {
            case 'getty':
                return buildGettyCredit();

            case 'adobe':
                return buildAdobeCredit();

            case 'picture-alliance':
                return buildPictureAllianceCredit();

            default:
                return {
                    error:
                        'Diese Website wird von dem Script nicht unterstützt.',
                    anchor: null
                };
        }
    }

    async function copyText(text) {
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text, 'text');
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                throw new Error(
                    'Keine Clipboard-API verfügbar'
                );
            }

            showToast(`Kopiert: ${text}`, false);
        } catch (error) {
            window.prompt(
                'Bildnachweis kopieren:',
                text
            );
        }
    }

    function handleButtonClick(event) {
        event.preventDefault();
        event.stopPropagation();

        const result = buildCurrentCredit();

        if (!result.text) {
            showToast(
                result.error ||
                    'Kein Bildnachweis gefunden.',
                true
            );

            return;
        }

        copyText(result.text);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;

        style.textContent = `
            #${BUTTON_ID} {
                box-sizing: border-box;
                border: 1px solid rgba(0, 0, 0, 0.28);
                border-radius: 5px;
                padding: 4px 8px;
                font:
                    600 12px/1.25 system-ui,
                    -apple-system,
                    BlinkMacSystemFont,
                    "Segoe UI",
                    sans-serif;
                color: #1f1f1f;
                background: #fff;
                cursor: pointer;
                box-shadow:
                    0 1px 3px rgba(0, 0, 0, 0.16);
                z-index: 2147483646;
            }

            #${BUTTON_ID}:hover {
                background: #f2f2f2;
            }

            #${BUTTON_ID}:focus-visible {
                outline: 2px solid #1677ff;
                outline-offset: 2px;
            }

            #${BUTTON_ID}.tm-image-credit-inline {
                display: inline-flex;
                align-items: center;
                margin: 4px 0 4px 8px;
                vertical-align: middle;
                position: relative;
            }

            #${BUTTON_ID}.tm-image-credit-floating {
                position: fixed;
                right: 16px;
                bottom: 16px;
                padding: 7px 10px;
            }

            #${TOAST_ID} {
                position: fixed;
                right: 16px;
                bottom: 58px;
                max-width:
                    min(460px, calc(100vw - 32px));
                padding: 9px 12px;
                border-radius: 6px;
                font:
                    13px/1.35 system-ui,
                    -apple-system,
                    BlinkMacSystemFont,
                    "Segoe UI",
                    sans-serif;
                color: #fff;
                background: rgba(25, 25, 25, 0.94);
                box-shadow:
                    0 3px 14px rgba(0, 0, 0, 0.28);
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                z-index: 2147483647;
                opacity: 0;
                transform: translateY(4px);
                transition:
                    opacity 120ms ease,
                    transform 120ms ease;
                pointer-events: none;
            }

            #${TOAST_ID}.tm-visible {
                opacity: 1;
                transform: translateY(0);
            }

            #${TOAST_ID}.tm-error {
                background: rgba(145, 20, 20, 0.96);
            }
        `;

        (
            document.head ||
            document.documentElement
        ).appendChild(style);
    }

    function getOrCreateButton() {
        let button = document.getElementById(BUTTON_ID);

        if (button) {
            return button;
        }

        button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = 'Bildnachweis kopieren';
        button.title =
            'Bildnachweis in die Zwischenablage kopieren';

        button.addEventListener(
            'click',
            handleButtonClick,
            true
        );

        return button;
    }

    function placeButton() {
        if (!document.body) {
            return;
        }

        injectStyles();

        const result = buildCurrentCredit();
        const button = getOrCreateButton();
        const anchor = result.anchor;

        if (
            anchor &&
            anchor.isConnected &&
            anchor.parentElement
        ) {
            if (
                button.className !==
                'tm-image-credit-inline'
            ) {
                button.className =
                    'tm-image-credit-inline';
            }

            if (
                button.textContent !==
                'Nachweis kopieren'
            ) {
                button.textContent =
                    'Nachweis kopieren';
            }

            if (button.previousElementSibling !== anchor) {
                anchor.insertAdjacentElement(
                    'afterend',
                    button
                );
            }
        } else {
            if (
                button.className !==
                'tm-image-credit-floating'
            ) {
                button.className =
                    'tm-image-credit-floating';
            }

            if (
                button.textContent !==
                'Bildnachweis kopieren'
            ) {
                button.textContent =
                    'Bildnachweis kopieren';
            }

            if (button.parentElement !== document.body) {
                document.body.appendChild(button);
            }
        }
    }

    function showToast(message, isError) {
        injectStyles();

        let toast = document.getElementById(TOAST_ID);

        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            document.body.appendChild(toast);
        }

        toast.textContent = message;

        toast.classList.toggle(
            'tm-error',
            Boolean(isError)
        );

        toast.classList.add('tm-visible');

        window.clearTimeout(toastTimer);

        toastTimer = window.setTimeout(() => {
            toast.classList.remove('tm-visible');
        }, isError ? 4500 : 3000);
    }

    function scheduleRefresh(delay = 250) {
        window.clearTimeout(refreshTimer);

        refreshTimer = window.setTimeout(
            placeButton,
            delay
        );
    }

    function observePageChanges() {
        const observer = new MutationObserver(() => {
            scheduleRefresh();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function observeNavigation() {
        for (const method of [
            'pushState',
            'replaceState'
        ]) {
            const original = history[method];

            history[method] = function (...args) {
                const result = original.apply(
                    this,
                    args
                );

                scheduleRefresh(400);

                return result;
            };
        }

        window.addEventListener(
            'popstate',
            () => scheduleRefresh(400)
        );
    }

    placeButton();
    observePageChanges();
    observeNavigation();

    window.setTimeout(placeButton, 1000);
    window.setTimeout(placeButton, 2500);
}());