declare module "https://*";
declare module "npm:*";
declare module "jsr:*";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    toObject(): Record<string, string>;
  };
  serve: any;
  test: any;
  [key: string]: any;
};
