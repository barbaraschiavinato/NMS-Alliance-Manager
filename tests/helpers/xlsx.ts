import { strFromU8, unzipSync } from "fflate";
import { expect } from "vitest";

function unescapeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export async function readWorkbook(response: Response) {
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const rows = [...sheet.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)].map(([, rowNumber, cells]) => {
    const values = [
      ...cells.matchAll(/<c r="([A-Z]+)(\d+)" t="inlineStr"><is><t xml:space="preserve">([\s\S]*?)<\/t><\/is><\/c>/g),
    ];
    for (const [, , cellRow] of values) expect(cellRow).toBe(rowNumber);
    return values.map(([, , , text]) => unescapeXml(text));
  });
  return { files, sheet, rows };
}
