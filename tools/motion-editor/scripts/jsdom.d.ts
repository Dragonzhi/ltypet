declare module "jsdom" {
  export interface JSDOMOptions {
    contentType?: string;
  }

  export class JSDOM {
    constructor(input?: string, options?: JSDOMOptions);
    readonly window: Window & typeof globalThis;
  }
}
