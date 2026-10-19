import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  ProductSpecFlowStore,
  type CreateProductSpecFlowOptions,
  type ProductSpecFlow,
} from "./product-spec.js";

export class JsonProductSpecFlowStore extends ProductSpecFlowStore {
  constructor(private readonly filePath: string) {
    super(loadFlows(filePath));
  }

  override create(options: CreateProductSpecFlowOptions): ProductSpecFlow {
    return this.mutate(() => super.create(options));
  }

  override approve(token: string): ProductSpecFlow | undefined {
    return this.mutate(() => super.approve(token));
  }

  protected override onMutate(): void {
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(this.snapshot(), null, 2)}\n`,
      "utf8",
    );
    renameSync(temporaryPath, this.filePath);
  }
}

function loadFlows(filePath: string): ProductSpecFlow[] {
  let rows: unknown;
  try {
    rows = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is ProductSpecFlow =>
      typeof row === "object"
      && row !== null
      && typeof (row as ProductSpecFlow).token === "string"
      && typeof (row as ProductSpecFlow).sessionId === "string",
  );
}
