import './runtimePolyfill.js'

process.env.COREPACK_ENABLE_AUTO_PIN = "0";
process.env.CLAUDE_CODE_ENTRYPOINT ??= "sdk-py";

export {};

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (
        args.length === 1 &&
        (args[0] === "--version" || args[0] === "-v" || args[0] === "-V")
    ) {
        console.log(`${MACRO.VERSION} (Hare Code SDK Python Runner)`);
        return;
    }

    const { main: cliMain } = await import("../main.jsx");
    await cliMain();
}

void main();
