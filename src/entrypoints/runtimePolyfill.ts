// Runtime polyfill for bun:bundle (build-time macros)
// Must stay dependency-free so it can initialize globals before other modules evaluate.

if (typeof globalThis.MACRO === "undefined") {
    (globalThis as any).MACRO = {
        VERSION: "2.1.888",
        BUILD_TIME: new Date().toISOString(),
        FEEDBACK_CHANNEL: "",
        ISSUES_EXPLAINER: "",
        NATIVE_PACKAGE_URL: "",
        PACKAGE_URL: "",
        VERSION_CHANGELOG: "",
    };
}

(globalThis as any).BUILD_TARGET ??= "external";
(globalThis as any).BUILD_ENV ??= "production";
(globalThis as any).INTERFACE_TYPE ??= "stdio";

export {};
