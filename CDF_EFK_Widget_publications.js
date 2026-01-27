// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: file-alt;

/**
 * Widget CDF/EFK - Prochaines publications / Nächste Veröffentlichungen
 * Auto FR/DE (robuste) + possibilité de forcer via widgetParameter ("fr" ou "de")
 * Mise à jour quotidienne à 00h30
 */

const UPDATE_HOUR = 0;
const UPDATE_MINUTE = 30;

// Couleurs
const RED = new Color("#E30613");
const LIGHT_GRAY = new Color("#F5F5F5");
const TEXT_PRIMARY = new Color("#1A1A1A");
const TEXT_SECONDARY = new Color("#666666");

// --- Détection langue (ultra robuste) ---
const forced = (args.widgetParameter ? String(args.widgetParameter) : "").trim().toLowerCase(); // "fr" ou "de"

let preferred = [];
try { preferred = Device.preferredLanguages ? Device.preferredLanguages() : []; } catch (e) { preferred = []; }
preferred = (preferred || []).map(s => String(s).toLowerCase()); // ex: ["fr-ch", "fr", "de-ch", ...]

const lang = (Device.language && Device.language() ? Device.language() : "").toLowerCase();
const loc  = (Device.locale && Device.locale() ? Device.locale() : "").toLowerCase();

const primary = preferred[0] || lang || loc;

// Choix final
const isDE =
  forced === "de" ? true :
  forced === "fr" ? false :
  primary.startsWith("de");

// Config langue
const CFG = isDE
  ? {
      url: "https://www.efk.admin.ch/naechste-veroeffentlichungen/",
      idPrefix: "efk-",
      widgetTitle: "EFK – Nächste Veröffentlichungen",
      footerLabel: "Aktualisiert",
      emptyTitle: "Ohne Titel",
      emptyEntity: "Nicht angegeben",
      acceptLang: "de-CH,de;q=0.9",
      months: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
      formatDate: (d, m, y, months) => `${d}. ${months[m]} ${y}`,
      cacheKey: "efk_publications_cache_de",
      lastUpdateKey: "efk_last_update_de",
      footerLocale: "de-CH",
    }
  : {
      url: "https://www.efk.admin.ch/fr/prochaines-publications/",
      idPrefix: "cdf-",
      widgetTitle: "CDF – Prochaines publications",
      footerLabel: "Mis à jour",
      emptyTitle: "Sans titre",
      emptyEntity: "Non spécifié",
      acceptLang: "fr-CH,fr;q=0.9",
      months: ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"],
      formatDate: (d, m, y, months) => `${d} ${months[m]} ${y}`,
      cacheKey: "cdf_publications_cache_fr",
      lastUpdateKey: "cdf_last_update_fr",
      footerLocale: "fr-CH",
    };

// --- Mapping entités -> acronymes (FR / DE) ---
const ENTITY_MAP = {
  // DE
  "Staatssekretariat für Wirtschaft": "SECO",
  "Direktion für Entwicklung und Zusammenarbeit": "DEZA",
  "Staatsekretariat für Migration": "SEM",
  "Eidgenössische Finanzmarktaufsicht": "FINMA",
  "Eidgenössisches Departement für auswärtige Angelegenheiten": "EDA",
  "Eidgenössisches Departement des Inneren": "EDI",
  "Eidgenössisches Justiz- und Polizeidepartement": "EJPD",
  "Eidgenössisches Departement für Verteidigung, Bevölkerungsschutz und Sport": "VBS",
  "Eidgenössisches Finanzdepartement": "EFD",
  "Eidgenössisches Departement für Wirtschaft, Bildung und Forschung": "WBF",
  "Eidgenössisches Departement für Umwelt, Verkehr, Energie und Kommunikation": "UVEK",

  // FR
  "Secrétariat d’Etat à l’économie": "SECO",
  "Direction du développement et de la coopération": "DDC",
  "Secrétariat d'Etat aux migrations": "SEM",
  "Autorité fédérale de surveillance des marchés financiers": "FINMA",
  "Département fédéral des affaires étrangères": "DFAE",
  "Département fédéral de l’intérieur": "DFI",
  "Département fédéral de justice et police": "DFJP",
  "Département fédéral de la défense, de la protection de la population et des sports": "DDPS",
  "Département fédéral des finances": "DFF",
  "Département fédéral de l’économie, de la formation et de la recherche": "DEFR",
  "Département fédéral de l’environnement, des transports, de l’énergie et de la communication": "DETEC",
};

