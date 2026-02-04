// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: cloud-download-alt;

/**
 * Loader CDF/EFK - Charge le widget depuis GitHub
 * Placez ce fichier dans Scriptable, il téléchargera toujours la dernière version
 */

const GITHUB_RAW_URL = "https://raw.githubusercontent.com/ArnaudBon20/EFK_publications/main/CDF_EFK_Widget_publications.js";

async function loadAndRun() {
  try {
    const req = new Request(GITHUB_RAW_URL);
    req.headers = { "Cache-Control": "no-cache" };
    const code = await req.loadString();
    
    if (!code || code.length < 100) {
      throw new Error("Code invalide ou vide");
    }
    
    // Wrapper le code dans une fonction async pour supporter top-level await
    const asyncWrapper = `(async () => { ${code} })()`;
    await eval(asyncWrapper);
    
  } catch (error) {
    // En cas d'erreur, afficher un widget d'erreur
    const widget = new ListWidget();
    widget.backgroundColor = new Color("#E30613");
    
    const title = widget.addText("⚠️ Erreur de chargement");
    title.font = Font.boldSystemFont(14);
    title.textColor = Color.white();
    
    widget.addSpacer(8);
    
    const msg = widget.addText(error.message);
    msg.font = Font.systemFont(12);
    msg.textColor = Color.white();
    
    Script.setWidget(widget);
    widget.presentMedium();
  }
}

await loadAndRun();
Script.complete();
