/** The renderer cannot read the home directory, so the server part reports it. */
export declare const FileViewerRpc: {
    readonly id: "file-viewer";
    readonly methods: {
        readonly home: {
            readonly input: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly home: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                };
                readonly required: readonly ["home"];
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {};
};
