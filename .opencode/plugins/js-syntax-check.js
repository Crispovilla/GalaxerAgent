/**
 * js-syntax-check.js — plugin de opencode.
 *
 * Valida con `node --check` cualquier archivo .js/.mjs editado o escrito por la
 * herramienta `edit`/`write`. Si la sintaxis es inválida lanza un error con las
 * primeras líneas del diagnóstico, para que el agente lo vea de inmediato y corrija
 * antes de continuar (evita descubrir el error recién en la captura de pantalla).
 */
export const JsSyntaxCheck = async () => {
    return {
        "tool.execute.after": async (input, output) => {
            try {
                const tool = input?.tool;
                if (tool !== "edit" && tool !== "write") return;
                const filePath = output?.args?.filePath;
                if (!filePath || !/\.(js|mjs|cjs)$/i.test(filePath)) return;
                if (/node_modules|wwwroot[\\/]lib[\\/]/i.test(filePath)) return;

                const { spawnSync } = await import("node:child_process");
                const { existsSync } = await import("node:fs");
                if (!existsSync(filePath)) return;

                const res = spawnSync("node", ["--check", filePath], { encoding: "utf8" });
                if (res.status !== 0) {
                    const detalle = String(res.stderr || res.stdout || "error desconocido")
                        .split("\n")
                        .filter((l) => l.trim())
                        .slice(0, 6)
                        .join("\n");
                    throw new Error(`node --check falló en ${filePath}:\n${detalle}`);
                }
            } catch (e) {
                if (String(e?.message || "").startsWith("node --check")) throw e;
                /* node no disponible u otro error interno: no bloquear la edición */
            }
        },
    };
};
