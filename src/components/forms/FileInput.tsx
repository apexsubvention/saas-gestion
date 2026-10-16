"use client";

// Champ fichier avec vérification de taille AVANT l'envoi (Jade) : au-delà de ~4 Mo, l'hébergeur
// (Vercel) refuse la requête et le navigateur affichait « Application error: a client-side
// exception ». Ici, un fichier trop lourd est refusé tout de suite, avec un message clair, et le
// formulaire ne part pas (validation native du navigateur via setCustomValidity).
import { useState, type InputHTMLAttributes } from "react";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // = serverActions.bodySizeLimit (next.config.js)

export function FileInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [error, setError] = useState<string | null>(null);
  const { onChange, className, ...rest } = props;
  return (
    <>
      <input
        {...rest}
        type="file"
        className={className}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          const tooBig = file && file.size > MAX_UPLOAD_BYTES;
          const message = tooBig
            ? `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} Mo) : 4 Mo maximum. Compresse le PDF (ex. ilovepdf.com) ou envoie-le en plusieurs parties.`
            : "";
          e.currentTarget.setCustomValidity(message);
          setError(message || null);
          onChange?.(e);
        }}
      />
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </>
  );
}
