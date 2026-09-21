/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Les actions serveur refusaient tout fichier > 1 Mo (facture PDF scannée). Vercel plafonne la charge utile à ~4,5 Mo.
    serverActions: { bodySizeLimit: "4mb" },
  },
};
module.exports = nextConfig;
