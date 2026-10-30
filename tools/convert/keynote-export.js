// JXA: open one Keynote/PowerPoint file in Keynote, export a PDF and presenter notes, close without saving.
//   osascript -l JavaScript keynote-export.js <src> <out.pdf|-> <out.notes.json>
// Pass "-" as the PDF path to export notes only.

function run(argv) {
  const [src, pdf, notesPath] = argv;
  const keynote = Application('Keynote');
  keynote.includeStandardAdditions = true;
  const doc = keynote.open(Path(src));
  try {
    if (pdf !== '-') {
      keynote.export(doc, {
        to: Path(pdf),
        as: 'PDF',
        withProperties: { exportStyle: 'IndividualSlides', skippedSlides: false, pdfImageQuality: 'Best' },
      });
    }
    const notes = [];
    const slides = doc.slides();
    for (let i = 0; i < slides.length; i++) {
      if (slides[i].skipped()) continue;
      let text = '';
      try { text = slides[i].presenterNotes() || ''; } catch (e) { text = ''; }
      notes.push(text);
    }
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    const str = $.NSString.alloc.initWithUTF8String(JSON.stringify(notes));
    str.writeToFileAtomicallyEncodingError(notesPath, true, $.NSUTF8StringEncoding, null);
    return String(notes.length);
  } finally {
    doc.close({ saving: 'no' });
  }
}
