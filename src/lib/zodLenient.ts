// Validation tolérante pour les sorties de modèle : un élément ou un champ invalide est écarté
// sans faire perdre tout le reste.
import { z } from "zod";

export function lenientList<T extends z.ZodTypeAny>(item: T, max: number) {
  return z
    .array(z.unknown())
    .transform((arr) => arr.flatMap((x) => { const r = item.safeParse(x); return r.success ? [r.data as z.infer<T>] : []; }).slice(0, max))
    .catch([] as Array<z.infer<T>>);
}

export const lenientStr = (max: number) => z.string().trim().min(1).transform((s) => s.slice(0, max)).nullable().catch(null);
