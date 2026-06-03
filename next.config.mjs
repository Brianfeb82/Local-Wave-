/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: "export",
  basePath: isProd ? "/Local-Wave-" : "",
  assetPrefix: isProd ? "/Local-Wave-/" : "", // Ditambah / di akhir khusus untuk aset CSS/JS
  trailingSlash: true,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
