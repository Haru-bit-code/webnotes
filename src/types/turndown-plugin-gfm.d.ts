declare module "turndown-plugin-gfm" {
  import TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
}

declare module "mammoth/mammoth.browser" {
  type Img = { contentType: string; read: (enc?: string) => Promise<ArrayBuffer> };
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }, opts?: { convertImage?: unknown }): Promise<{ value: string; messages: unknown[] }>;
    images: { imgElement(f: (img: Img) => Promise<{ src: string }>): unknown };
  };
  export default mammoth;
}
