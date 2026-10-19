// Téléchargement d'un fichier renvoyé par une action serveur (base64) -- côté navigateur.
export function downloadBase64(base64: string, filename: string, mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
