import path from "node:path";

// Folder of the local file backend. NMS_DATA_DIR (relative to the project or absolute) lets the test set and the tests use a separate one.
export function localDataPath(fileName: string) {
  return path.resolve(process.cwd(), process.env.NMS_DATA_DIR || "data", fileName);
}