class PublicationsWidget {
  constructor(cfg) {
    this.cfg = cfg;
    this.fm = FileManager.local();
    this.cachePath = this.fm.joinPath(this.fm.documentsDirectory(), cfg.cacheKey + ".json");
    this.lastUpdatePath = this.fm.joinPath(this.fm.documentsDirectory(), cfg.lastUpdateKey + ".txt");
  }

  async run() {
    const widget = await this.createWidget();
    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      await widget.presentMedium();
    }
    Script.complete();
  }

  // Convertit "dd/mm/yyyy" -> Date (minuit)
  parseDMY(dateStr) {
    const parts = String(dateStr || "").split("/");
    if (parts.length !== 3) return null;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    if ([d, m, y].some(n => isNaN(n))) return null;
    return new Date(y, m, d, 0, 0, 0, 0);
  }

  // Filtre les publications déjà passées (date < aujourd’hui)
  filterOutPast(publications) {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

    return (publications || []).filter(pub => {
      const d = this.parseDMY(pub.date);
      // Si date illisible, on garde (prudence)
      if (!d) return true;
      return d >= todayMidnight;
    });
  }

  shouldUpdate() {
    if (!this.fm.fileExists(this.lastUpdatePath)) return true;

    const lastUpdate = new Date(this.fm.readString(this.lastUpdatePath));
    const now = new Date();

    // Mise à jour quotidienne à 00h30
    const todayUpdate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), UPDATE_HOUR, UPDATE_MINUTE);

    if (now >= todayUpdate && lastUpdate < todayUpdate) return true;
    if (!this.fm.fileExists(this.cachePath)) return true;

    return false;
  }

  loadFromCache() {
    if (this.fm.fileExists(this.cachePath)) {
      try {
        return JSON.parse(this.fm.readString(this.cachePath));
      } catch {
        return [];
      }
    }
    return [];
  }

  async fetchPublications() {
    try {
      const req = new Request(this.cfg.url);
      req.headers = {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept-Language": this.cfg.acceptLang,
      };

      const html = await req.loadString();
      if (!html || html.length === 0) return this.loadFromCache();

      const publications = this.parseHTML(html);

      if (publications.length > 0) {
        this.fm.writeString(this.cachePath, JSON.stringify(publications));
        this.fm.writeString(this.lastUpdatePath, new Date().toISOString());
      }

      return publications;
    } catch (e) {
      console.error("fetch error:", e);
      return this.loadFromCache();
    }
  }

  async getPublications() {
    const cached = this.loadFromCache();

    // IMPORTANT: on filtre aussi le cache pour basculer automatiquement après minuit
    const cachedFiltered = this.filterOutPast(cached);

    if (this.shouldUpdate() || cached.length === 0) {
      const fresh = await this.fetchPublications();
      return this.filterOutPast(fresh);
    }

    return cachedFiltered;
  }

 decodeHtmlEntities(str) {
  if (!str) return "";

  return String(str)
    // Entités HTML nommées
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")

    // Entités numériques correctes: &#8217;
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(parseInt(code, 10));
      } catch {
        return _;
      }
    })

    // Normalisation apostrophes typographiques
    .replace(/[’‘‛]/g, "'")
    .trim();
}

  parseHTML(html) {
    const pubs = [];
    const prefix = this.cfg.idPrefix; // "cdf-" ou "efk-"
    const idRe = new RegExp(prefix.replace("-", "\\-") + "(\\d{3,})", "gi");

    // IDs uniques
    const ids = [...html.matchAll(idRe)]
      .map((m) => `${prefix}${m[1]}`)
      .filter((v, i, a) => a.indexOf(v) === i);

    for (let i = 0; i < ids.length; i++) {
      const start = html.indexOf(ids[i]);
      const end = i + 1 < ids.length ? html.indexOf(ids[i + 1]) : html.length;
      const block = html.slice(start, end);

      // Titre: <h2>...</h2>
      let title = this.cfg.emptyTitle;
      const h2 = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (h2 && h2[1]) {
        const cleaned = this.decodeHtmlEntities(h2[1].replace(/<[^>]+>/g, "").trim());
        if (cleaned) title = cleaned;
      }

      // Date: dd/mm/yyyy - hh:mm => dd/mm/yyyy
      let date = "N/A";
      const dm = block.match(/(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})\s*-\s*\d{2}:\d{2}/);
      if (dm) date = `${dm[1]}/${dm[2]}/${dm[3]}`;

      // Entité: ligne après la date/heure, enlever le "/"
      let entity = this.cfg.emptyEntity;
      const textLines = block
        .replace(/<[^>]+>/g, "\n")
        .split("\n")
        .map((l) => this.decodeHtmlEntities(l).trim())
        .filter(Boolean);

      for (let j = 0; j < textLines.length - 1; j++) {
        if (/^\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}\s*-\s*\d{2}:\d{2}$/.test(textLines[j])) {
          const candidate = textLines[j + 1].replace(/\s*\/\s*$/, "").trim();
          if (candidate) entity = candidate;
          break;
        }
      }

      pubs.push({ title, auditNumber: ids[i], date, entity });
    }

    return pubs;
  }

  groupByDate(publications) {
    const grouped = {};
    publications.forEach((pub) => {
      if (!grouped[pub.date]) grouped[pub.date] = [];
      grouped[pub.date].push(pub);
    });

    const result = Object.keys(grouped).map((date) => ({ date, publications: grouped[date] }));
    result.sort((a, b) => {
      const dateA = new Date(a.date.split("/").reverse().join("-"));
      const dateB = new Date(b.date.split("/").reverse().join("-"));
      return dateA - dateB;
    });
    return result;
  }

  formatDate(dateStr) {
    const parts = String(dateStr || "").split("/");
    if (parts.length !== 3) return dateStr;

    const d = parts[0];
    const mIdx = parseInt(parts[1], 10) - 1;
    const y = parts[2];

    if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return dateStr;
    return this.cfg.formatDate(d, mIdx, y, this.cfg.months);
  }

  // --- Remplace certains noms d'entités par leur acronyme ---
