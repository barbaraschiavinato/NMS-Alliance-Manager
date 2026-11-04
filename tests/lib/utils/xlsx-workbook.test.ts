// @vitest-environment jsdom
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildWorkbook, workbookContentType } from "@/lib/utils/xlsx-workbook";

describe("buildWorkbook", () => {
  it("produces well-formed XML, escaping sheet and cell text while preserving valid Unicode", () => {
    const value = " =SUM(1,1)\n<&>\"'\t\u0001\uFFFE\uD800\uE000🚀 ";
    const workbook = buildWorkbook({
      sheetName: 'Farm & <test> "O\'Brien"',
      headers: ["Name", "Formula"],
      rows: [[value, "=2+2"]],
      widths: [20, 35],
    });
    const files = unzipSync(workbook);
    const parser = new DOMParser();

    for (const [name, contents] of Object.entries(files)) {
      const document = parser.parseFromString(strFromU8(contents), "application/xml");
      expect(document.getElementsByTagName("parsererror"), name).toHaveLength(0);
    }

    const workbookXml = parser.parseFromString(strFromU8(files["xl/workbook.xml"]), "application/xml");
    expect(workbookXml.getElementsByTagName("sheet")[0].getAttribute("name")).toBe('Farm & <test> "O\'Brien"');

    const sheet = parser.parseFromString(strFromU8(files["xl/worksheets/sheet1.xml"]), "application/xml");
    const cells = sheet.getElementsByTagName("c");
    expect(cells).toHaveLength(4);
    expect(cells[2].getAttribute("r")).toBe("A2");
    expect(cells[2].getAttribute("t")).toBe("inlineStr");
    expect(cells[2].textContent).toBe(" =SUM(1,1)\n<&>\"'\t\uE000🚀 ");
    expect(cells[3].textContent).toBe("=2+2");
    expect(sheet.getElementsByTagName("f")).toHaveLength(0);
    const columns = sheet.getElementsByTagName("col");
    expect(columns).toHaveLength(2);
    expect(columns[0].getAttribute("width")).toBe("20");
    expect(columns[1].getAttribute("min")).toBe("2");
    expect(columns[1].getAttribute("width")).toBe("35");
    expect(workbookContentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("uses Excel column labels beyond Z and ZZ", () => {
    const headers = Array.from({ length: 703 }, (_, index) => `Column ${index + 1}`);
    const workbook = buildWorkbook({ sheetName: "Wide", headers, rows: [], widths: [] });
    const sheet = strFromU8(unzipSync(workbook)["xl/worksheets/sheet1.xml"]);

    expect(sheet).toContain('<c r="Z1" t="inlineStr">');
    expect(sheet).toContain('<c r="AA1" t="inlineStr">');
    expect(sheet).toContain('<c r="ZZ1" t="inlineStr">');
    expect(sheet).toContain('<c r="AAA1" t="inlineStr">');
  });
});
