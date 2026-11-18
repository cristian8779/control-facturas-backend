const cloudinary = require("cloudinary").v2;

function configurarCloudinary() {
  const nombreNube = process.env.CLOUDINARY_CLOUD_NAME;
  const claveApi = process.env.CLOUDINARY_API_KEY;
  const secretoApi = process.env.CLOUDINARY_API_SECRET;

  if (!nombreNube || !claveApi || !secretoApi) {
    throw new Error("Faltan las variables de Cloudinary en el archivo .env.");
  }

  cloudinary.config({
    cloud_name: nombreNube,
    api_key: claveApi,
    api_secret: secretoApi,
    secure: true,
  });
}

module.exports = { cloudinary, configurarCloudinary };
