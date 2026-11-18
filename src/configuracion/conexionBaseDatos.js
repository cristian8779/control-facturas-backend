const mongoose = require("mongoose");

async function conectarBaseDatos() {
  const cadenaConexion = process.env.MONGODB_URI;
  if (!cadenaConexion) {
    throw new Error("Falta MONGODB_URI. Revisa el archivo .env del backend.");
  }

  await mongoose.connect(cadenaConexion, { serverSelectionTimeoutMS: 10000 });
  console.log("Conexión con MongoDB Atlas establecida.");
}

module.exports = conectarBaseDatos;
