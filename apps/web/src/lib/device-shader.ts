import { SHADER_BACKGROUND_VARIANTS } from "#/components/motion/shader-background.tsx";
import type { ShaderBackgroundVariant } from "#/components/motion/shader-background.tsx";
import { SHARE_BACKGROUND_SHADER } from "#/lib/share-shaders.ts";

const deviceShaders = SHADER_BACKGROUND_VARIANTS.filter(
  (variant) => variant !== SHARE_BACKGROUND_SHADER
);

export function deviceShader(id: string): ShaderBackgroundVariant {
  let hash = 0;
  for (const character of id) {
    // Keep the hash within 32 bits so it stays an exact integer.
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 2 ** 32;
  }
  return deviceShaders[hash % deviceShaders.length] ?? "dot-grid";
}
