require("dotenv").config();
const aplicacion = require("./src/aplicacion");
const conectarBaseDatos = require("./src/configuracion/conexionBaseDatos");
const { configurarCloudinary } = require("./src/configuracion/cloudinary");

const puerto = Number(process.env.PORT || 3000);
const direccion = process.env.HOST || "0.0.0.0";

async function iniciarServidor() {
  configurarCloudinary();
  await conectarBaseDatos();
  aplicacion.listen(puerto, direccion, () => {
    console.log("API disponible en http://localhost:" + puerto);
  });
}

iniciarServidor().catch((fallo) => {
  console.error("No se pudo iniciar la API:", fallo.message);
  process.exit(1);
});

