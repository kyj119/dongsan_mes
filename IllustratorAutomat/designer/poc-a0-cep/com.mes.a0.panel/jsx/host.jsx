#target illustrator
// MES A0 CEP panel PoC — ExtendScript host bridge.
// ES3-compatible only (CEP's ExtendScript engine): no arrow functions, no const/let.

function mesA0_getDocInfo() {
  if (app.documents.length === 0) {
    return "(none)";
  }
  var doc = app.activeDocument;
  return doc.name;
}