normalizeEntity(entity) {
  if (!entity) return entity;

  // 1) On (re)décodage ici aussi (important pour le cache !)
  let clean = this.decodeHtmlEntities(String(entity));

  // 2) On convertit les apostrophes typographiques en apostrophe simple
  clean = clean.replace(/[’‘‛]/g, "'");

  // 3) Petit nettoyage
  clean = clean.replace(/\s*\/\s*$/, "").trim();

  return ENTITY_MAP[clean] || clean;
}

  async createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = LIGHT_GRAY;
    widget.url = this.cfg.url;

    // Mise en forme compacte (comme ta version parfaite)
    widget.setPadding(14, 14, 10, 14);

    const publications = await this.getPublications();
    if (publications.length === 0) return widget;

    // Header
    const header = widget.addText(this.cfg.widgetTitle);
    header.font = Font.boldSystemFont(14);
    header.textColor = RED;
    header.centerAlignText();

    widget.addSpacer(2);

    const separator = widget.addStack();
    separator.size = new Size(0, 1.2);
    separator.backgroundColor = RED;

    widget.addSpacer(3);

    // Première date seulement
    const grouped = this.groupByDate(publications);
    if (grouped.length > 0) {
      const dateGroup = grouped[0];

      const dateText = widget.addText(this.formatDate(dateGroup.date));
      dateText.font = Font.boldSystemFont(11);
      dateText.textColor = RED;

      widget.addSpacer(4);

      for (const pub of dateGroup.publications) {
        const stack = widget.addStack();
        stack.layoutVertically();

        // Retirer "cdf-" / "efk-" uniquement à l’affichage
        const auditClean = pub.auditNumber.replace(new RegExp("^" + this.cfg.idPrefix, "i"), "");

        const auditText = stack.addText(auditClean);
        auditText.font = Font.mediumSystemFont(9);
        auditText.textColor = TEXT_SECONDARY;

        stack.addSpacer(1);

        const titleText = stack.addText(pub.title);
        titleText.font = Font.semiboldSystemFont(10);
        titleText.textColor = TEXT_PRIMARY;
        titleText.lineLimit = 2;
        titleText.minimumScaleFactor = 0.85;

        stack.addSpacer(1);

        // ✅ Acronyme si mapping connu, sinon texte original
        const entityText = stack.addText(this.normalizeEntity(pub.entity));
        entityText.font = Font.systemFont(8);
        entityText.textColor = TEXT_SECONDARY;
        entityText.lineLimit = 1;
        entityText.minimumScaleFactor = 0.7;

        widget.addSpacer(4);
      }
    }

    widget.addSpacer();

    const lastUpdate = this.fm.fileExists(this.lastUpdatePath)
      ? new Date(this.fm.readString(this.lastUpdatePath))
      : new Date();

    const footer = widget.addText(
      `${this.cfg.footerLabel}: ${this.formatDate(lastUpdate.toLocaleDateString(this.cfg.footerLocale))}`
    );
    footer.font = Font.systemFont(7);
    footer.textColor = TEXT_SECONDARY;
    footer.centerAlignText();
    footer.minimumScaleFactor = 0.8;

    return widget;
  }
}

// Exécution
const widget = new PublicationsWidget(CFG);
await widget.run();
