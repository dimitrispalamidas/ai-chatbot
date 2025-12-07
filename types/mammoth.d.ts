declare module 'mammoth' {
  interface Input {
    path?: string;
    buffer?: Buffer;
    arrayBuffer?: ArrayBuffer;
  }

  interface Options {
    styleMap?: string | Array<string>;
    includeEmbeddedStyleMap?: boolean;
    includeDefaultStyleMap?: boolean;
    convertImage?: any;
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
    externalFileAccess?: boolean;
    transformDocument?: (element: any) => any;
  }

  interface Result {
    value: string;
    messages: Array<{
      type: 'warning' | 'error';
      message: string;
      error?: unknown;
    }>;
  }

  interface Mammoth {
    convertToHtml: (input: Input, options?: Options) => Promise<Result>;
    extractRawText: (input: Input) => Promise<Result>;
    embedStyleMap: (input: Input, styleMap: string) => Promise<{
      toArrayBuffer: () => ArrayBuffer;
      toBuffer: () => Buffer;
    }>;
    images: {
      dataUri: any;
      imgElement: (f: (image: any) => Promise<{ src: string }>) => any;
    };
  }

  const mammoth: Mammoth;
  export = mammoth;
}

