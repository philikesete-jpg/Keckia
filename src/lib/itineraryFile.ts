/// <reference types="vite/client" />
export async function itineraryFileText(file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Choose a file under 12 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  let text = "";
  if (ext === "txt" || ext === "md") text = await file.text();
  else if (ext === "docx") {
    const { unzipSync, strFromU8 } = await import("fflate");
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) =>
        f.name === "word/document.xml" && f.originalSize <= 6_000_000,
    });
    if (!entries["word/document.xml"])
      throw new Error(
        "The Word document has no readable main text or is too large.",
      );
    const xml = new DOMParser().parseFromString(
      strFromU8(entries["word/document.xml"]),
      "application/xml",
    );
    text = Array.from(xml.getElementsByTagNameNS("*", "p"), (p) =>
      Array.from(p.getElementsByTagNameNS("*", "t"), (t) => t.textContent).join(
        "",
      ),
    ).join("\n");
  } else if (ext === "pdf") {
    const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdf.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdf.getDocument({
      data: await file.arrayBuffer(),
      isEvalSupported: false,
    }).promise;
    try {
      if (doc.numPages > 100)
        throw new Error("Choose a PDF with at most 100 pages.");
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        text +=
          content.items
            .map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : ""))
            .join("") + "\n";
      }
    } finally {
      await doc.destroy();
    }
  } else throw new Error("Choose PDF, Word (.docx), Markdown or plain text.");
  if (!text.trim())
    throw new Error(
      "This file has no readable text. Paste the itinerary or upload a text-based copy.",
    );
  if (text.length > 120000)
    throw new Error("Please use an itinerary shorter than 120,000 characters.");
  return text.trim();
}
