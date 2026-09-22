# Spektrum Userscripts

Browserhelfer für den Redaktionsalltag mit Tampermonkey.

**[Übersicht und Installationsanleitung](https://thisisbert.github.io/Spektrum-Userscripts/)** (nach Aktivierung von GitHub Pages).

| Skript | Funktion | Installation |
| --- | --- | --- |
| Bildnachweis kopieren | Bildnachweise von Getty Images, Adobe Stock und Picture Alliance kopieren | [Installieren](https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/bildnachweis-kopieren.user.js) |
| Nature: Artikel-Dashboard | Artikeltext, Übersetzungsquelle und Literaturangaben kopieren | [Installieren](https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/nature-artikel-dashboard.user.js) |
| Autorenansicht exportieren | CMS-Artikelvorschau als kommentierbare HTML-Datei speichern, optional Bilder einbetten und als PDF drucken | [Installieren](https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/spektrum-autorenansicht.user.js) |
| Bilder-Batch | Mehrere Bildeinträge über einen separaten Eingabetab im CMS anlegen | [Installieren](https://raw.githubusercontent.com/ThisIsBert/Spektrum-Userscripts/main/spektrum-bilder-batch.user.js) |

## Installation

1. [Tampermonkey](https://www.tampermonkey.net/) im Browser installieren.
2. Den Installationslink des gewünschten Skripts öffnen und in Tampermonkey bestätigen.
3. Die jeweilige Zielseite neu laden. Die CMS-Helfer benötigen einen angemeldeten CMS-Zugang.

Die Installation funktioniert ohne GitHub-Konto. Falls nur Code erscheint, den Installationslink im Tampermonkey-Dashboard unter **Hilfsmittel / Utilities → Von URL installieren / Install from URL** einsetzen. Für Chrome/Edge gegebenenfalls die [Ausführung von Userscripts freigeben](https://www.tampermonkey.net/faq.php#Q209).

Bereits manuell installierte Skripte einmal über diese Links aktualisieren, damit die Update-Adressen übernommen werden. Bei unverändertem Namen und Namensraum kann Tampermonkey die Installation zuordnen. Eventuelle alte Doppelinstallationen deaktivieren; eigene Änderungen vorher sichern.

## GitHub Pages aktivieren

In den [Pages-Einstellungen](https://github.com/ThisIsBert/Spektrum-Userscripts/settings/pages):

1. **Build and deployment → Source → Deploy from a branch** wählen.
2. Branch **main**, Ordner **/ (root)** auswählen und **Save** anklicken.
3. Nach erfolgreicher Bereitstellung ist die Seite unter https://thisisbert.github.io/Spektrum-Userscripts/ erreichbar.

`index.html` ist eine statische Seite ohne Build-Schritt, externe Schriften oder JavaScript-Abhängigkeiten. `.nojekyll` deaktiviert die Jekyll-Verarbeitung. Die Installation verwendet GitHubs Raw-Adressen und funktioniert unabhängig von Pages.

## Updates veröffentlichen

- Die bestehenden `.user.js`-Dateien bearbeiten; die Dateinamen bleiben dauerhaft gleich.
- Bei jedem veröffentlichten Update `@version` erhöhen (zum Beispiel `0.2.6` → `0.2.7`). Ohne höhere Version erkennt Tampermonkey kein neues Update.
- `@name` und `@namespace` stabil halten: Sie identifizieren das Skript.
- `@updateURL` und `@downloadURL` verweisen auf die jeweilige vollständige `.user.js`-Datei im Branch `main`. Separate Metadaten-Dateien sind nicht erforderlich.
- Änderungen auf `main` veröffentlichen. Tampermonkey prüft die Version gemäß den Einstellungen der jeweiligen Installation. Neue Berechtigungen können eine Bestätigung erfordern.
- Bei neuen Skripten oder geänderten Funktionen die Übersicht in `index.html` und diese README ergänzen.

## Umstellung auf GitHub-Verteilung

Die bisherigen Dateinamen mit Versionsnummer wurden durch stabile Dateinamen ersetzt. Die Versionsnummern steigen auf 1.0.2 (Bildnachweis), 2.1.2 (Nature), 0.2.1 (Autorenansicht) und 0.2.6 (Bilder-Batch). Hinzu kommen Homepage-, Support-, Update- und Download-Adressen. Die Ausführungslogik und Website-Berechtigungen bleiben bei dieser Umstellung unverändert.

Referenzen: [Tampermonkey-Metadaten](https://www.tampermonkey.net/documentation.php#meta:updateURL), [GitHub Pages konfigurieren](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Autorenansicht 0.3.0: Kommentare und PDF

1. Im CMS die Artikelvorschau öffnen. Beim Speicherbutton ist **Bilder einbetten** standardmäßig angehakt. Mit Häkchen enthält die HTML-Datei die Bilder; ohne Häkchen bleibt sie kleiner und lädt Bilder online nach.
2. **Autorenansicht speichern** anklicken und die HTML-Datei weitergeben. Empfänger benötigen weder CMS-Zugang noch Tampermonkey. Die Datei herunterladen und im Browser öffnen; E-Mail-Vorschaufenster führen das eingebettete JavaScript oft nicht aus.
3. Text im Artikel markieren und **Kommentar hinzufügen** wählen. Optional den eigenen Namen eingeben, den Kommentar schreiben und **Hinzufügen** anklicken. Antworten auf vorhandene Kommentare sind möglich.
4. **Kommentierte Fassung speichern** erzeugt einen neuen HTML-Download einschließlich aller Kommentare, Antworten und Markierungen. Diese neue Datei zurücksenden. Die geöffnete Datei wird nicht überschrieben; es gibt keine serverseitige oder automatische Sicherung. Beim Verlassen mit ungespeicherten Änderungen wird gewarnt, soweit der Browser dies zulässt.
5. **Als PDF speichern** öffnet den Browser-Druckdialog. Dort das PDF-Ziel auswählen. Alle Galeriebilder werden ausgegeben; Kommentare und Antworten stehen mit den zitierten Textstellen am Ende. Das PDF bleibt eine statische Fassung, weitere Kommentare sind in der HTML-Datei möglich.

Interaktive Einbettungen, Videos und Audio werden durch Hinweise mit Links zum Original ersetzt. Artikelbilder müssen bei aktivierter Einbettung erfolgreich geladen werden, andernfalls bricht der Export mit einer Fehlermeldung ab. Nicht verfügbare dekorative CSS-Ressourcen werden ausgelassen. Externe Bildadressen können Zugriffsbeschränkungen unterliegen.

Kommentare werden über Textposition, Zitat und Kontext verankert. Mehrdeutige/verlorene Textstellen werden als solche angezeigt; der Kommentar wird dabei nicht gelöscht. Überlappende Markierungen werden unterstützt. Rollen und Erledigt-Status sind nicht enthalten.

Ausgeführt: `tests/autorenansicht-dom.cjs` mit jsdom (Kommentare, Antworten, sichere Serialisierung, Bildoptionen und Fehlerbehandlung, Textanker und zwei Speicher-/Ladezyklen).

Zusätzlicher Browsertest: `tests/autorenansicht.cjs` benötigt Playwright mit installiertem Chromium und prüft unter anderem zwei HTML-Speicherzyklen, Überlappungen, Antworten, Galerien, Druck-CSS und ausbleibende Netzabrufe. Der Browsertest konnte in der Entwicklungsumgebung nicht ausgeführt werden; der verfügbare Cloud-Browser erlaubt keine lokalen HTML-Dateien. Ein Test im echten SixCMS sowie Firefox/Safari steht noch aus. Die Druck-CSS-Regeln und der Aufruf des Druckdialogs sind per DOM-Test geprüft, das Seitenlayout noch nicht visuell.
