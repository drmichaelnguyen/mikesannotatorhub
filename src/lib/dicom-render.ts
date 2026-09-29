import * as dicomParser from "dicom-parser";

const UNCOMPRESSED_TRANSFER_SYNTAXES = new Set([
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2.2",
]);

export type DicomRenderResult =
  | { ok: true; width: number; height: number; imageData: ImageData }
  | { ok: false; error: string };

function readNumberArray(dataSet: dicomParser.DataSet, tag: string): number[] {
  const raw = dataSet.string(tag);
  if (!raw) return [];
  return raw
    .split("\\")
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n));
}

export function renderDicomToImageData(buffer: ArrayBuffer): DicomRenderResult {
  try {
    const byteArray = new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    const transferSyntax = dataSet.string("x00020010") || "1.2.840.10008.1.2";
    if (!UNCOMPRESSED_TRANSFER_SYNTAXES.has(transferSyntax)) {
      return {
        ok: false,
        error: "This DICOM file uses compressed pixels and cannot be previewed yet.",
      };
    }

    const rows = dataSet.uint16("x00280010");
    const columns = dataSet.uint16("x00280011");
    if (!rows || !columns) {
      return { ok: false, error: "DICOM image size is missing." };
    }

    const bitsAllocated = dataSet.uint16("x00280100") || 16;
    const pixelRepresentation = dataSet.uint16("x00280103") || 0;
    const samplesPerPixel = dataSet.uint16("x00280002") || 1;
    const planarConfig = dataSet.uint16("x00280006") || 0;
    const photometric = (dataSet.string("x00280004") || "MONOCHROME2").toUpperCase();
    const slope = Number(dataSet.string("x00281053") || "1") || 1;
    const intercept = Number(dataSet.string("x00281052") || "0") || 0;

    const pixelElement = dataSet.elements.x7fe00010;
    if (!pixelElement) {
      return { ok: false, error: "DICOM pixel data is missing." };
    }

    const pixelBytes = new Uint8Array(
      dataSet.byteArray.buffer,
      dataSet.byteArray.byteOffset + pixelElement.dataOffset,
      pixelElement.length,
    );

    const expectedSamples = rows * columns * samplesPerPixel;
    const imageData = new ImageData(columns, rows);
    const rgba = imageData.data;

    if (samplesPerPixel === 3 && (photometric === "RGB" || photometric.startsWith("YBR"))) {
      if (bitsAllocated !== 8) {
        return { ok: false, error: "Only 8-bit RGB DICOM is supported." };
      }
      if (pixelBytes.length < expectedSamples) {
        return { ok: false, error: "DICOM pixel data is truncated." };
      }
      for (let i = 0; i < rows * columns; i++) {
        let r: number;
        let g: number;
        let b: number;
        if (planarConfig === 1) {
          r = pixelBytes[i]!;
          g = pixelBytes[i + rows * columns]!;
          b = pixelBytes[i + 2 * rows * columns]!;
        } else {
          const o = i * 3;
          r = pixelBytes[o]!;
          g = pixelBytes[o + 1]!;
          b = pixelBytes[o + 2]!;
        }
        const o4 = i * 4;
        rgba[o4] = r;
        rgba[o4 + 1] = g;
        rgba[o4 + 2] = b;
        rgba[o4 + 3] = 255;
      }
      return { ok: true, width: columns, height: rows, imageData };
    }

    const bytesPerSample = bitsAllocated <= 8 ? 1 : 2;
    if (pixelBytes.length < rows * columns * bytesPerSample) {
      return { ok: false, error: "DICOM pixel data is truncated." };
    }

    const values = new Float32Array(rows * columns);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const view =
      bytesPerSample === 1
        ? null
        : new DataView(pixelBytes.buffer, pixelBytes.byteOffset, pixelBytes.byteLength);

    for (let i = 0; i < rows * columns; i++) {
      let raw: number;
      if (bytesPerSample === 1) {
        raw = pixelBytes[i]!;
      } else {
        raw =
          pixelRepresentation === 1
            ? view!.getInt16(i * 2, true)
            : view!.getUint16(i * 2, true);
      }
      const hu = raw * slope + intercept;
      values[i] = hu;
      if (hu < min) min = hu;
      if (hu > max) max = hu;
    }

    const windowValues = readNumberArray(dataSet, "x00281051");
    const centerValues = readNumberArray(dataSet, "x00281050");
    let windowWidth = windowValues[0];
    let windowCenter = centerValues[0];
    if (!windowWidth || windowWidth <= 0 || windowCenter == null || !Number.isFinite(windowCenter)) {
      windowWidth = Math.max(max - min, 1);
      windowCenter = min + windowWidth / 2;
    }

    const invert = photometric === "MONOCHROME1";
    const c = windowCenter;
    const w = windowWidth;
    const low = c - w / 2;
    const high = c + w / 2;

    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      let gray: number;
      if (v <= low) gray = 0;
      else if (v >= high) gray = 255;
      else gray = Math.round(((v - low) / w) * 255);
      if (invert) gray = 255 - gray;
      const o = i * 4;
      rgba[o] = gray;
      rgba[o + 1] = gray;
      rgba[o + 2] = gray;
      rgba[o + 3] = 255;
    }

    return { ok: true, width: columns, height: rows, imageData };
  } catch {
    return { ok: false, error: "Could not parse this DICOM file." };
  }
}

export function paintDicomOnCanvas(canvas: HTMLCanvasElement, imageData: ImageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.putImageData(imageData, 0, 0);
}
