import type * as T from "./types";
export declare function create_bootstrap_emitter(documentation: T.Documentation): {
    load_browser_documentation: (browser: T.Browser) => Promise<void>;
    emit: (result?: unknown, options?: T.ObservationOptions & {
        browser?: T.Browser;
    }) => Promise<void>;
    rewrite_documentation: () => Promise<void>;
};
